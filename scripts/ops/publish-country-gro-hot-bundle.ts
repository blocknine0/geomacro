#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import { createGriDbClient } from "../lib/gri-db-client.mjs";
import { createB2Client } from "./b2-s3-client.mjs";
import {
  canonicalRiskObjectJson,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "../../src/lib/risk-object-signing.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import { PUBLIC_DEMO_RISK_PROFILE_REASON } from "../../src/lib/public-demo-risk-profile";

const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";
const BUNDLE_SCHEMA = "geomacro.country-gro-verified-hot-bundle.v1";
const PROOF_SCHEMA = "geomacro.country-gro-verified-hot-proof.v1";
const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/hot-bundle-proof.json";
const D1_DATABASE_NAME = String(process.env.D1_DATABASE_NAME ?? "geomacro-control-plane").trim();
const WRANGLER_VERSION = String(process.env.WRANGLER_VERSION ?? "4.136.3").trim();
const MIN_READY = Math.max(1, Number(process.env.GLOBAL_GRO_D1_MIN_INDEXED ?? 195));
const OUT_DIR = join(process.cwd(), "artifacts", "global-gro-continuity");
const D1_CONFIG = join(OUT_DIR, "wrangler.country-gro-hot.jsonc");
const SQL_FILE = join(OUT_DIR, "country-gro-hot.sql");
const MANIFEST_FILE = join(OUT_DIR, "country-gro-hot-publish.json");
const HASH_RE = /^[a-f0-9]{64}$/;
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const sqlText = (value: unknown) =>
  value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

if (
  String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY ||
  !process.env.CLOUDFLARE_API_TOKEN ||
  !process.env.CLOUDFLARE_ACCOUNT_ID
) throw new Error("COUNTRY_GRO_HOT_CONFIG_INVALID");

function wrangler(args: string[], cwd = process.cwd()) {
  return execFileSync("npx", ["-y", `wrangler@${WRANGLER_VERSION}`, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
}

function parseD1(raw: string) {
  const parsed = JSON.parse(raw);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  return envelopes.flatMap((entry) =>
    Array.isArray(entry?.results) ? entry.results : [],
  ) as Array<Record<string, unknown>>;
}

mkdirSync(OUT_DIR, { recursive: true });

const registryResponse = await fetch("https://geomacro.live/api/risk-object-keys", {
  headers: { accept: "application/json", "cache-control": "no-cache" },
  signal: AbortSignal.timeout(15_000),
});
if (!registryResponse.ok) throw new Error(`COUNTRY_GRO_HOT_TRUST_REGISTRY_${registryResponse.status}`);
const registry = (await registryResponse.json()) as {
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
if (!Object.keys(keys).length) throw new Error("COUNTRY_GRO_HOT_TRUST_REGISTRY_EMPTY");

const db = createGriDbClient();
const evaluatedAt = new Date().toISOString();
const result = await db
  .from("geomacro_risk_objects")
  .select("subject_id,payload,generated_at,expires_at,commercial_eligibility_reason_codes")
  .eq("subject_type", "country")
  .eq("verification_status", "VERIFIED")
  .eq("commercial_eligibility_status", "VERIFIED")
  .gt("expires_at", evaluatedAt)
  .not("payload", "is", null)
  .order("generated_at", { ascending: false })
  .limit(1000);
if (result.error || !Array.isArray(result.data)) {
  throw new Error("COUNTRY_GRO_HOT_SOURCE_QUERY_INVALID");
}

const current = new Map<string, any>();
for (const row of result.data as Array<Record<string, unknown>>) {
  const iso3 = String(row.subject_id ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3) || current.has(iso3)) continue;
  const reasons = Array.isArray(row.commercial_eligibility_reason_codes)
    ? row.commercial_eligibility_reason_codes.map(String)
    : [];
  if (reasons.includes(PUBLIC_DEMO_RISK_PROFILE_REASON)) continue;
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) continue;
  current.set(iso3, row.payload);
}

const entries: Array<{
  country_iso3: string;
  object_id: string;
  schema_version: string;
  generated_at: string;
  expires_at: string;
  signing_key_id: string;
  payload_hash: string;
  record_sha256: string;
  object_json: string;
}> = [];

for (const iso3 of [...current.keys()].sort()) {
  const object = current.get(iso3);
  if (
    object?.subject?.type !== "country" ||
    object?.subject?.id !== iso3 ||
    object?.verification?.status !== "VERIFIED" ||
    object?.commercial_eligibility?.status !== "VERIFIED" ||
    !verifyRiskObjectSignature(object, keys).valid ||
    !verifyCommercialRiskObjectArtifact(object, { now: new Date(evaluatedAt) }).deliverable
  ) continue;
  const objectJson = canonicalRiskObjectJson(object);
  const recordSha = sha256(objectJson);
  const payloadHash = String(object?.integrity?.payload_hash ?? "");
  const signingKeyId = String(object?.integrity?.signing_key_id ?? "");
  if (!HASH_RE.test(recordSha) || !HASH_RE.test(payloadHash) || !signingKeyId) {
    throw new Error(`COUNTRY_GRO_HOT_HASH_INVALID:${iso3}`);
  }
  if (Buffer.byteLength(objectJson, "utf8") > 512 * 1024) {
    throw new Error(`COUNTRY_GRO_HOT_OBJECT_TOO_LARGE:${iso3}`);
  }
  entries.push({
    country_iso3: iso3,
    object_id: String(object.object_id),
    schema_version: String(object.schema_version),
    generated_at: String(object.generated_at),
    expires_at: String(object.expires_at),
    signing_key_id: signingKeyId,
    payload_hash: payloadHash,
    record_sha256: recordSha,
    object_json: objectJson,
  });
}

if (entries.length < MIN_READY) {
  throw new Error(`COUNTRY_GRO_HOT_READY_FLOOR_BREACH:${entries.length}<${MIN_READY}`);
}

const bundle = {
  schema: BUNDLE_SCHEMA,
  generated_at: evaluatedAt,
  source_project: SOURCE_PROJECT,
  country_count: entries.length,
  entries,
};
const bundleRaw = Buffer.from(JSON.stringify(bundle), "utf8");
const bundlePacked = gzipSync(bundleRaw, { level: 9 });
if (!bundlePacked.length || bundlePacked.length > 40 * 1024 * 1024) {
  throw new Error("COUNTRY_GRO_HOT_BUNDLE_SIZE_INVALID");
}
const localRestored = JSON.parse(
  gunzipSync(bundlePacked, { maxOutputLength: 120 * 1024 * 1024 }).toString("utf8"),
);
if (
  localRestored?.schema !== BUNDLE_SCHEMA ||
  localRestored?.country_count !== entries.length ||
  !Array.isArray(localRestored?.entries) ||
  localRestored.entries.length !== entries.length
) throw new Error("COUNTRY_GRO_HOT_LOCAL_BUNDLE_RESTORE_INVALID");

const bundleSha = sha256(bundlePacked);
const bundleId = evaluatedAt.replace(/[-:.]/g, "");
const bundleKey = `geomacro-evidence/v1/live/country-gro/hot-bundles/${bundleId}.json.gz`;
const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID!,
  secretKey: process.env.B2_APPLICATION_KEY!,
  bucket: B2_BUCKET,
});
await b2.put(bundleKey, bundlePacked);
const proof = Buffer.from(JSON.stringify({
  schema: PROOF_SCHEMA,
  generated_at: evaluatedAt,
  source_project: SOURCE_PROJECT,
  country_count: entries.length,
  bundle_schema: BUNDLE_SCHEMA,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_bytes: bundlePacked.length,
  archive_write_acknowledged: true,
  archive_readback_verified: false,
  archive_readback_deferred: true,
  serving_store: "cloudflare-d1",
  archive_store: "backblaze-b2",
  b2_gets_required_for_hot_serving: 0,
}), "utf8");
await b2.put(PROOF_KEY, proof);

