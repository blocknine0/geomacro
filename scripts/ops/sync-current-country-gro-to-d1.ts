#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import { createB2Client } from "./b2-s3-client.mjs";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const TRUST_URL = "https://geomacro.live/api/risk-object-keys";
const COUNTRY = String(process.env.GRO_CONTINUITY_COUNTRY_ISO3 ?? "USA").trim().toUpperCase();
const WRANGLER_VERSION = String(process.env.WRANGLER_VERSION ?? "4.136.3").trim();
const D1_DATABASE_NAME = String(process.env.D1_DATABASE_NAME ?? "geomacro-control-plane").trim();
const OUT_DIR = join(process.cwd(), "artifacts", "fresh-gro-continuity");
const D1_CONFIG = join(OUT_DIR, "wrangler.runtime.jsonc");
const HASH_RE = /^[a-f0-9]{64}$/;
const OBJECT_RE = /^gro_[A-Za-z0-9_]+$/;
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const sqlText = (value: unknown) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

if (!/^[A-Z]{3}$/.test(COUNTRY)) throw new Error("CURRENT_GRO_COUNTRY_INVALID");
if (String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY) {
  throw new Error("CURRENT_GRO_B2_CONFIG_INVALID");
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("CURRENT_GRO_D1_CONFIG_INVALID");
}

