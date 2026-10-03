#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../../src/lib/risk-object-signing.server";
import type { GeomacroRiskObject } from "../../src/lib/risk-object-contract";

const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const B2_COUNTRY_GRO_SCHEMA = "geomacro.country-gro-continuity.v1";
const D1_CONFIG = String(process.env.D1_CONFIG ?? "workers/control-plane/wrangler.runtime.jsonc").trim();
const WRANGLER_VERSION = String(process.env.WRANGLER_VERSION ?? "4.136.3").trim();
const HASH_RE = /^[a-f0-9]{64}$/;
const OBJECT_RE = /^gro_country_[A-Z]{3}_[A-Za-z0-9]+$/;
const ISO3_RE = /^[A-Z]{3}$/;

if (
  String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) {
  throw new Error("D1_GRO_INDEX_B2_CONFIG_INVALID");
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("D1_GRO_INDEX_CLOUDFLARE_CONFIG_INVALID");
}

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const sqlText = (value: unknown) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function checksum(rows: unknown[]) {
  return sha256(rows.map(canonical).join("\n"));
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

type CountryGroEnvelope = {
  schema: string;
  published_at: string;
  source_project: string;
  country_iso3: string;
  object: GeomacroRiskObject;
};

function parseEnvelope(compressed: Buffer, expectedIso3: string): CountryGroEnvelope {
  if (!compressed.length || compressed.length > 2_000_000) {
    throw new Error(`D1_GRO_INDEX_B2_OBJECT_SIZE_INVALID:${expectedIso3}`);
  }
  const raw = gunzipSync(compressed, { maxOutputLength: 4_000_000 });
  const envelope = JSON.parse(raw.toString("utf8")) as Partial<CountryGroEnvelope>;
  if (
    envelope.schema !== B2_COUNTRY_GRO_SCHEMA ||
    envelope.source_project !== SOURCE_PROJECT ||
    envelope.country_iso3 !== expectedIso3 ||
    !envelope.object ||
    typeof envelope.object !== "object"
  ) {
    throw new Error(`D1_GRO_INDEX_B2_ENVELOPE_INVALID:${expectedIso3}`);
  }
  return envelope as CountryGroEnvelope;
}

const keyResponse = await fetch("https://geomacro.live/api/risk-object-keys", {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
});
if (!keyResponse.ok) throw new Error(`D1_GRO_INDEX_TRUST_REGISTRY_${keyResponse.status}`);
const keyBody = await keyResponse.json() as {
  keys?: Array<{
    key_id: string;
    public_key_spki_b64: string;
    status: "active" | "retired" | "revoked";
    not_before?: string | null;
    not_after?: string | null;
  }>;
};
const keys: RiskObjectVerificationKeys = Object.fromEntries(
  (keyBody.keys ?? []).map(({ key_id, ...record }) => [key_id, record]),
);
if (!Object.keys(keys).length) throw new Error("D1_GRO_INDEX_TRUST_REGISTRY_EMPTY");

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});

// Country discovery comes from the already parity-verified D1 matrix. This is
// intentionally independent of Supabase so a paused or quota-restricted source
// database cannot block the permanent control-plane migration.
const countryRows = parseD1(wrangler([
  "d1",
  "execute",
  "DB",
  "--remote",
  "--json",
  "--config",
  D1_CONFIG,
  "--command",
  "SELECT DISTINCT country_iso3 FROM country_domain_state ORDER BY country_iso3;",
]));
const countries = countryRows
  .map((row) => String(row.country_iso3 ?? "").trim().toUpperCase())
  .filter((iso3, index, all) => ISO3_RE.test(iso3) && all.indexOf(iso3) === index);
if (!countries.length || countries.length > 250) {
  throw new Error(`D1_GRO_INDEX_COUNTRY_MATRIX_INVALID:${countries.length}`);
}

