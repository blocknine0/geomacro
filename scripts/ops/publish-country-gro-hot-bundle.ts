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
const D1_CONFIG = join(process.cwd(), "workers", "control-plane", "wrangler.country-gro-hot.runtime.jsonc");
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const D1_BATCH_MAX_BODY_BYTES = 1_500_000;
const D1_BATCH_MAX_QUERIES = 16;
const D1_READBACK_BATCH_SIZE = 4;
const MANIFEST_FILE = String(
  process.env.COUNTRY_GRO_HOT_PUBLISH_OUTPUT ??
    join(OUT_DIR, "country-gro-hot-publish.json"),
).trim();
const HASH_RE = /^[a-f0-9]{64}$/;
const sha256 = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const CLOUDFLARE_API_TOKEN = String(process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
const CLOUDFLARE_ACCOUNT_ID = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();

if (
  String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY ||
  !CLOUDFLARE_API_TOKEN ||
  !CLOUDFLARE_ACCOUNT_ID
) throw new Error("COUNTRY_GRO_HOT_CONFIG_INVALID");

function wrangler(args: string[], cwd = process.cwd()) {
  // The parent publisher may need NODE_OPTIONS for the direct-Postgres
  // Supabase compatibility loader. Wrangler/npx is an independent Cloudflare
  // control-plane process and must never inherit that application loader.
  // In production the inherited relative loader caused `wrangler d1 list`
  // to exit before returning JSON even though Cloudflare credentials were
  // valid. Preserve all credentials but remove only NODE_OPTIONS.
  const childEnv = { ...process.env };
  delete childEnv.NODE_OPTIONS;
  return execFileSync("npx", ["-y", `wrangler@${WRANGLER_VERSION}`, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: childEnv,
  });
}

type D1Query = {
  sql: string;
  params: string[];
};

async function resolveD1DatabaseId() {
  const url = new URL(
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/d1/database`,
  );
  url.searchParams.set("name", D1_DATABASE_NAME);
  url.searchParams.set("per_page", "10");
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.result)) {
    throw new Error(
      `COUNTRY_GRO_HOT_D1_LIST_FAILED:${String(payload?.errors?.[0]?.code ?? response.status)}`,
    );
  }
  const matches = payload.result.filter(
    (row: any) => String(row?.name ?? "") === D1_DATABASE_NAME,
  );
  const databaseId = String(matches[0]?.uuid ?? "");
  if (matches.length !== 1 || !/^[0-9a-f-]{20,}$/i.test(databaseId)) {
    throw new Error("COUNTRY_GRO_HOT_D1_DATABASE_NOT_FOUND");
  }
  return databaseId;
}

async function d1BatchQuery(
  databaseId: string,
  batch: D1Query[],
): Promise<Array<Array<Record<string, unknown>>>> {
  if (!batch.length) return [];
  const body = JSON.stringify({ batch });
  if (Buffer.byteLength(body, "utf8") > D1_BATCH_MAX_BODY_BYTES) {
    throw new Error("COUNTRY_GRO_HOT_D1_BATCH_BODY_TOO_LARGE");
  }
  const endpoint =
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/d1/database/${encodeURIComponent(databaseId)}/query`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || payload?.success !== true || !Array.isArray(payload?.result)) {
    throw new Error(
      `COUNTRY_GRO_HOT_D1_QUERY_FAILED:${String(payload?.errors?.[0]?.code ?? response.status)}`,
    );
  }
  if (
    payload.result.length !== batch.length ||
    payload.result.some((entry: any) => entry?.success !== true)
  ) {
    throw new Error("COUNTRY_GRO_HOT_D1_QUERY_RESULT_INVALID");
  }
  return payload.result.map((entry: any) =>
    Array.isArray(entry?.results) ? entry.results : [],
  );
}

function boundedD1Batches(queries: D1Query[]) {
  const batches: D1Query[][] = [];
  let current: D1Query[] = [];
  for (const query of queries) {
    const candidate = [...current, query];
    const bytes = Buffer.byteLength(JSON.stringify({ batch: candidate }), "utf8");
    if (
      current.length > 0 &&
      (candidate.length > D1_BATCH_MAX_QUERIES || bytes > D1_BATCH_MAX_BODY_BYTES)
    ) {
      batches.push(current);
      current = [query];
    } else {
      current = candidate;
    }
    if (
      Buffer.byteLength(JSON.stringify({ batch: current }), "utf8") >
      D1_BATCH_MAX_BODY_BYTES
    ) {
      throw new Error("COUNTRY_GRO_HOT_D1_SINGLE_QUERY_BODY_TOO_LARGE");
    }
  }
  if (current.length) batches.push(current);
  return batches;
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

const databaseId = await resolveD1DatabaseId();
const example = readFileSync("workers/control-plane/wrangler.example.jsonc", "utf8");
writeFileSync(D1_CONFIG, example.replace("REPLACE_WITH_D1_DATABASE_ID", databaseId), { mode: 0o600 });
wrangler(["d1", "migrations", "apply", "DB", "--remote", "--config", D1_CONFIG], process.cwd());

const now = new Date().toISOString();
const hotUpsertSql =
  "INSERT INTO country_gro_verified_hot (country_iso3,object_id,schema_version,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,archive_readback_verified,object_json,verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(country_iso3) DO UPDATE SET object_id=excluded.object_id,schema_version=excluded.schema_version,generated_at=excluded.generated_at,expires_at=excluded.expires_at,signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,archive_write_acknowledged=1,archive_readback_verified=0,object_json=excluded.object_json,verified_at=excluded.verified_at,updated_at=excluded.updated_at";
const indexUpsertSql =
  "INSERT INTO risk_object_index (object_id,schema_version,subject_type,subject_id,generated_at,expires_at,verification_status,commercial_eligibility_status,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(object_id) DO UPDATE SET schema_version=excluded.schema_version,subject_type='country',subject_id=excluded.subject_id,generated_at=excluded.generated_at,expires_at=excluded.expires_at,verification_status='VERIFIED',commercial_eligibility_status='VERIFIED',signing_key_id=excluded.signing_key_id,payload_hash=excluded.payload_hash,record_sha256=excluded.record_sha256,archive_key=excluded.archive_key,archive_sha256=excluded.archive_sha256,updated_at=excluded.updated_at";

const writeQueries: D1Query[] = [];
for (const row of entries) {
  writeQueries.push({
    sql: hotUpsertSql,
    params: [
      row.country_iso3,
      row.object_id,
      row.schema_version,
      row.generated_at,
      row.expires_at,
      row.signing_key_id,
      row.payload_hash,
      row.record_sha256,
      bundleKey,
      bundleSha,
      "1",
      "0",
      row.object_json,
      now,
      now,
    ],
  });
  writeQueries.push({
    sql: indexUpsertSql,
    params: [
      row.object_id,
      row.schema_version,
      "country",
      row.country_iso3,
      row.generated_at,
      row.expires_at,
      "VERIFIED",
      "VERIFIED",
      row.signing_key_id,
      row.payload_hash,
      row.record_sha256,
      bundleKey,
      bundleSha,
      now,
    ],
  });
}

const writeBatches = boundedD1Batches(writeQueries);
for (const batch of writeBatches) {
  await d1BatchQuery(databaseId, batch);
}

const readbackSelectSql =
  "SELECT country_iso3,object_id,generated_at,expires_at,signing_key_id,payload_hash,record_sha256,archive_key,archive_sha256,archive_write_acknowledged,archive_readback_verified,object_json FROM country_gro_verified_hot WHERE country_iso3 = ?";
const actual: Array<Record<string, unknown>> = [];
let readbackBatchCount = 0;
for (let index = 0; index < entries.length; index += D1_READBACK_BATCH_SIZE) {
  const slice = entries.slice(index, index + D1_READBACK_BATCH_SIZE);
  const resultSets = await d1BatchQuery(
    databaseId,
    slice.map((row) => ({
      sql: readbackSelectSql,
      params: [row.country_iso3],
    })),
  );
  readbackBatchCount += 1;
  for (const rows of resultSets) {
    if (rows.length !== 1) {
      throw new Error("COUNTRY_GRO_HOT_D1_READBACK_ROW_INVALID");
    }
    actual.push(rows[0]);
  }
}

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
  global_195_coverage_claimed: false,
  only_verified_current_objects_admitted: true,
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
  d1_parameterized_writes: true,
  d1_write_batch_count: writeBatches.length,
  d1_readback_batch_count: readbackBatchCount,
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
