#!/usr/bin/env bun

import { publishCountryRiskObject } from "../src/lib/country-risk-publisher.server";
import { verifyRiskObjectSignature } from "../src/lib/risk-object-signing.server";

const COUNTRIES = ["USA", "CHN"];

function assertFresh(expiresAt, now, country) {
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new Error(`Paid-agent ${country} Risk Object is not fresh: ${expiresAt}`);
  }
}

async function main() {
  const now = new Date();
  const signingKeyId = String(process.env.RISK_OBJECT_SIGNING_KEY_ID ?? "").trim();
  if (!signingKeyId) throw new Error("RISK_OBJECT_SIGNING_KEY_ID is required");

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