const list = JSON.parse(wrangler(["d1", "list", "--json"])) as Array<{name?: string; uuid?: string; id?: string}>;
const databaseId = String(
  list.find((row) => row.name === D1_DATABASE_NAME)?.uuid ??
  list.find((row) => row.name === D1_DATABASE_NAME)?.id ?? "",
);
if (!/^[0-9a-f-]{20,}$/i.test(databaseId)) throw new Error("COUNTRY_GRO_HOT_D1_DATABASE_NOT_FOUND");
const example = readFileSync("workers/control-plane/wrangler.example.jsonc", "utf8");
writeFileSync(D1_CONFIG, example.replace("REPLACE_WITH_D1_DATABASE_ID", databaseId), { mode: 0o600 });
wrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", D1_CONFIG], process.cwd());

const now = new Date().toISOString();
const statements: string[] = [];
for (const row of entries) {
  statements.push(
    `INSERT INTO country_gro_verified_hot (country_iso3,object_id,schema_version,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,archive_readback_verified,object_json,verified_at,updated_at) VALUES (${sqlText(row.country_iso3)},${sqlText(row.object_id)},${sqlText(row.schema_version)},${sqlText(row.generated_at)},${sqlText(row.expires_at)},${sqlText(row.signing_key_id)},${sqlText(row.payload_hash)},${sqlText(row.record_sha256)},${sqlText(bundleKey)},${sqlText(bundleSha)},1,0,${sqlText(row.object_json)},${sqlText(now)},${sqlText(now)}) ON CONFLICT(country_iso3) DO UPDATE SET object_id=excluded.object_id,schema_version=excluded.schema_version,generated_at=excluded.generated_at,expires_at=excluded.expires_at,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,archive_write_acknowledged=1,archive_readback_verified=0,object_json=excluded.object_json,verified_at=excluded.verified_at,updated_at=excluded.updated_at;`,
  );
  statements.push(
    `INSERT INTO risk_object_index (object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,updated_at) VALUES (${sqlText(row.object_id)},${sqlText(row.schema_version)},'country',${sqlText(row.country_iso3)},${sqlText(row.generated_at)},${sqlText(row.expires_at)},'VERIFIED','VERIFIED',${sqlText(row.signing_key_id)},${sqlText(row.payload_hash)},${sqlText(row.record_sha256)},${sqlText(bundleKey)},${sqlText(bundleSha)},${sqlText(now)}) ON CONFLICT(object_id) DO UPDATE SET schema_version=excluded.schema_version,subject_type='country',subject_id=excluded.subject_id,generated_at=excluded.generated_at,expires_at=excluded.expires_at,verification_status='VERIFIED',commercial_eligibility_status='VERIFIED',signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,updated_at=excluded.updated_at;`,
  );
}
writeFileSync(SQL_FILE, statements.join("\n") + "\n", { mode: 0o600 });
wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--file", SQL_FILE]);

