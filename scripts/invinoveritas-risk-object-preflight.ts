#!/usr/bin/env bun
/**
 * Geomacro -> invinoveritas interoperability preflight.
 *
 * This script never mutates a signed Risk Object. It verifies the exact
 * persisted artifact against Geomacro's deployed public verifier, proves a
 * tampered copy is rejected, checks freshness, and emits a /review request
 * body without sending it to the partner service.
 *
 * Usage:
 *   bun scripts/invinoveritas-risk-object-preflight.ts /path/to/risk-object.json
 *
 * Optional:
 *   GEOMACRO_ORIGIN=https://geomacro.live
 */

import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("Usage: bun scripts/invinoveritas-risk-object-preflight.ts <risk-object.json>");

const origin = (process.env.GEOMACRO_ORIGIN ?? "https://geomacro.live").replace(/\/$/, "");
const riskObject = JSON.parse(await readFile(file, "utf8"));

async function verify(object: unknown) {
  const response = await fetch(`${origin}/api/risk-object-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ risk_object: object }),
  });
  const body = await response.json();
  return { http_status: response.status, body };
}

const original = await verify(riskObject);
if (
  original.http_status !== 200 ||
  original.body?.ok !== true ||
  original.body?.verification?.status !== "VERIFIED" ||
  original.body?.verification?.valid !== true ||
  original.body?.verification?.cryptographic_valid !== true ||
  original.body?.verification?.contract_valid !== true ||
  original.body?.verification?.fresh !== true
) {
  throw new Error(`Original Risk Object failed deployed verification: ${JSON.stringify(original.body)}`);
}

const tampered = structuredClone(riskObject);
if (typeof tampered?.risk?.score !== "number") {
  throw new Error("Risk Object does not contain numeric risk.score for tamper vector");
}
tampered.risk.score = Number((tampered.risk.score + 1).toFixed(6));

const tamperResult = await verify(tampered);
if (
  tamperResult.body?.verification?.valid === true ||
  tamperResult.body?.verification?.status === "VERIFIED"
) {
  throw new Error("Tampered Risk Object was incorrectly accepted");
}

const expiresAt = Date.parse(riskObject.expires_at);
if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
  throw new Error("Risk Object is stale. Publish a fresh production-signed object before handoff.");
}

const reviewRequest = {
  artifact: JSON.stringify(riskObject),
  artifact_type: "risk_context",
  context:
    "Externally signed Geomacro geopolitical/macro Risk Object supplied as pre-action risk context. Verify the embedded Geomacro signature and freshness before relying on it. The artifact is derived-only intelligence and does not redistribute raw third-party source material.",
  confidentiality_tier: "hash_only",
};

console.log(JSON.stringify({
  ok: true,
  gates: {
    deployed_original_verification: "PASS",
    tampered_payload_rejected: "PASS",
    freshness: "PASS",
    partner_request_constructed: "PASS",
  },
  object: {
    object_id: riskObject.object_id,
    schema_version: riskObject.schema_version,
    expires_at: riskObject.expires_at,
    signing_key_id: riskObject?.integrity?.signing_key_id,
  },
  geomacro_verification: original.body.verification,
  tamper_verification: tamperResult.body?.verification ?? tamperResult.body,
  invinoveritas_review_request: reviewRequest,
  handoff_rule:
    "Do not cache this sample for later execution. Immediately before partner testing, publish/retrieve a fresh production-signed GRO and rerun this preflight.",
}, null, 2));
