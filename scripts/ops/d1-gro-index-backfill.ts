#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { createB2Client } from "./b2-s3-client.mjs";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../../src/lib/risk-object-signing.server";

const PROJECT = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const D1_CONFIG = String(process.env.D1_CONFIG ?? "workers/control-plane/wrangler.runtime.jsonc").trim();
const WRANGLER_VERSION = String(process.env.WRANGLER_VERSION ?? "4.136.3").trim();
const limitRaw = Number(process.env.D1_GRO_INDEX_LIMIT ?? 128);
const LIMIT = Number.isInteger(limitRaw) ? Math.max(1, Math.min(512, limitRaw)) : 128;
const D1_WRITE_BATCH_SIZE = 12;
const DB_URL = String(process.env.SUPABASE_DB_URL ?? "").trim();

if (!DB_URL) throw new Error("D1_GRO_INDEX_DB_URL_REQUIRED");
let parsedDb: URL;
try {
  parsedDb = new URL(DB_URL);
} catch {
  throw new Error("D1_GRO_INDEX_DB_URL_INVALID");
}
if (!["postgres:", "postgresql:"].includes(parsedDb.protocol) || !parsedDb.password || parsedDb.pathname !== "/postgres") {
  throw new Error("D1_GRO_INDEX_DB_URL_INVALID");
}
const directDb = parsedDb.hostname === `db.${PROJECT}.supabase.co` && parsedDb.username === "postgres";
const poolerDb = parsedDb.hostname.endsWith(".pooler.supabase.com") && parsedDb.username === `postgres.${PROJECT}`;
if (!directDb && !poolerDb) throw new Error("D1_GRO_INDEX_DB_TARGET_INVALID");
if (String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
    !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY) {
  throw new Error("D1_GRO_INDEX_B2_CONFIG_INVALID");
}
if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
  throw new Error("D1_GRO_INDEX_CLOUDFLARE_CONFIG_INVALID");
}