const readback = parseD1(wrangler([
  "d1", "execute", "DB", "--remote", "--json", "--config", D1_CONFIG,
  "--command",
  "SELECT country_iso3,object_id,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,archive_readback_verified,object_json FROM country_gro_verified_hot ORDER BY country_iso3;",
]));
const expected = new Map(entries.map((row) => [row.country_iso3, row]));
const actual = readback.filter((row) => expected.has(String(row.country_iso3)));
if (actual.length !== entries.length) {
  throw new Error(`COUNTRY_GRO_HOT_D1_READBACK_CARDINALITY_INVALID:${actual.length}`);
}
for (const row of actual) {
  const exp = expected.get(String(row.country_iso3))!;
  const objectJson = String(row.object_json ?? "");
  if (
    row.object_id !== exp.object_id ||
    row.record_sha256 !== exp.record_sha256 ||
    row.payload_hash !== exp.payload_hash ||
    row.archive_key !== bundleKey ||
    row.archive_sha256 !== bundleSha ||
    Number(row.archive_write_acknowledged) !== 1 ||
    sha256(objectJson) !== exp.record_sha256
  ) throw new Error(`COUNTRY_GRO_HOT_D1_READBACK_MISMATCH:${exp.country_iso3}`);
  const object = JSON.parse(objectJson);
  if (
    !verifyRiskObjectSignature(object, keys).valid ||
    !verifyCommercialRiskObjectArtifact(object, { now: new Date(evaluatedAt) }).deliverable
  ) throw new Error(`COUNTRY_GRO_HOT_D1_READBACK_VERIFY_FAILED:${exp.country_iso3}`);
}

const output = {
  ok: true,
  schema: "geomacro.country-gro-verified-hot-publish.v1",
  generated_at: evaluatedAt,
  country_count: entries.length,
  minimum_required: MIN_READY,
  bundle_key: bundleKey,
  bundle_sha256: bundleSha,
  bundle_bytes: bundlePacked.length,
  b2_bundle_put_acknowledged: true,
  b2_manifest_put_acknowledged: true,
  b2_put_count: 2,
  b2_get_count_for_hot_serving: 0,
  archive_readback_verified: false,
  archive_readback_deferred: true,
  archive_readback_required_for_hot_serving: false,
  d1_signed_gro_hot_verified: true,
  d1_readback_verified: true,
  signature_verified: true,
  commercial_eligibility_verified: true,
  raw_source_material_emitted: false,
  external_payment_performed: false,
  execution_authorized: false,
  destructive_b2_change: false,
  b2: b2.usage(),
};
writeFileSync(MANIFEST_FILE, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify(output, null, 2));
