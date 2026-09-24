#!/usr/bin/env bun

import { createPrivateKey, createPublicKey } from "node:crypto";
import { publishCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { verifyRiskObjectSignature } from "../src/lib/risk-object-signing.server";

const COUNTRIES = ["USA", "CHN"];

function assertFresh(expiresAt, now, country) {
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new Error(`Paid-agent ${country} Risk Object is not fresh: ${expiresAt}`);
  }
}

function derivePublicKey(privateKeyB64) {
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64.trim(), "base64"),
    format: "der",
    type: "pkcs8",
  });

  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Risk Object signing key must be Ed25519");
  }

  return Buffer.from(
    createPublicKey(privateKey).export({ format: "der", type: "spki" }),
  ).toString("base64");
}

async function assertDeployedSignerIsActive(signingKeyId, signingPrivateKey) {
  const response = await fetch("https://geomacro.live/api/risk-object-keys", {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Risk Object trust registry HTTP ${response.status}`);
  }

  const body = await response.json();
  const key = Array.isArray(body?.keys)
    ? body.keys.find((item) => item?.key_id === signingKeyId)
    : null;

  if (!key || key.status !== "active") {
    throw new Error(`Configured signer ${signingKeyId} is not the active deployed Risk Object key`);
  }

  const derivedPublic = derivePublicKey(signingPrivateKey);
  if (key.public_key_spki_b64 !== derivedPublic) {
    throw new Error("Configured Risk Object private key does not match the deployed public verification key");
  }
}

async function main() {
  const now = new Date();
  const signingKeyId = String(process.env.RISK_OBJECT_SIGNING_KEY_ID ?? "").trim();
  const signingPrivateKey = String(
    process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64 ?? "",
  ).trim();

  if (!signingKeyId) throw new Error("RISK_OBJECT_SIGNING_KEY_ID is required");
  if (!signingPrivateKey) {
    throw new Error("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64 is required");
  }

  await assertDeployedSignerIsActive(signingKeyId, signingPrivateKey);

  const countries = [];
  for (const country of COUNTRIES) {
    const result = await publishCountryRiskObject({
      country_iso3: country,
      as_of: now.toISOString(),
      delivery_profile: "CANONICAL",
    });

    const signature = verifyRiskObjectSignature(result.object);
    if (!signature.valid) {
      throw new Error(`${country} signature invalid: ${signature.reason ?? "unknown"}`);
    }
    if (result.object.commercial_eligibility.status !== "VERIFIED") {
      throw new Error(`${country} commercial eligibility is ${result.object.commercial_eligibility.status}`);
    }
    if (result.object.verification.status !== "VERIFIED") {
      throw new Error(`${country} verification status is ${result.object.verification.status}`);
    }
    if (result.object.integrity.signing_key_id !== signingKeyId) {
      throw new Error(
        `${country} signed with ${result.object.integrity.signing_key_id ?? "missing"}, expected ${signingKeyId}`,
      );
    }

    assertFresh(result.object.expires_at, now, country);

    countries.push({
      country,
      object_id: result.object.object_id,
      generated_at: result.object.generated_at,
      expires_at: result.object.expires_at,
      signing_key_id: result.object.integrity.signing_key_id,
      verification_status: result.object.verification.status,
      commercial_eligibility_status: result.object.commercial_eligibility.status,
      signature_valid: true,
      published: result.context.published,
    });
  }

  console.log(JSON.stringify({
    ok: true,
    refreshed_at: now.toISOString(),
    countries,
  }, null, 2));
}

main().catch((error) => {
  console.error("PAID_AGENT_COUNTRY_REFRESH_FAILED");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