const verified: Array<Record<string, string>> = [];
for (const iso3 of countries) {
  const latestKey = `geomacro-evidence/v1/live/country-gro/${iso3}/latest.json.gz`;
  const latestCompressed = await b2.getOptional(latestKey);
  if (!latestCompressed) continue;

  const latestEnvelope = parseEnvelope(latestCompressed, iso3);
  const object = latestEnvelope.object;
  const id = String(object.object_id ?? "");
  if (
    !OBJECT_RE.test(id) ||
    object.subject?.type !== "country" ||
    object.subject?.id !== iso3 ||
    object.verification?.status !== "VERIFIED" ||
    object.commercial_eligibility?.status !== "VERIFIED" ||
    !HASH_RE.test(String(object.integrity?.payload_hash ?? "")) ||
    !String(object.integrity?.signing_key_id ?? "").trim()
  ) {
    throw new Error(`D1_GRO_INDEX_RECORD_CONTRACT_MISMATCH:${iso3}`);
  }
  if (!verifyRiskObjectSignature(object, keys).valid) {
    throw new Error(`D1_GRO_INDEX_SIGNATURE_INVALID:${id}`);
  }

  const generatedAt = new Date(String(object.generated_at));
  const expiresAt = new Date(String(object.expires_at));
  if (Number.isNaN(generatedAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    throw new Error(`D1_GRO_INDEX_TIME_INVALID:${id}`);
  }
  // Re-evaluate the canonical commercial policy at generation time. This proves
  // the indexed record was commercially eligible when produced without falsely
  // relabeling an expired historical object as fresh now.
  if (!verifyCommercialRiskObjectArtifact(object, { now: generatedAt }).deliverable) {
    throw new Error(`D1_GRO_INDEX_COMMERCIAL_POLICY_INVALID:${id}`);
  }

  const byIdKey = `geomacro-evidence/v1/live/country-gro/by-id/${id}.json.gz`;
  const byIdCompressed = await b2.getOptional(byIdKey);
  if (!byIdCompressed) throw new Error(`D1_GRO_INDEX_IMMUTABLE_B2_OBJECT_MISSING:${id}`);
  const byIdEnvelope = parseEnvelope(byIdCompressed, iso3);
  if (byIdEnvelope.object.object_id !== id) {
    throw new Error(`D1_GRO_INDEX_IMMUTABLE_B2_OBJECT_MISMATCH:${id}`);
  }

  const canonicalLatest = canonicalRiskObjectJson(object);
  const canonicalById = canonicalRiskObjectJson(byIdEnvelope.object);
  if (canonicalLatest !== canonicalById) {
    throw new Error(`D1_GRO_INDEX_LATEST_BY_ID_MISMATCH:${id}`);
  }
  if (!verifyRiskObjectSignature(byIdEnvelope.object, keys).valid) {
    throw new Error(`D1_GRO_INDEX_IMMUTABLE_SIGNATURE_INVALID:${id}`);
  }

  verified.push({
    object_id: id,
    schema_version: String(object.schema_version),
    subject_type: "country",
    subject_id: iso3,
    generated_at: generatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    verification_status: "VERIFIED",
    commercial_eligibility_status: "VERIFIED",
    signing_key_id: String(object.integrity.signing_key_id),
    payload_hash: String(object.integrity.payload_hash),
    record_sha256: sha256(Buffer.from(canonicalLatest, "utf8")),
    archive_key: byIdKey,
    archive_sha256: sha256(byIdCompressed),
  });
}

if (!verified.length) throw new Error("D1_GRO_INDEX_NO_VERIFIED_B2_COUNTRY_ROWS");
verified.sort((a, b) => a.object_id.localeCompare(b.object_id));
const sourceChecksum = checksum(verified);
const now = new Date().toISOString();
const statements = verified.map((row) => `INSERT INTO risk_object_index (object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,updated_at) VALUES (${sqlText(row.object_id)},${sqlText(row.schema_version)},${sqlText(row.subject_type)},${sqlText(row.subject_id)},${sqlText(row.generated_at)},${sqlText(row.expires_at)},${sqlText(row.verification_status)},${sqlText(row.commercial_eligibility_status)},${sqlText(row.signing_key_id)},${sqlText(row.payload_hash)},${sqlText(row.record_sha256)},${sqlText(row.archive_key)},${sqlText(row.archive_sha256)},${sqlText(now)}) ON CONFLICT(object_id) DO UPDATE SET schema_version=excluded.schema_version,subject_type=excluded.subject_type,subject_id=excluded.subject_id,generated_at=excluded.generated_at,expires_at=excluded.expires_at,verification_status=excluded.verification_status,commercial_eligibility_status=excluded.commercial_eligibility_status,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,updated_at=excluded.updated_at;`);
wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--command", statements.join("\n")]);

const readbackRaw = wrangler([
  "d1",
  "execute",
  "DB",
  "--remote",
  "--json",
  "--config",
  D1_CONFIG,
  "--command",
  "SELECT object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256 FROM risk_object_index ORDER BY object_id;",
]);
const ids = new Set(verified.map((row) => row.object_id));
const readback = parseD1(readbackRaw)
  .filter((row) => ids.has(String(row.object_id)))
  .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value)])))
  .sort((a, b) => a.object_id.localeCompare(b.object_id));
const targetChecksum = checksum(readback);
if (readback.length !== verified.length || targetChecksum !== sourceChecksum) {
  throw new Error("D1_GRO_INDEX_PARITY_FAILED");
}

const cursorSql = `INSERT INTO migration_cursor(dataset,source_system,cursor,rows_migrated,source_checksum,target_checksum,verified,updated_at) VALUES ('gro_index','verified_b2_country_continuity','latest_by_country',${verified.length},${sqlText(sourceChecksum)},${sqlText(targetChecksum)},1,${sqlText(now)}) ON CONFLICT(dataset) DO UPDATE SET source_system=excluded.source_system,cursor=excluded.cursor,rows_migrated=excluded.rows_migrated,source_checksum=excluded.source_checksum,target_checksum=excluded.target_checksum,verified=1,updated_at=excluded.updated_at;`;
wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--command", cursorSql]);

console.log(JSON.stringify({
  ok: true,
  mode: "verified_b2_gro_index_backfill",
  countries_scanned: countries.length,
  rows: verified.length,
  source_checksum: sourceChecksum,
  target_checksum: targetChecksum,
  record_sha256_source: "canonical_verified_b2_readback",
  immutable_archive_source: "b2_country_gro_by_id",
  supabase_contacted: false,
  supabase_payload_used_for_record_hash: false,
  destructive_changes: false,
  production_cutover: false,
  b2_requests: b2.usage(),
  generated_at: now,
}));