function wrangler(args: string[]) {
  return execFileSync("npx", ["-y", `wrangler@${WRANGLER_VERSION}`, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
}
function parseD1(raw: string) {
  const parsed = JSON.parse(raw);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  return envelopes.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []) as Array<Record<string, unknown>>;
}

const registryResponse = await fetch(TRUST_URL, {
  headers: { accept: "application/json", "cache-control": "no-cache" },
  signal: AbortSignal.timeout(15_000),
});
if (!registryResponse.ok) throw new Error(`CURRENT_GRO_TRUST_REGISTRY_${registryResponse.status}`);
const registry = await registryResponse.json() as {
  keys?: Array<{
    key_id: string;
    public_key_spki_b64: string;
    status: "active" | "retired" | "revoked";
    not_before?: string | null;
    not_after?: string | null;
  }>;
};
const keys: RiskObjectVerificationKeys = Object.fromEntries(
  (registry.keys ?? []).map(({ key_id, ...record }) => [key_id, record]),
);
if (!Object.keys(keys).length) throw new Error("CURRENT_GRO_TRUST_REGISTRY_EMPTY");

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

const latestKey = `geomacro-evidence/v1/live/country-gro/${COUNTRY}/latest.json.gz`;
const latestPacked = await b2.get(latestKey);
if (latestPacked.length > 2_000_000) throw new Error("CURRENT_GRO_LATEST_TOO_LARGE");
const latestEnvelope = JSON.parse(gunzipSync(latestPacked, { maxOutputLength: 4_000_000 }).toString("utf8"));
const riskObject = latestEnvelope?.object;
const objectId = String(riskObject?.object_id ?? "");
if (latestEnvelope?.schema !== "geomacro.country-gro-continuity.v1" ||
    latestEnvelope?.country_iso3 !== COUNTRY || !OBJECT_RE.test(objectId)) {
  throw new Error("CURRENT_GRO_LATEST_ENVELOPE_INVALID");
}
if (riskObject?.subject?.type !== "country" || riskObject?.subject?.id !== COUNTRY ||
    riskObject?.verification?.status !== "VERIFIED" ||
    riskObject?.commercial_eligibility?.status !== "VERIFIED") {
  throw new Error("CURRENT_GRO_OBJECT_CONTRACT_INVALID");
}
if (!verifyRiskObjectSignature(riskObject, keys).valid ||
    !verifyCommercialRiskObjectArtifact(riskObject, { now: new Date() }).deliverable) {
  throw new Error("CURRENT_GRO_OBJECT_NOT_DELIVERABLE");
}
const expiresMs = Date.parse(String(riskObject?.expires_at ?? ""));
if (!Number.isFinite(expiresMs) || expiresMs <= Date.now() + 30 * 60 * 1000) {
  throw new Error("CURRENT_GRO_FRESHNESS_HEADROOM_INSUFFICIENT");
}

const byIdKey = `geomacro-evidence/v1/live/country-gro/by-id/${objectId}.json.gz`;
const byIdPacked = await b2.get(byIdKey);
if (byIdPacked.length > 2_000_000) throw new Error("CURRENT_GRO_BY_ID_TOO_LARGE");
const byIdEnvelope = JSON.parse(gunzipSync(byIdPacked, { maxOutputLength: 4_000_000 }).toString("utf8"));
if (byIdEnvelope?.object?.object_id !== objectId ||
    canonicalRiskObjectJson(byIdEnvelope.object) !== canonicalRiskObjectJson(riskObject) ||
    !verifyRiskObjectSignature(byIdEnvelope.object, keys).valid) {
  throw new Error("CURRENT_GRO_BY_ID_READBACK_INVALID");
}

// D1's generic verifier reads a raw signed GRO gzip. Derive that immutable object
// only from the independently verified current B2 by-id envelope; never from a
// Supabase payload or an unverified in-memory source.
const rawObject = Buffer.from(JSON.stringify(riskObject));
const genericPacked = gzipSync(rawObject, { level: 9 });
const genericKey = `geomacro-evidence/v1/gro/${objectId}.json.gz`;
const archiveSha256 = sha256(genericPacked);
await b2.put(genericKey, genericPacked);
const genericReadback = await b2.get(genericKey);
if (genericReadback.length !== genericPacked.length || sha256(genericReadback) !== archiveSha256) {
  throw new Error("CURRENT_GRO_GENERIC_B2_HASH_MISMATCH");
}
const restored = JSON.parse(gunzipSync(genericReadback, { maxOutputLength: 4_000_000 }).toString("utf8"));
if (canonicalRiskObjectJson(restored) !== canonicalRiskObjectJson(riskObject) ||
    !verifyRiskObjectSignature(restored, keys).valid ||
    !verifyCommercialRiskObjectArtifact(restored, { now: new Date() }).deliverable) {
  throw new Error("CURRENT_GRO_GENERIC_B2_RESTORE_INVALID");
}

const list = JSON.parse(wrangler(["d1", "list", "--json"])) as Array<{ name?: string; uuid?: string; id?: string }>;
const databaseId = String(list.find((row) => row.name === D1_DATABASE_NAME)?.uuid ??
  list.find((row) => row.name === D1_DATABASE_NAME)?.id ?? "");
if (!/^[0-9a-f-]{20,}$/i.test(databaseId)) throw new Error("CURRENT_GRO_D1_DATABASE_NOT_FOUND");
mkdirSync(OUT_DIR, { recursive: true });
const example = Bun.file("workers/control-plane/wrangler.example.jsonc");
const exampleText = await example.text();
writeFileSync(D1_CONFIG, exampleText.replace("REPLACE_WITH_D1_DATABASE_ID", databaseId), { encoding: "utf8", mode: 0o600 });

const recordSha256 = sha256(Buffer.from(canonicalRiskObjectJson(riskObject), "utf8"));
const signingKeyId = String(riskObject?.integrity?.signing_key_id ?? "");
const payloadHash = String(riskObject?.integrity?.payload_hash ?? "");
if (!HASH_RE.test(recordSha256) || !HASH_RE.test(payloadHash) || !signingKeyId) {
  throw new Error("CURRENT_GRO_INDEX_HASH_CONTRACT_INVALID");
}
const now = new Date().toISOString();
const upsert = `INSERT INTO risk_object_index (object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,updated_at) VALUES (${sqlText(objectId)},${sqlText(riskObject.schema_version)},'country',${sqlText(COUNTRY)},${sqlText(riskObject.generated_at)},${sqlText(riskObject.expires_at)},'VERIFIED','VERIFIED',${sqlText(signingKeyId)},${sqlText(payloadHash)},${sqlText(recordSha256)},${sqlText(genericKey)},${sqlText(archiveSha256)},${sqlText(now)}) ON CONFLICT(object_id) DO UPDATE SET schema_version=excluded.schema_version,subject_type=excluded.subject_type,subject_id=excluded.subject_id,generated_at=excluded.generated_at,expires_at=excluded.expires_at,verification_status=excluded.verification_status,commercial_eligibility_status=excluded.commercial_eligibility_status,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,updated_at=excluded.updated_at;`;
wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--command", upsert]);

const readbackRaw = wrangler([
  "d1", "execute", "DB", "--remote", "--json", "--config", D1_CONFIG,
  "--command",
  `SELECT object_id,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,record_sha256,archive_key,archive_sha256 FROM risk_object_index WHERE object_id=${sqlText(objectId)} LIMIT 1;`,
]);
const row = parseD1(readbackRaw)[0];
if (!row || String(row.object_id) !== objectId || String(row.subject_id) !== COUNTRY ||
    String(row.verification_status) !== "VERIFIED" || String(row.commercial_eligibility_status) !== "VERIFIED" ||
    String(row.record_sha256) !== recordSha256 || String(row.archive_key) !== genericKey ||
    String(row.archive_sha256) !== archiveSha256 || Date.parse(String(row.expires_at)) <= Date.now() + 5 * 60 * 1000) {
  throw new Error("CURRENT_GRO_D1_READBACK_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.current-country-gro-d1-continuity.v1",
  country_iso3: COUNTRY,
  object_id: objectId,
  generated_at: riskObject.generated_at,
  expires_at: riskObject.expires_at,
  source_b2_key: byIdKey,
  d1_archive_key: genericKey,
  b2_readback_verified: true,
  signature_verified: true,
  commercial_eligibility_status: "VERIFIED",
  verification_status: "VERIFIED",
  record_sha256: recordSha256,
  archive_sha256: archiveSha256,
  supabase_payload_used_for_d1_record: false,
  external_payment_performed: false,
  destructive_change: false,
}, null, 2));
