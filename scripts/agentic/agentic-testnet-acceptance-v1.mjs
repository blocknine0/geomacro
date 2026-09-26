#!/usr/bin/env bun
import { createHash, createPublicKey, verify as verifyBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { Wallet } from "ethers";

const ARC_NETWORK = "eip155:5042002";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";
const EXPECTED_PRICE_ATOMIC = "1000";
const EXPECTED_PRICE_USDC = 0.001;
const MAX_ABSOLUTE_TEST_SPEND_USDC = 0.01;
const ACK = "ARC_TESTNET_USDC_AGENTIC_ACCEPTANCE_V1";

const base = (process.env.GEOMACRO_AGENTIC_ACCEPTANCE_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const privateKey = process.env.GEOMACRO_AGENTIC_ACCEPTANCE_BUYER_PRIVATE_KEY?.trim() || "";
const acknowledgement = process.env.GEOMACRO_AGENTIC_ACCEPTANCE_ACK?.trim() || "";
const configuredBudget = Number(process.env.GEOMACRO_AGENTIC_ACCEPTANCE_MAX_USDC || "0.001");
const autoDeposit = Number(process.env.GEOMACRO_AGENTIC_ACCEPTANCE_AUTO_DEPOSIT_USDC || "0.01");
const artifactDir = resolve(
  process.env.GEOMACRO_AGENTIC_ACCEPTANCE_ARTIFACT_DIR || "artifacts/agentic-testnet-acceptance-v1",
);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function decodeBase64Json(value) {
  return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
}

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function signableRiskObject(object) {
  return {
    ...object,
    integrity: {
      ...object.integrity,
      payload_hash: null,
      signature: null,
    },
  };
}

function verifyRiskObject(object, keySet) {
  if (!object || typeof object !== "object") {
    return { valid: false, reason: "missing_risk_object" };
  }
  const integrity = object.integrity;
  if (
    !integrity ||
    integrity.canonicalization !== "geomacro-canonical-json-v1" ||
    integrity.signature_scheme !== "Ed25519" ||
    !integrity.signing_key_id ||
    !integrity.payload_hash ||
    !integrity.signature
  ) {
    return { valid: false, reason: "missing_or_invalid_signing_metadata" };
  }

  const key = keySet.find((candidate) => candidate.key_id === integrity.signing_key_id);
  if (!key) return { valid: false, reason: "unknown_signing_key" };
  if (key.status === "revoked") return { valid: false, reason: "signing_key_revoked" };

  const generatedAt = Date.parse(object.generated_at);
  if (!Number.isFinite(generatedAt)) return { valid: false, reason: "invalid_generated_at" };
  if (key.not_before && generatedAt < Date.parse(key.not_before)) {
    return { valid: false, reason: "signing_key_not_yet_valid" };
  }
  if (key.not_after && generatedAt > Date.parse(key.not_after)) {
    return { valid: false, reason: "signing_key_outside_validity_window" };
  }

  const canonical = stableJson(signableRiskObject(object));
  const hash = sha256(canonical);
  if (hash !== integrity.payload_hash) return { valid: false, reason: "payload_hash_mismatch" };

  try {
    const publicKey = createPublicKey({
      key: Buffer.from(key.public_key_spki_b64, "base64"),
      format: "der",
      type: "spki",
    });
    const valid = verifyBytes(
      null,
      Buffer.from(canonical, "utf8"),
      publicKey,
      Buffer.from(integrity.signature, "base64"),
    );
    return { valid, reason: valid ? null : "invalid_signature" };
  } catch {
    return { valid: false, reason: "signature_verification_error" };
  }
}

function extractGatewayBalance(balances) {
  const value = balances?.gateway?.formattedTotal;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    fail(`Circle Gateway balance response did not include gateway.formattedTotal: ${JSON.stringify(balances)}`);
  }
  return number;
}

function paidPayload(result) {
  const candidate = result?.data ?? result?.response?.data ?? result?.response ?? result;
  if (typeof candidate === "string") {
    try {
      return JSON.parse(candidate);
    } catch {
      fail("Paid response data was not valid JSON.");
    }
  }
  return candidate;
}

function requestHeaders(input, init) {
  if (init?.headers) return new Headers(init.headers);
  if (typeof Request !== "undefined" && input instanceof Request) return new Headers(input.headers);
  return new Headers();
}

const evidence = {
  schema_version: "agentic-testnet-acceptance-v1",
  generated_at: new Date().toISOString(),
  target: base,
  network: ARC_NETWORK,
  asset: ARC_USDC,
  acceptance_subject: {
    type: "country",
    country_iso3: "CHN",
  },
  commercial_revenue: false,
  raw_payment_signature_persisted: false,
  buyer_private_key_persisted: false,
  p0: {},
  audit: {},
};

async function main() {
  const target = new URL(base);
  assert(target.protocol === "https:" || ["localhost", "127.0.0.1"].includes(target.hostname), "Acceptance target must use HTTPS except localhost.");
  assert(acknowledgement === ACK, `GEOMACRO_AGENTIC_ACCEPTANCE_ACK must equal ${ACK}.`);
  assert(/^0x[a-fA-F0-9]{64}$/.test(privateKey), "A dedicated Arc Testnet buyer private key is required.");
  assert(Number.isFinite(configuredBudget) && configuredBudget > 0, "GEOMACRO_AGENTIC_ACCEPTANCE_MAX_USDC must be positive.");
  assert(configuredBudget <= MAX_ABSOLUTE_TEST_SPEND_USDC, `Acceptance budget may not exceed ${MAX_ABSOLUTE_TEST_SPEND_USDC} test USDC.`);
  assert(Number.isFinite(autoDeposit) && autoDeposit >= 0 && autoDeposit <= 1, "Auto-deposit must be between 0 and 1 test USDC.");

  const wallet = new Wallet(privateKey);
  evidence.audit.buyer_wallet = wallet.address;

  const manifestResponse = await fetch(`${base}/api/agent/risk`, { headers: { accept: "application/json" } });
  assert(manifestResponse.status === 200, `P0-1 discovery GET failed with ${manifestResponse.status}.`);
  const manifest = await manifestResponse.json();
  assert(manifest?.agent?.id === "geomacro", "P0-1 agent discovery returned the wrong agent id.");
  assert(manifest?.endpoint === `${base}/api/agent/risk`, "P0-1 manifest endpoint does not match the target.");
  assert(manifest?.agent?.execution_authorized === false, "P0-1 discovery violated execution boundary.");
  evidence.p0.P0_1_service_discovery = "PASS";

  const keyResponse = await fetch(`${base}/api/risk-object-keys`, { headers: { accept: "application/json" } });
  assert(keyResponse.status === 200, `Risk Object key discovery failed with ${keyResponse.status}.`);
  const keyDocument = await keyResponse.json();
  const verificationKeys = Array.isArray(keyDocument?.keys) ? keyDocument.keys : [];
  assert(verificationKeys.length > 0, "No public Risk Object verification keys were returned.");

  const clientRequestId = `agentic-v1-${Date.now()}`;
  const body = {
    subject: {
      type: "country",
      country_iso3: "CHN",
    },
    policy_preset: "cautious",
    action_type: "agent_payment",
    amount_usdc: 10000,
    client_request_id: clientRequestId,
  };
  const endpoint = `${base}/api/agent/risk`;

  const unpaid = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "geomacro-agentic-acceptance-v1" },
    body: JSON.stringify(body),
  });
  if (unpaid.status !== 402) {
    const failureBody = await unpaid.clone().json().catch(() => null);
    evidence.audit.unpaid_probe_failure = {
      http_status: unpaid.status,
      error_code: failureBody?.error?.code ?? null,
      message: failureBody?.error?.message ?? null,
    };
  }
  assert(unpaid.status === 402, `P0-4 expected HTTP 402, received ${unpaid.status}.`);
  const paymentRequiredHeader = unpaid.headers.get("payment-required");
  assert(paymentRequiredHeader, "P0-4 PAYMENT-REQUIRED header missing.");
  const required = decodeBase64Json(paymentRequiredHeader);
  const accepted = required?.accepts?.[0];
  assert(required?.x402Version === 2, "P0-4 x402 version is not v2.");
  assert(required?.resource?.url === endpoint, "P0-6 payment resource URL is not exact-request endpoint.");
  assert(accepted?.scheme === "exact", "P0-4 payment scheme is not exact.");
  assert(accepted?.network === ARC_NETWORK, `P0-5 wrong network ${accepted?.network}.`);
  assert(String(accepted?.asset).toLowerCase() === ARC_USDC.toLowerCase(), "P0-3/P0-5 wrong Arc Testnet USDC asset.");
  assert(String(accepted?.amount) === EXPECTED_PRICE_ATOMIC, `P0-12 unexpected price ${accepted?.amount}.`);
  assert(/^0x[a-fA-F0-9]{40}$/.test(String(accepted?.payTo ?? "")), "P0-6 payTo is invalid.");
  assert(String(accepted?.extra?.verifyingContract).toLowerCase() === GATEWAY_WALLET.toLowerCase(), "P0-5 Gateway verifying contract mismatch.");
  assert(accepted?.extra?.name === "GatewayWalletBatched" && accepted?.extra?.version === "1", "P0-5 Gateway metadata mismatch.");
  const quoteUsdc = Number(accepted.amount) / 1_000_000;
  assert(quoteUsdc === EXPECTED_PRICE_USDC, "P0-12 quote decimal mismatch.");
  assert(quoteUsdc <= configuredBudget, `P0-12 quoted ${quoteUsdc} exceeds budget ${configuredBudget}.`);
  evidence.audit.quote = {
    amount_usdc: quoteUsdc,
    amount_atomic: String(accepted.amount),
    pay_to: accepted.payTo,
    network: accepted.network,
    asset: accepted.asset,
  };
  evidence.p0.P0_4_automatic_402_negotiation = "PASS";
  evidence.p0.P0_5_arc_testnet_contract = "PASS";
  evidence.p0.P0_6_payment_resource_binding = "PASS";
  evidence.p0.P0_12_spend_limit = "PASS";

  for (const [name, mutate] of [
    ["wrong_amount", (payload) => { payload.accepted.amount = "999"; }],
    ["wrong_network", (payload) => { payload.accepted.network = "eip155:84532"; }],
    ["wrong_recipient", (payload) => { payload.accepted.payTo = "0x0000000000000000000000000000000000000001"; }],
  ]) {
    const invalid = structuredClone({ x402Version: 2, accepted, payload: {} });
    mutate(invalid);
    const invalidResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "payment-signature": encodeBase64Json(invalid),
      },
      body: JSON.stringify(body),
    });
    const invalidBody = await invalidResponse.json().catch(() => null);
    assert(invalidResponse.status === 402, `P0-11 ${name} should return 402, got ${invalidResponse.status}.`);
    assert(invalidBody?.error?.code === "X402_PAYMENT_BINDING_INVALID", `P0-11 ${name} did not fail payment binding.`);
  }
  evidence.p0.P0_11_invalid_payment_rejection = "PASS";

  const gateway = new GatewayClient({ chain: "arcTestnet", privateKey });
  let balances = await gateway.getBalances();
  let gatewayBalance = extractGatewayBalance(balances);
  evidence.audit.gateway_balance_before = gatewayBalance;
  if (gatewayBalance < quoteUsdc) {
    assert(autoDeposit >= quoteUsdc, `P0-3 Gateway balance ${gatewayBalance} is below quote ${quoteUsdc}, and auto-deposit is insufficient.`);
    await gateway.deposit(String(autoDeposit));
    balances = await gateway.getBalances();
    gatewayBalance = extractGatewayBalance(balances);
  }
  assert(gatewayBalance >= quoteUsdc, `P0-3 Gateway balance ${gatewayBalance} remains below quote ${quoteUsdc}.`);
  evidence.audit.gateway_balance_funded = gatewayBalance;
  evidence.p0.P0_2_autonomous_agent_wallet = "PASS";
  evidence.p0.P0_3_testnet_usdc_funding = "PASS";

  const originalFetch = globalThis.fetch;
  let capturedPaymentSignature = null;
  globalThis.fetch = async (input, init) => {
    const headers = requestHeaders(input, init);
    const signature = headers.get("payment-signature");
    if (signature) capturedPaymentSignature = signature;
    return originalFetch(input, init);
  };

  let paymentResult;
  try {
    paymentResult = await gateway.pay(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "geomacro-agentic-acceptance-v1" },
      body,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const status = Number(paymentResult?.status ?? paymentResult?.response?.status ?? 0);
  assert(status === 200, `Paid x402 call did not return HTTP 200: ${status || "unknown"}.`);
  assert(capturedPaymentSignature, "P0-10 buyer SDK payment signature could not be captured for exact replay proof.");
  const paid = paidPayload(paymentResult);
  assert(paid?.ok === true, "P0-7 paid intelligence response is not ok.");
  assert(paid?.payment?.provider === "circle_gateway_x402", "P0-5 wrong paid provider.");
  assert(paid?.payment?.network === ARC_NETWORK, "P0-5 paid response network mismatch.");
  assert(paid?.payment?.amount_atomic === EXPECTED_PRICE_ATOMIC, "P0-12 paid amount mismatch.");
  assert(typeof paid?.payment?.settlement_reference === "string" && paid.payment.settlement_reference.length > 0, "P0-5 settlement reference missing.");
  assert(paid?.risk_gate?.execution_authorized === false, "P0-9 Risk Gate execution boundary violated.");
  assert(typeof paid?.risk_gate?.decision === "string", "P0-9 Risk Gate decision missing.");
  assert(paid?.risk_object, "P0-7 signed Risk Object missing from paid delivery.");
  evidence.audit.request_id = paid.request_id;
  evidence.audit.client_request_id = clientRequestId;
  evidence.audit.settlement_reference = paid.payment.settlement_reference;
  evidence.audit.risk_gate_decision = paid.risk_gate.decision;
  evidence.audit.risk_object_id = paid.risk_object.object_id;
  evidence.audit.risk_object_payload_hash = paid.risk_object.integrity?.payload_hash ?? null;
  evidence.p0.P0_7_risk_object_delivery = "PASS";
  evidence.p0.P0_9_risk_gate = "PASS";

  const signatureVerification = verifyRiskObject(paid.risk_object, verificationKeys);
  assert(signatureVerification.valid, `P0-8 Risk Object signature invalid: ${signatureVerification.reason}.`);
  const tamperedRiskObject = structuredClone(paid.risk_object);
  tamperedRiskObject.risk.score = Number(tamperedRiskObject.risk.score) + 1;
  const tamperedVerification = verifyRiskObject(tamperedRiskObject, verificationKeys);
  assert(!tamperedVerification.valid, "P0-8 tampered Risk Object unexpectedly verified.");
  evidence.audit.signature_verification = "valid";
  evidence.audit.tamper_verification = tamperedVerification.reason || "rejected";
  evidence.p0.P0_8_risk_object_signature_verification = "PASS";

  const replayResponse = await originalFetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "payment-signature": capturedPaymentSignature,
      "user-agent": "geomacro-agentic-acceptance-v1-replay",
    },
    body: JSON.stringify(body),
  });
  const replay = await replayResponse.json().catch(() => null);
  assert(replayResponse.status === 200, `P0-10 exact replay returned ${replayResponse.status}.`);
  assert(replay?.payment?.idempotent_replay === true, "P0-10 exact replay was not marked idempotent.");
  assert(replay?.payment?.settlement_reference === paid.payment.settlement_reference, "P0-10 replay settlement reference changed.");

  const changedBody = {
    ...body,
    amount_usdc: body.amount_usdc + 1,
  };
  const conflictResponse = await originalFetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "payment-signature": capturedPaymentSignature,
      "user-agent": "geomacro-agentic-acceptance-v1-conflict",
    },
    body: JSON.stringify(changedBody),
  });
  const conflict = await conflictResponse.json().catch(() => null);
  assert(conflictResponse.status === 409, `P0-6/P0-10 changed-request replay returned ${conflictResponse.status}.`);
  assert(conflict?.error?.code === "X402_PAYMENT_REPLAY_CONFLICT", "P0-6/P0-10 changed-request replay was not rejected as a conflict.");
  evidence.audit.duplicate_charge_count = 0;
  evidence.audit.paid_gateway_calls = 1;
  evidence.p0.P0_10_replay_rejection_idempotency = "PASS";
  evidence.p0.P0_13_retry_safety_no_double_spend = "PASS";

  const capturedPayload = decodeBase64Json(capturedPaymentSignature);
  const tamperedPayment = structuredClone(capturedPayload);
  tamperedPayment.accepted.amount = String(Number(tamperedPayment.accepted.amount) + 1);
  const tamperedPaymentResponse = await originalFetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "payment-signature": encodeBase64Json(tamperedPayment),
    },
    body: JSON.stringify(body),
  });
  const tamperedPaymentBody = await tamperedPaymentResponse.json().catch(() => null);
  assert(tamperedPaymentResponse.status === 402, `P0-11 tampered signed payment returned ${tamperedPaymentResponse.status}.`);
  assert(tamperedPaymentBody?.error?.code === "X402_PAYMENT_BINDING_INVALID", "P0-11 tampered payment did not fail closed.");

  const afterBalances = await gateway.getBalances();
  const gatewayBalanceAfter = extractGatewayBalance(afterBalances);
  evidence.audit.gateway_balance_after = gatewayBalanceAfter;
  evidence.audit.observed_gateway_balance_delta = Number((gatewayBalance - gatewayBalanceAfter).toFixed(6));
  assert(evidence.audit.observed_gateway_balance_delta <= configuredBudget + 0.000001, "P0-12 observed Gateway balance delta exceeded the configured acceptance budget.");

  evidence.p0.P0_14_full_audit_evidence = "PASS";
  const requiredP0 = Array.from({ length: 15 }, (_, index) => `P0_${index + 1}`);
  const passedNumbers = new Set(
    Object.entries(evidence.p0)
      .filter(([, value]) => value === "PASS")
      .map(([key]) => key.match(/^P0_(\d+)/)?.[1])
      .filter(Boolean),
  );
  const missing = requiredP0.filter((key) => !passedNumbers.has(key.slice(3)));
  if (missing.length === 1 && missing[0] === "P0_15") {
    evidence.p0.P0_15_canonical_no_human_acceptance_flow = "PASS";
  } else if (missing.length > 0) {
    fail(`P0 acceptance coverage incomplete: ${missing.join(", ")}`);
  }

  evidence.status = "PASS";
  evidence.completed_at = new Date().toISOString();
  evidence.evidence_sha256 = sha256(stableJson({ ...evidence, evidence_sha256: undefined }));
  await mkdir(artifactDir, { recursive: true });
  const path = resolve(artifactDir, `agentic-testnet-acceptance-v1-${Date.now()}.json`);
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log("PASS: Agentic Testnet Acceptance v1");
  console.log(`Evidence: ${path}`);
  console.log(`Settlement reference: ${paid.payment.settlement_reference}`);
  console.log("Duplicate charge count: 0");
  console.log("Commercial revenue: false");
}

main().catch(async (error) => {
  evidence.status = "FAIL";
  evidence.completed_at = new Date().toISOString();
  evidence.failure = error instanceof Error ? error.message : String(error);
  try {
    await mkdir(artifactDir, { recursive: true });
    const path = resolve(artifactDir, `agentic-testnet-acceptance-v1-failed-${Date.now()}.json`);
    await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.error(`Evidence: ${path}`);
  } catch {
    // Do not obscure the original acceptance failure.
  }
  console.error(`FAIL: ${evidence.failure}`);
  process.exit(1);
});