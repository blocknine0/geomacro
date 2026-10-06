#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { createB2Client } from "./b2-s3-client.mjs";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../../src/lib/risk-object-signing.server";

for (const key of [
  "APP_SUPABASE_URL",
  "APP_SUPABASE_ANON_KEY",
  "APP_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
]) {
  delete process.env[key];
}

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const TRUST_URL = "https://geomacro.live/api/risk-object-keys";
const HASH_RE = /^[a-f0-9]{64}$/;
const indexFile = String(process.env.RISK_OBJECT_INDEX_FILE ?? "").trim();

if (!indexFile) throw new Error("GENERIC_RISK_OBJECT_INDEX_FILE_REQUIRED");
if (String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT) {
  throw new Error("GENERIC_RISK_OBJECT_B2_ENDPOINT_INVALID");
}
if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY) {
  throw new Error("GENERIC_RISK_OBJECT_B2_CREDENTIALS_REQUIRED");
}

const row = JSON.parse(readFileSync(indexFile, "utf8")) as Record<string, unknown>;
const objectId = String(row.object_id ?? "");
const archiveKey = String(row.archive_key ?? "");
const archiveSha256 = String(row.archive_sha256 ?? "");
const recordSha256Expected = String(row.record_sha256 ?? "");

if (!/^gro_[A-Za-z0-9_]+$/.test(objectId)) throw new Error("GENERIC_RISK_OBJECT_ID_INVALID");
if (!/^geomacro-evidence\/v1\/gro\/gro_[A-Za-z0-9_]+\.json\.gz$/.test(archiveKey)) {
  throw new Error("GENERIC_RISK_OBJECT_ARCHIVE_KEY_INVALID");
}
if (!HASH_RE.test(archiveSha256) || !HASH_RE.test(recordSha256Expected)) {
  throw new Error("GENERIC_RISK_OBJECT_INDEX_HASH_INVALID");
}
if (String(row.verification_status ?? "") !== "VERIFIED" ||
    String(row.commercial_eligibility_status ?? "") !== "VERIFIED") {
  throw new Error("GENERIC_RISK_OBJECT_INDEX_NOT_COMMERCIALLY_VERIFIED");
}

const sha256 = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

const compressed = await b2.get(archiveKey);
if (compressed.length > 2_000_000 || sha256(compressed) !== archiveSha256) {
  throw new Error("GENERIC_RISK_OBJECT_B2_READBACK_HASH_MISMATCH");
}
const raw = gunzipSync(compressed, { maxOutputLength: 4_000_000 });
const riskObject = JSON.parse(raw.toString("utf8"));

if (riskObject?.object_id !== objectId ||
    riskObject?.verification?.status !== "VERIFIED" ||
    riskObject?.commercial_eligibility?.status !== "VERIFIED") {
  throw new Error("GENERIC_RISK_OBJECT_PAYLOAD_CONTRACT_MISMATCH");
}
const recordSha256 = sha256(Buffer.from(canonicalRiskObjectJson(riskObject), "utf8"));
if (recordSha256 !== recordSha256Expected) {
  throw new Error("GENERIC_RISK_OBJECT_RECORD_HASH_MISMATCH");
}
const expiresMs = Date.parse(String(riskObject?.expires_at ?? ""));
if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
  throw new Error("GENERIC_RISK_OBJECT_NOT_FRESH");
}

const trustUrl = new URL(TRUST_URL);
trustUrl.searchParams.set("v", String(process.env.HEAD_SHA ?? Date.now()));
const registryResponse = await fetch(trustUrl, {
  cache: "no-store",
  headers: {
    accept: "application/json",
    "cache-control": "no-cache",
    pragma: "no-cache",
  },
  signal: AbortSignal.timeout(15_000),
});
if (!registryResponse.ok) {
  throw new Error(`GENERIC_RISK_OBJECT_TRUST_REGISTRY_${registryResponse.status}`);
}
const registryText = await registryResponse.text();
const registry = JSON.parse(registryText) as {
  ok?: boolean;
  issuer?: string;
  signature_scheme?: string;
  canonicalization?: string;
  verification_endpoint?: { method?: string; max_body_bytes?: number; intended_for?: string };
  large_object_verification?: { mode?: string; canonicalization?: string; signature_scheme?: string };
  keys?: Array<{
    key_id: string;
    public_key_spki_b64: string;
    status: "active" | "retired" | "revoked";
    not_before?: string | null;
    not_after?: string | null;
  }>;
};
if (registry.ok !== true || registry.issuer !== "Geomacro" ||
    registry.signature_scheme !== "Ed25519" ||
    registry.canonicalization !== "geomacro-canonical-json-v1" ||
    registry.verification_endpoint?.method !== "POST" ||
    !Number.isFinite(registry.verification_endpoint?.max_body_bytes) ||
    Number(registry.verification_endpoint?.max_body_bytes) <= 0 ||
    registry.large_object_verification?.mode !== "client_local_with_public_keys" ||
    registry.large_object_verification?.canonicalization !== "geomacro-canonical-json-v1" ||
    registry.large_object_verification?.signature_scheme !== "Ed25519" ||
    !Array.isArray(registry.keys) || registry.keys.length === 0) {
  throw new Error("GENERIC_RISK_OBJECT_TRUST_REGISTRY_INVALID");
}
const activeKey = registry.keys.some((key) =>
  key.status === "active" && typeof key.public_key_spki_b64 === "string" && key.public_key_spki_b64.length > 0
);
if (!activeKey) throw new Error("GENERIC_RISK_OBJECT_ACTIVE_KEY_MISSING");

