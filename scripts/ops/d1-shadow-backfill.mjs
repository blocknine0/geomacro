#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT = "ldpwajisioljyjtojvfx";
const DB_URL = String(process.env.SUPABASE_DB_URL || "").trim();
const D1_CONFIG = String(process.env.D1_CONFIG || "workers/control-plane/wrangler.runtime.jsonc").trim();
const WRANGLER_VERSION = String(process.env.WRANGLER_VERSION || "4.136.3").trim();
const OUT_DIR = path.join(process.cwd(), "artifacts", "d1-shadow-backfill");
const SOURCE_KEY_RE = /^[a-z0-9][a-z0-9_.:-]{1,127}$/;
const COUNTRY_RE = /^[A-Z]{3}$/;
const DOMAIN_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const STATUS_RE = /^[A-Z0-9][A-Z0-9_-]{1,63}$/;

if (!DB_URL) throw new Error("SUPABASE_DB_URL is required");
let db;
try { db = new URL(DB_URL); } catch { throw new Error("SUPABASE_DB_URL must be a valid PostgreSQL URL"); }
if (!["postgres:", "postgresql:"].includes(db.protocol)) throw new Error("SUPABASE_DB_URL must use postgres/postgresql");
if (!db.password || db.pathname !== "/postgres") throw new Error("Invalid production database target");
const directOk = db.hostname === `db.${PROJECT}.supabase.co` && db.username === "postgres";
const poolerOk = db.hostname.endsWith(".pooler.supabase.com") && db.username === `postgres.${PROJECT}`;
if (!directOk && !poolerOk) throw new Error("Refusing D1 backfill outside the authoritative Supabase project");

