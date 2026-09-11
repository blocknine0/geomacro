#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const base = (process.env.GEOMACRO_GOAT_PILOT_BASE_URL || "").replace(/\/$/, "");
const accessToken = process.env.GEOMACRO_GOAT_PILOT_ACCESS_TOKEN || "";
const clientRequestId = process.env.GEOMACRO_GOAT_CLIENT_REQUEST_ID || "";
const payerAddress = (process.env.GEOMACRO_GOAT_TEST_PAYER_ADDRESS || "").toLowerCase();
const expectedTxHash = (process.env.GEOMACRO_GOAT_EXPECTED_TX_HASH || "").toLowerCase();
const artifactDir = resolve(
  process.env.GEOMACRO_GOAT_E2E_ARTIFACT_DIR || "artifacts/goat-testnet3-paid-artifact-replay",
);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validAddress(value) {
  return /^0x[a-f0-9]{40}$/.test(value);
}

function validTxHash(value) {
  return /^0x[a-f0-9]{64}$/.test(value);
}

async function jsonRequest(path, body, auth = true) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      ...(auth ? { authorization: `Bearer ${accessToken}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(text);
    fail(`${path} returned non-JSON status ${response.status}.`);
  }

  if (!response.ok) {
    console.error(JSON.stringify(parsed, null, 2));
    fail(`${path} returned status ${response.status}.`);
  }

  return { status: response.status, body: parsed };
}

function redactedEvidence(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (/secret|private[_-]?key|authorization|access[_-]?token/i.test(key)) {
        return "[REDACTED]";
      }
      return item;
    }),
  );
}

async function main() {
  assert(base, "GEOMACRO_GOAT_PILOT_BASE_URL is required.");
  assert(accessToken.length >= 32, "Pilot access token is missing.");
  assert(clientRequestId.length > 0, "Client request ID is required.");
  assert(validAddress(payerAddress), "Payer address is invalid.");
  assert(validTxHash(expectedTxHash), "Expected Testnet3 transaction hash is invalid.");

  const artifact = await jsonRequest(
    "/api/goat/pilot/artifact",
    {
      client_request_id: clientRequestId,
      payer_address: payerAddress,
    },
    true,
  );

  assert(artifact.body?.ok === true, "Paid artifact endpoint did not return ok=true.");
  assert(artifact.body?.state === "DELIVERED", "Paid artifact is not delivered.");
  assert(artifact.body?.environment === "testnet3", "Paid artifact is not GOAT Testnet3 evidence.");
  assert(artifact.body?.execution_authorized === false, "Paid artifact violated execution boundary.");
  assert(artifact.body?.payment?.commercial_revenue === false, "Testnet evidence was incorrectly marked as revenue.");
  assert(
    String(artifact.body?.payment?.transaction_hash || "").toLowerCase() === expectedTxHash,
    "Paid artifact transaction hash does not match the already-submitted Testnet3 transfer.",
  );
  assert(artifact.body?.risk_object, "Paid artifact did not return the canonical Risk Object.");
  assert(
    artifact.body?.verification?.valid === true,
    "Canonical paid Risk Object was not valid at fulfillment time.",
  );
  assert(
    artifact.body?.verification?.cryptographic_valid === true,
    "Canonical paid Risk Object was not cryptographically valid at fulfillment time.",
  );
  assert(
    artifact.body?.verification?.fresh === true,
    "Canonical paid Risk Object was not fresh at fulfillment time.",
  );

  const publicVerification = await jsonRequest(
    "/api/risk-object-keys",
    { risk_object: artifact.body.risk_object },
    false,
  );

  assert(publicVerification.body?.ok === true, "Public verification endpoint did not return ok=true.");

  const currentVerification = publicVerification.body?.verification;
  assert(
    currentVerification?.cryptographic_valid === true,
    "Canonical paid Risk Object did not pass current cryptographic verification.",
  );
  assert(
    currentVerification?.contract_valid === true,
    "Canonical paid Risk Object did not pass current contract verification.",
  );

  const currentlyValid =
    currentVerification?.valid === true &&
    currentVerification?.fresh === true;

  const validHistoricalExpiry =
    currentVerification?.valid === false &&
    currentVerification?.status === "EXPIRED" &&
    currentVerification?.fresh === false &&
    Array.isArray(currentVerification?.reason_codes) &&
    currentVerification.reason_codes.includes("artifact_expired");

  assert(
    currentlyValid || validHistoricalExpiry,
    "Canonical paid Risk Object has an unexpected current verification state.",
  );

  await mkdir(artifactDir, { recursive: true });
  const path = resolve(artifactDir, `${clientRequestId}-canonical-paid-artifact.json`);
  await writeFile(
    path,
    `${JSON.stringify(
      redactedEvidence({
        verified_at: new Date().toISOString(),
        client_request_id: clientRequestId,
        payer_address: payerAddress,
        expected_transaction_hash: expectedTxHash,
        paid_artifact: artifact.body,
        public_verification: publicVerification.body,
        assertions: {
          existing_payment_reused: true,
          no_second_payment_submitted: true,
          exact_transaction_matched: true,
          canonical_risk_object_delivered: true,
          public_machine_verification_passed: true,
          cryptographic_verification_passed: true,
          execution_authorized_false: true,
          testnet_not_revenue: true,
        },
      }),
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log("✅ Existing GOAT Testnet3 payment entitlement reused. No second payment submitted.");
  console.log(`✅ Transaction matched: ${expectedTxHash}`);
  console.log("✅ Canonical signed Risk Object delivered after paid entitlement check.");
  console.log("✅ Public machine and cryptographic verification passed.");
  console.log("✅ execution_authorized=false preserved.");
  console.log(`Evidence: ${path}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