const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const HASH_RE = /^[a-f0-9]{64}$/;
const OBJECT_RE = /^gro_[A-Za-z0-9_]+$/;
const sqlText = (value: unknown) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
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
function executeD1Statements(statements: string[]): number {
  let batches = 0;
  for (let offset = 0; offset < statements.length; offset += D1_WRITE_BATCH_SIZE) {
    const batch = statements.slice(offset, offset + D1_WRITE_BATCH_SIZE);
    wrangler([
      "d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG,
      "--command", batch.join("\n"),
    ]);
    batches += 1;
  }
  return batches;
}
function parseD1(raw: string) {
  const parsed = JSON.parse(raw);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  const rows = envelopes.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);
  return rows as Array<Record<string, unknown>>;
}
function psqlJson(sql: string) {
  const stdout = execFileSync("psql", [DB_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  return stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) as Array<Record<string, unknown>>;
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

const data = psqlJson(`
  SELECT row_to_json(x)::text FROM (
    SELECT object_id,schema_version,subject_type,subject_id,generated_at,expires_at,
           verification_status,commercial_eligibility_status,signing_key_id,payload_hash,
           archive_key,archive_sha256,archive_bundle_key
      FROM public.geomacro_risk_objects
     WHERE verification_status='VERIFIED'
       AND commercial_eligibility_status='VERIFIED'
       AND archive_key IS NOT NULL
       AND archive_bundle_key IS NULL
     ORDER BY generated_at DESC
     LIMIT ${LIMIT}
  ) x;
`);

const verified: Array<Record<string, string>> = [];
for (const row of data) {
  const id = String(row.object_id ?? "");
  if (!OBJECT_RE.test(id)) throw new Error(`D1_GRO_INDEX_OBJECT_ID_INVALID:${id}`);
  const pointer = `risk-object-archive/v1/${id}.json.gz`;
  const archiveKey = `geomacro-evidence/v1/gro/${id}.json.gz`;
  if (row.archive_key !== pointer || !HASH_RE.test(String(row.archive_sha256 ?? "")) ||
      !HASH_RE.test(String(row.payload_hash ?? ""))) {
    throw new Error(`D1_GRO_INDEX_POINTER_INVALID:${id}`);
  }

  const compressed = await b2.get(archiveKey);
  if (compressed.length > 2_000_000 || sha256(compressed) !== row.archive_sha256) {
    throw new Error(`D1_GRO_INDEX_ARCHIVE_HASH_MISMATCH:${id}`);
  }
  const raw = gunzipSync(compressed, { maxOutputLength: 4_000_000 });
  const object = JSON.parse(raw.toString("utf8"));
  if (object?.object_id !== id ||
      object?.schema_version !== row.schema_version ||
      object?.subject?.type !== row.subject_type ||
      object?.subject?.id !== row.subject_id ||
      object?.integrity?.payload_hash !== row.payload_hash ||
      object?.integrity?.signing_key_id !== row.signing_key_id ||
      object?.verification?.status !== "VERIFIED" ||
      object?.commercial_eligibility?.status !== "VERIFIED") {
    throw new Error(`D1_GRO_INDEX_RECORD_CONTRACT_MISMATCH:${id}`);
  }
  if (!verifyRiskObjectSignature(object, keys).valid) {
    throw new Error(`D1_GRO_INDEX_SIGNATURE_INVALID:${id}`);
  }

  const recordSha256 = sha256(Buffer.from(canonicalRiskObjectJson(object), "utf8"));
  verified.push({
    object_id: id,
    schema_version: String(row.schema_version),
    subject_type: String(row.subject_type),
    subject_id: String(row.subject_id),
    generated_at: new Date(String(row.generated_at)).toISOString(),
    expires_at: new Date(String(row.expires_at)).toISOString(),
    verification_status: "VERIFIED",
    commercial_eligibility_status: "VERIFIED",
    signing_key_id: String(row.signing_key_id),
    payload_hash: String(row.payload_hash),
    record_sha256: recordSha256,
    archive_key: archiveKey,
    archive_sha256: String(row.archive_sha256),
  });
}

if (!verified.length) throw new Error("D1_GRO_INDEX_NO_STANDALONE_VERIFIED_B2_ROWS");
verified.sort((a, b) => a.object_id.localeCompare(b.object_id));
const sourceChecksum = checksum(verified);
const now = new Date().toISOString();
const statements = verified.map((row) => `INSERT INTO risk_object_index (object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,updated_at) VALUES (${sqlText(row.object_id)},${sqlText(row.schema_version)},${sqlText(row.subject_type)},${sqlText(row.subject_id)},${sqlText(row.generated_at)},${sqlText(row.expires_at)},${sqlText(row.verification_status)},${sqlText(row.commercial_eligibility_status)},${sqlText(row.signing_key_id)},${sqlText(row.payload_hash)},${sqlText(row.record_sha256)},${sqlText(row.archive_key)},${sqlText(row.archive_sha256)},${sqlText(now)}) ON CONFLICT(object_id) DO UPDATE SET schema_version=excluded.schema_version,subject_type=excluded.subject_type,subject_id=excluded.subject_id,generated_at=excluded.generated_at,expires_at=excluded.expires_at,verification_status=excluded.verification_status,commercial_eligibility_status=excluded.commercial_eligibility_status,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,updated_at=excluded.updated_at;`);
const writeBatches = executeD1Statements(statements);

const readbackRaw = wrangler([
  "d1", "execute", "DB", "--remote", "--json", "--config", D1_CONFIG,
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

const cursorSql = `INSERT INTO migration_cursor(dataset,source_system,cursor,rows_migrated,source_checksum,target_checksum,verified,updated_at) VALUES ('gro_index','verified_b2_standalone','full',${verified.length},${sqlText(sourceChecksum)},${sqlText(targetChecksum)},1,${sqlText(now)}) ON CONFLICT(dataset) DO UPDATE SET source_system=excluded.source_system,cursor=excluded.cursor,rows_migrated=excluded.rows_migrated,source_checksum=excluded.source_checksum,target_checksum=excluded.target_checksum,verified=1,updated_at=excluded.updated_at;`;
wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--command", cursorSql]);

console.log(JSON.stringify({
  ok: true,
  mode: "verified_b2_gro_index_backfill",
  rows: verified.length,
  write_batches: writeBatches,
  d1_write_batch_size: D1_WRITE_BATCH_SIZE,
  source_checksum: sourceChecksum,
  target_checksum: targetChecksum,
  metadata_source: "direct_postgres_export",
  supabase_rest_used: false,
  record_sha256_source: "canonical_verified_b2_readback",
  supabase_payload_used_for_record_hash: false,
  destructive_changes: false,
  production_cutover: false,
  b2_requests: b2.usage(),
  generated_at: now,
}));