await fs.mkdir(OUT_DIR, { recursive: true });

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function checksum(rows) {
  return createHash("sha256").update(rows.map(canonical).join("\n")).digest("hex");
}
function sqlText(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function boolInt(value) { return value === true ? 1 : 0; }
function iso(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`INVALID_TIMESTAMP:${value}`);
  return new Date(ms).toISOString();
}
function status(value, label) {
  const out = String(value ?? "").trim().toUpperCase();
  if (!STATUS_RE.test(out)) throw new Error(`INVALID_${label}_STATUS:${out}`);
  return out;
}
async function psqlJson(sql) {
  const { stdout } = await execFileAsync("psql", [DB_URL, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", sql], { maxBuffer: 32 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
async function wrangler(args) {
  const { stdout } = await execFileAsync("npx", ["-y", `wrangler@${WRANGLER_VERSION}`, ...args], {
    maxBuffer: 48 * 1024 * 1024,
    env: process.env,
  });
  return stdout;
}
function parseD1Json(raw) {
  const parsed = JSON.parse(raw);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  const first = envelopes.find((entry) => Array.isArray(entry?.results));
  if (!first || first.success === false) throw new Error("D1_READBACK_FAILED");
  return first.results;
}

const sourceRaw = await psqlJson(`
  SELECT row_to_json(x)::text FROM (
    SELECT
      c.source_id AS source_key,
      (
        EXISTS (SELECT 1 FROM public.live_global_source_universe u WHERE u.source_id=c.source_id AND u.required=true)
        OR EXISTS (SELECT 1 FROM public.live_external_sources e WHERE e.source_id=c.source_id AND (e.enabled_for_ingestion=true OR e.enabled_for_commercial_signals=true))
      ) AS enabled,
      c.certification_state,
      c.rights_status,
      c.endpoint_status,
      c.schema_status,
      c.freshness_status,
      c.provenance_status,
      c.independence_status,
      c.runtime_status,
      c.fallback_status,
      COALESCE(c.endpoint_observed_at, c.freshness_last_observed_at, c.updated_at) AS last_checked_at,
      NULL::timestamptz AS next_check_at,
      jsonb_strip_nulls(jsonb_build_object(
        'endpoint_disposition', c.endpoint_disposition,
        'independence_group', c.independence_group,
        'independent_source_count', c.independent_source_count,
        'adapter_status', c.adapter_status,
        'fallback_source_id', c.fallback_source_id,
        'certification_hash', c.certification_hash
      )) AS metadata
    FROM public.live_source_certification_records c
    ORDER BY c.source_id
  ) x;
`);

const matrixRaw = await psqlJson(`
  SELECT row_to_json(x)::text FROM (
    SELECT
      m.iso3 AS country_code,
      m.domain,
      CASE
        WHEN m.production_ready THEN 'PRODUCTION_READY'
        WHEN m.realtime_fallback_eligible THEN 'FALLBACK_ELIGIBLE'
        ELSE 'UNAVAILABLE'
      END AS readiness_status,
      GREATEST(COALESCE(m.certified_fresh_runtime_path_count,0),0)::int AS certified_source_count,
      GREATEST(COALESCE(m.enabled_target_count,0)-COALESCE(m.certified_fresh_runtime_path_count,0),0)::int AS review_source_count,
      CASE WHEN COALESCE(m.availability_state,'')='UNAVAILABLE' THEN 1 ELSE 0 END AS unavailable_source_count,
      m.latest_success_at AS last_verified_at,
      jsonb_strip_nulls(jsonb_build_object(
        'iso2', m.iso2,
        'country_name', m.country_name,
        'source_category', m.source_category,
        'max_age_seconds', m.max_age_seconds,
        'enabled_target_count', m.enabled_target_count,
        'fresh_target_count', m.fresh_target_count,
        'certified_fallback_path_count', m.certified_fallback_path_count,
        'raw_runtime_fresh', m.raw_runtime_fresh,
        'production_ready', m.production_ready,
        'realtime_fallback_eligible', m.realtime_fallback_eligible,
        'availability_state', m.availability_state,
        'missing_reason', m.missing_reason
      )) AS metadata
    FROM public.live_country_category_coverage_matrix m
    ORDER BY m.iso3, m.domain
  ) x;
`);

const statusRows = await psqlJson(`
  SELECT row_to_json(x)::text FROM (
    SELECT enabled_country_count::int, required_domain_count::int, expected_matrix_rows::int,
           actual_matrix_rows::int, production_ready_rows::int, fallback_eligible_rows::int,
           unavailable_rows::int, matrix_contract_complete
    FROM public.live_country_category_coverage_matrix_status
    LIMIT 1
  ) x;
`);
if (statusRows.length !== 1) throw new Error("MATRIX_STATUS_MISSING");
const matrixStatus = statusRows[0];
if (!matrixStatus.matrix_contract_complete || Number(matrixStatus.actual_matrix_rows) !== Number(matrixStatus.expected_matrix_rows)) {
  throw new Error("SOURCE_MATRIX_NOT_COMPLETE");
}

const sources = sourceRaw.map((row) => {
  if (!SOURCE_KEY_RE.test(row.source_key)) throw new Error(`INVALID_SOURCE_KEY:${row.source_key}`);
  return {
    source_key: row.source_key,
    enabled: row.enabled === true,
    certification_status: status(row.certification_state, "CERTIFICATION"),
    rights_status: status(row.rights_status, "RIGHTS"),
    endpoint_status: status(row.endpoint_status, "ENDPOINT"),
    schema_status: status(row.schema_status, "SCHEMA"),
    freshness_status: status(row.freshness_status, "FRESHNESS"),
    provenance_status: status(row.provenance_status, "PROVENANCE"),
    independence_status: status(row.independence_status, "INDEPENDENCE"),
    runtime_status: status(row.runtime_status, "RUNTIME"),
    fallback_status: status(row.fallback_status, "FALLBACK"),
    last_checked_at: iso(row.last_checked_at),
    next_check_at: null,
    metadata: row.metadata ?? {},
  };
});
const matrix = matrixRaw.map((row) => {
  if (!COUNTRY_RE.test(row.country_code)) throw new Error(`INVALID_COUNTRY:${row.country_code}`);
  if (!DOMAIN_RE.test(row.domain)) throw new Error(`INVALID_DOMAIN:${row.domain}`);
  return {
    country_code: row.country_code,
    domain: row.domain,
    readiness_status: status(row.readiness_status, "READINESS"),
    certified_source_count: Number(row.certified_source_count),
    review_source_count: Number(row.review_source_count),
    unavailable_source_count: Number(row.unavailable_source_count),
    last_verified_at: iso(row.last_verified_at),
    metadata: row.metadata ?? {},
  };
});

if (sources.length < 900) throw new Error(`SOURCE_STATE_UNEXPECTEDLY_SMALL:${sources.length}`);
if (matrix.length !== Number(matrixStatus.expected_matrix_rows)) throw new Error(`MATRIX_ROW_COUNT_MISMATCH:${matrix.length}`);

const sourceChecksum = checksum(sources);
const matrixChecksum = checksum(matrix);
const now = new Date().toISOString();
const statements = [];
for (const row of sources) {
  statements.push(`INSERT INTO source_state (source_key,enabled,certification_status,rights_status,endpoint_status,schema_status,freshness_status,provenance_status,independence_status,runtime_status,fallback_status,last_checked_at,next_check_at,metadata_json,updated_at) VALUES (${sqlText(row.source_key)},${boolInt(row.enabled)},${sqlText(row.certification_status)},${sqlText(row.rights_status)},${sqlText(row.endpoint_status)},${sqlText(row.schema_status)},${sqlText(row.freshness_status)},${sqlText(row.provenance_status)},${sqlText(row.independence_status)},${sqlText(row.runtime_status)},${sqlText(row.fallback_status)},${sqlText(row.last_checked_at)},NULL,${sqlText(JSON.stringify(row.metadata))},${sqlText(now)}) ON CONFLICT(source_key) DO UPDATE SET enabled=excluded.enabled,certification_status=excluded.certification_status,rights_status=excluded.rights_status,endpoint_status=excluded.endpoint_status,schema_status=excluded.schema_status,freshness_status=excluded.freshness_status,provenance_status=excluded.provenance_status,independence_status=excluded.independence_status,runtime_status=excluded.runtime_status,fallback_status=excluded.fallback_status,last_checked_at=excluded.last_checked_at,next_check_at=excluded.next_check_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at;`);
}
for (const row of matrix) {
  statements.push(`INSERT INTO country_domain_state (country_code,domain,readiness_status,certified_source_count,review_source_count,unavailable_source_count,last_verified_at,metadata_json,updated_at) VALUES (${sqlText(row.country_code)},${sqlText(row.domain)},${sqlText(row.readiness_status)},${row.certified_source_count},${row.review_source_count},${row.unavailable_source_count},${sqlText(row.last_verified_at)},${sqlText(JSON.stringify(row.metadata))},${sqlText(now)}) ON CONFLICT(country_code,domain) DO UPDATE SET readiness_status=excluded.readiness_status,certified_source_count=excluded.certified_source_count,review_source_count=excluded.review_source_count,unavailable_source_count=excluded.unavailable_source_count,last_verified_at=excluded.last_verified_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at;`);
}
const sqlPath = path.join(OUT_DIR, "shadow-backfill.sql");
await fs.writeFile(sqlPath, statements.join("\n"));

await wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--file", sqlPath]);

const sourceReadback = parseD1Json(await wrangler(["d1", "execute", "DB", "--remote", "--json", "--config", D1_CONFIG, "--command", "SELECT source_key,enabled,certification_status,rights_status,endpoint_status,schema_status,freshness_status,provenance_status,independence_status,runtime_status,fallback_status,last_checked_at,next_check_at,metadata_json FROM source_state ORDER BY source_key;"])).map((row) => ({
  source_key: row.source_key,
  enabled: Number(row.enabled) === 1,
  certification_status: row.certification_status,
  rights_status: row.rights_status,
  endpoint_status: row.endpoint_status,
  schema_status: row.schema_status,
  freshness_status: row.freshness_status,
  provenance_status: row.provenance_status,
  independence_status: row.independence_status,
  runtime_status: row.runtime_status,
  fallback_status: row.fallback_status,
  last_checked_at: row.last_checked_at,
  next_check_at: row.next_check_at,
  metadata: JSON.parse(row.metadata_json || "{}"),
}));
const matrixReadback = parseD1Json(await wrangler(["d1", "execute", "DB", "--remote", "--json", "--config", D1_CONFIG, "--command", "SELECT country_code,domain,readiness_status,certified_source_count,review_source_count,unavailable_source_count,last_verified_at,metadata_json FROM country_domain_state ORDER BY country_code,domain;"])).map((row) => ({
  country_code: row.country_code,
  domain: row.domain,
  readiness_status: row.readiness_status,
  certified_source_count: Number(row.certified_source_count),
  review_source_count: Number(row.review_source_count),
  unavailable_source_count: Number(row.unavailable_source_count),
  last_verified_at: row.last_verified_at,
  metadata: JSON.parse(row.metadata_json || "{}"),
}));

const targetSourceChecksum = checksum(sourceReadback);
const targetMatrixChecksum = checksum(matrixReadback);
if (sourceReadback.length !== sources.length || targetSourceChecksum !== sourceChecksum) throw new Error("SOURCE_STATE_PARITY_FAILED");
if (matrixReadback.length !== matrix.length || targetMatrixChecksum !== matrixChecksum) throw new Error("COUNTRY_DOMAIN_PARITY_FAILED");

const cursorSql = `
INSERT INTO migration_cursor(dataset,source_system,cursor,rows_migrated,source_checksum,target_checksum,verified,updated_at)
VALUES ('source_state','supabase','full',${sources.length},${sqlText(sourceChecksum)},${sqlText(targetSourceChecksum)},1,${sqlText(now)})
ON CONFLICT(dataset) DO UPDATE SET source_system=excluded.source_system,cursor=excluded.cursor,rows_migrated=excluded.rows_migrated,source_checksum=excluded.source_checksum,target_checksum=excluded.target_checksum,verified=1,updated_at=excluded.updated_at;
INSERT INTO migration_cursor(dataset,source_system,cursor,rows_migrated,source_checksum,target_checksum,verified,updated_at)
VALUES ('country_domain_state','supabase','full',${matrix.length},${sqlText(matrixChecksum)},${sqlText(targetMatrixChecksum)},1,${sqlText(now)})
ON CONFLICT(dataset) DO UPDATE SET source_system=excluded.source_system,cursor=excluded.cursor,rows_migrated=excluded.rows_migrated,source_checksum=excluded.source_checksum,target_checksum=excluded.target_checksum,verified=1,updated_at=excluded.updated_at;
`;
await wrangler(["d1", "execute", "DB", "--remote", "--yes", "--config", D1_CONFIG, "--command", cursorSql]);

const summary = {
  ok: true,
  mode: "shadow_backfill_only",
  source_state: { rows: sources.length, checksum: sourceChecksum },
  country_domain_state: { rows: matrix.length, checksum: matrixChecksum, matrix_status: matrixStatus },
  gro_index: { migrated: false, reason: "record_sha256 must come from independently verified canonical/B2 artifact, not inferred from the Supabase row" },
  destructive_changes: false,
  production_cutover: false,
  generated_at: now,
};
await fs.writeFile(path.join(OUT_DIR, "verification-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
