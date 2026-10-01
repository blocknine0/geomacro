#!/usr/bin/env bun
import {
  createHash,
  createPublicKey,
  verify as verifySignatureBytes,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) throw new Error("Usage: bun scripts/invinoveritas-signed-gro-authentication.ts <risk-object.json>");

const geomacroOrigin = (process.env.GEOMACRO_ORIGIN ?? "https://geomacro.live").replace(/\/$/, "");
const invinoOrigin = (process.env.INVINO_ORIGIN ?? "https://api.babyblueviper.com").replace(/\/$/, "");
const invinoApiKey = process.env.INVINO_API_KEY?.trim() ?? "";
const requestOut = process.env.INVINO_REQUEST_OUT?.trim() ?? "";
const reviewOut = process.env.INVINO_REVIEW_OUT?.trim() ?? "";

if (!invinoApiKey) throw new Error("INVINO_API_KEY is required for live Federico authentication handoff");

const riskObject = JSON.parse(await readFile(file, "utf8"));

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Non-finite number in Risk Object");
  }
  return value;
}

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function deployedVerify(object: unknown) {
  const response = await fetch(`${geomacroOrigin}/api/risk-object-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ risk_object: object }),
  });
  const body = await response.json().catch(() => null);
  return { http_status: response.status, body };
}

if (
  riskObject?.schema_version !== "gro-1.1" ||
  riskObject?.subject?.type !== "country" ||
  !/^[A-Z]{3}$/.test(String(riskObject?.subject?.id ?? "")) ||
  riskObject?.verification?.status !== "VERIFIED" ||
  riskObject?.commercial_eligibility?.status !== "VERIFIED"
) {
  throw new Error("Fresh production GRO does not satisfy the authentication handoff contract");
}

const expiresAt = Date.parse(String(riskObject.expires_at ?? ""));
if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
  throw new Error("Risk Object is stale before Federico authentication handoff");
}

const original = await deployedVerify(riskObject);
if (
  original.http_status !== 200 ||
  original.body?.ok !== true ||
  original.body?.verification?.status !== "VERIFIED" ||
  original.body?.verification?.valid !== true ||
  original.body?.verification?.cryptographic_valid !== true ||
  original.body?.verification?.contract_valid !== true ||
  original.body?.verification?.fresh !== true
) {
  throw new Error(`Deployed Geomacro verification failed: ${JSON.stringify(original.body)}`);
}

const tampered = structuredClone(riskObject);
if (typeof tampered?.risk?.score !== "number") throw new Error("Risk Object has no numeric risk.score");
tampered.risk.score = Number((tampered.risk.score + 1).toFixed(6));
const tamperResult = await deployedVerify(tampered);
if (tamperResult.body?.verification?.valid === true || tamperResult.body?.verification?.status === "VERIFIED") {
  throw new Error("Tampered Risk Object was incorrectly accepted by deployed verifier");
}

const signable = structuredClone(riskObject);
signable.integrity = {
  ...signable.integrity,
  payload_hash: null,
  signature: null,
};
const canonicalSignableBytes = JSON.stringify(canonicalize(signable));
const recomputedPayloadHash = sha256Text(canonicalSignableBytes);
if (recomputedPayloadHash !== riskObject?.integrity?.payload_hash) {
  throw new Error("Risk Object payload_hash mismatch");
}

const publicKey = createPublicKey({
  key: Buffer.from(String(riskObject?.integrity?.public_key_spki_b64 ?? ""), "base64"),
  format: "der",
  type: "spki",
});
const signatureValid = verifySignatureBytes(
  null,
  Buffer.from(canonicalSignableBytes, "utf8"),
  publicKey,
  Buffer.from(String(riskObject?.integrity?.signature ?? ""), "base64"),
);
if (!signatureValid) throw new Error("Local Ed25519 signature verification failed");

const signedRiskObjectRecord = JSON.stringify(canonicalize(riskObject));
const recordSha256 = sha256Text(signedRiskObjectRecord);
const externalEvidence = [{
  source: "Geomacro",
  evidence_type: "signed_risk_object",
  record_sha256: recordSha256,
  record: signedRiskObjectRecord,
  observed_at: riskObject.observed_at ?? riskObject.generated_at,
  validity_until: riskObject.expires_at,
}];

const countryIso3 = String(riskObject.subject.id);
const reviewArtifact = {
  artifact_version: "geomacro-federico-signed-gro-authentication-v1",
  purpose: "authenticate_signed_risk_object_external_evidence",
  action_proposed: false,
  execution_authorized: false,
  object_binding: {
    issuer: "Geomacro",
    schema_version: riskObject.schema_version,
    object_id: riskObject.object_id,
    subject_type: riskObject.subject.type,
    subject_id: countryIso3,
    payload_hash: riskObject.integrity.payload_hash,
    signing_key_id: riskObject.integrity.signing_key_id,
    expires_at: riskObject.expires_at,
  },
  receiver_contract: {
    policy_id: "federico-signed-gro-authentication-v1",
    scope: "authentication_and_interoperability_only",
    exact_record_hash_required: true,
    canonical_payload_hash_required: true,
    ed25519_signature_required: true,
    receiver_pinned_key_required: true,
    freshness_required: true,
    semantic_risk_admission_authorized: false,
    irreversible_execution_authorized: false,
  },
};

const reviewRequest = {
  artifact: JSON.stringify(reviewArtifact),
  artifact_type: "general",
  context:
    `Authentication-only interoperability check for exact Geomacro gro-1.1 country Risk Object ${riskObject.object_id} (${countryIso3}). ` +
    "Verify exact external-evidence bytes against record_sha256, canonical payload_hash, Ed25519 signature, pinned Geomacro key ID, and validity window. " +
    "Do not treat this request as approval of the risk assessment or authorization for an irreversible action.",
  sign: true,
  confidentiality_tier: "partial_disclosure",
  disclosed_summary: JSON.stringify({
    object_id: riskObject.object_id,
    subject: riskObject.subject,
    generated_at: riskObject.generated_at,
    expires_at: riskObject.expires_at,
    record_sha256: recordSha256,
    payload_hash: riskObject.integrity.payload_hash,
    signing_key_id: riskObject.integrity.signing_key_id,
  }),
  external_evidence: externalEvidence,
};

if (Buffer.byteLength(reviewRequest.artifact, "utf8") > 20_000) {
  throw new Error("Federico authentication artifact exceeds 20KB partner limit");
}

if (requestOut) {
  await writeFile(requestOut, JSON.stringify(reviewRequest, null, 2) + "\n", { mode: 0o600 });
}

const response = await fetch(`${invinoOrigin}/review`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${invinoApiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(reviewRequest),
});
const body = await response.json().catch(() => null);
if (!response.ok) {
  throw new Error(`Federico /review failed HTTP ${response.status}: ${JSON.stringify(body)}`);
}
if (!body?.proof) throw new Error("Federico /review returned no signed proof");

if (reviewOut) {
  await writeFile(reviewOut, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
}

let proofVerified = false;
let verifyUrl: string | null = null;
const signedEvent = body?.proof?.event;
verifyUrl = String(body?.proof?.proof_payload?.verify_url ?? "").trim() || null;
if (signedEvent && verifyUrl) {
  const verifyResponse = await fetch(verifyUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: signedEvent }),
  });
  const verifyBody = await verifyResponse.json().catch(() => null);
  if (!verifyResponse.ok || verifyBody?.valid !== true) {
    throw new Error(`Federico proof verification failed: ${JSON.stringify(verifyBody)}`);
  }
  proofVerified = true;
}
if (!proofVerified) throw new Error("Federico signed proof could not be independently verified");

const issues = Array.isArray(body?.issues) ? body.issues : [];
console.log(JSON.stringify({
  ok: true,
  object: {
    object_id: riskObject.object_id,
    schema_version: riskObject.schema_version,
    subject: riskObject.subject,
    generated_at: riskObject.generated_at,
    expires_at: riskObject.expires_at,
    record_sha256: recordSha256,
    payload_hash: riskObject.integrity.payload_hash,
    signing_key_id: riskObject.integrity.signing_key_id,
  },
  gates: {
    deployed_original_verification: "PASS",
    deployed_tamper_rejection: "PASS",
    local_payload_hash: "PASS",
    local_ed25519_signature: "PASS",
    freshness: "PASS",
    partner_review_http: "PASS",
    partner_signed_proof: "PASS",
    partner_proof_verification: "PASS",
  },
  live_review: {
    http_status: response.status,
    verdict: body?.verdict ?? null,
    confidence: body?.confidence ?? null,
    issue_count: issues.length,
    proof_present: true,
    proof_verified: true,
    verify_url: verifyUrl,
    billing: body?.billing ?? null,
  },
}, null, 2));