const keys: RiskObjectVerificationKeys = Object.fromEntries(
  registry.keys.map(({ key_id, ...record }) => [key_id, record]),
);
const localVerification = verifyRiskObjectSignature(riskObject, keys);
if (!localVerification.valid) {
  throw new Error(`GENERIC_RISK_OBJECT_LOCAL_SIGNATURE_INVALID:${localVerification.reason ?? "unknown"}`);
}

async function publicVerify(value: unknown) {
  const response = await fetch(TRUST_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ risk_object: value }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GENERIC_RISK_OBJECT_PUBLIC_VERIFY_${response.status}`);
  return response.json() as Promise<{
    ok?: boolean;
    verification?: { valid?: boolean; status?: string; fresh?: boolean; reason_codes?: string[] };
  }>;
}

// The public POST verifier is intentionally request-bounded. Large production
// GROs are verified locally using the exact public keys fetched from the
// deployed trust registry, which avoids turning the trust endpoint into a
// multi-megabyte upload service or reintroducing a server-side storage/DB
// dependency. The B2 readback + D1 record hash above binds these exact bytes.
const canonicalBytes = Buffer.byteLength(canonicalRiskObjectJson(riskObject), "utf8");
const publicPostLimit = Number(registry.verification_endpoint?.max_body_bytes);
const verificationMode =
  canonicalBytes <= publicPostLimit
    ? "bounded_public_post"
    : "client_local_with_public_keys";

if (verificationMode === "bounded_public_post") {
  const deployedOriginal = await publicVerify(riskObject);
  if (deployedOriginal.ok !== true ||
      deployedOriginal.verification?.valid !== true ||
      deployedOriginal.verification?.status !== "VERIFIED" ||
      deployedOriginal.verification?.fresh !== true) {
    throw new Error("GENERIC_RISK_OBJECT_DEPLOYED_VERIFICATION_FAILED");
  }
} else if (!localVerification.valid) {
  throw new Error("GENERIC_RISK_OBJECT_LARGE_LOCAL_VERIFICATION_FAILED");
}

// Always prove that the deployed POST verifier itself is live and fail-closed
// with a tiny invalid artifact that stays safely below the advertised limit.
const endpointProbe = await publicVerify({
  schema_version: "invalid-probe",
  issuer: "Geomacro",
});
if (endpointProbe.ok !== true || endpointProbe.verification?.valid !== false) {
  throw new Error("GENERIC_RISK_OBJECT_PUBLIC_VERIFIER_PROBE_FAILED");
}

const tampered = JSON.parse(JSON.stringify(riskObject));
if (tampered?.subject?.type === "country") {
  tampered.subject.id = tampered.subject.id === "USA" ? "CAN" : "USA";
} else if (tampered?.subject?.type === "corridor") {
  tampered.subject.id = `${String(tampered.subject.id ?? "corridor")}-tampered`;
} else {
  throw new Error("GENERIC_RISK_OBJECT_UNSUPPORTED_SUBJECT");
}
const tamperedVerification = verifyRiskObjectSignature(tampered, keys);
if (tamperedVerification.valid !== false) {
  throw new Error("GENERIC_RISK_OBJECT_TAMPER_NOT_REJECTED");
}

const supabaseCredentialsPresent = Boolean(
  process.env.APP_SUPABASE_URL || process.env.APP_SUPABASE_ANON_KEY ||
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_URL ||
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_DB_URL
);
if (supabaseCredentialsPresent) throw new Error("GENERIC_RISK_OBJECT_SUPABASE_CREDENTIAL_REAPPEARED");

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.generic-production-risk-object-trust.v1",
  object_id: objectId,
  subject_type: riskObject?.subject?.type ?? null,
  subject_id: riskObject?.subject?.id ?? null,
  expires_at: riskObject?.expires_at ?? null,
  registry_live: true,
  verification_endpoint_live: true,
  verification_mode: verificationMode,
  public_post_max_bytes: publicPostLimit,
  canonical_object_bytes: canonicalBytes,
  active_key: true,
  signature_scheme: registry.signature_scheme,
  canonicalization: registry.canonicalization,
  local_verifier_contract: true,
  tamper_rejected: true,
  b2_risk_verified: true,
  b2_readback_verified: true,
  registry_sha256: sha256(registryText),
  record_sha256: recordSha256,
  supabase_credentials_present: false,
  external_payment_performed: false,
  destructive_change: false,
}));
