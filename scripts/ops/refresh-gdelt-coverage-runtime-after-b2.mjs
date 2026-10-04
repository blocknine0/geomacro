#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createB2Client } from "./b2-s3-client.mjs";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const B2_BUCKET = "geomacro-private-archive";
const PROOF_KEY = "geomacro-evidence/v1/live/public-intelligence/latest-proof.json";
const SOURCE_ID = "gdelt_v2_events";
const SOURCE_CATEGORY = "GEOPOLITICS";
const TARGET_PREFIX = "GEO:COVERAGE_FALLBACK:";
const CURRENT_EVIDENCE_CONTRACT = "gdelt-v2-event-export-conflict-root-v1";
const PROOF_MAX_AGE_MS = 30 * 60 * 1000;
const GDELT_BATCH_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const CONTROL_REFRESH_MIN_AGE_MS = 90 * 60 * 1000;

function authoritativeDbUrl() {
  const raw = String(process.env.SUPABASE_DB_URL ?? "").trim();
  if (!raw) throw new Error("SUPABASE_DB_URL_REQUIRED");
  let db;
  try {
    db = new URL(raw);
  } catch {
    throw new Error("SUPABASE_DB_URL_INVALID");
  }
  const direct = db.hostname === `db.${PROJECT_REF}.supabase.co` && db.username === "postgres";
  const pooler = db.hostname.endsWith(".pooler.supabase.com") && db.username === `postgres.${PROJECT_REF}`;
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    (!direct && !pooler) ||
    !db.password ||
    db.pathname !== "/postgres"
  ) throw new Error("SUPABASE_DB_URL_NOT_AUTHORITATIVE");
  return raw;
}

function requiredIsoTimestamp(value, name, maxAgeMs) {
  const parsed = Date.parse(String(value ?? ""));
  const now = Date.now();
  if (!Number.isFinite(parsed)) throw new Error(`${name}_INVALID`);
  if (parsed > now + 5 * 60_000) throw new Error(`${name}_FUTURE`);
  if (now - parsed > maxAgeMs) throw new Error(`${name}_STALE`);
  return new Date(parsed).toISOString();
}

function assertProof(proof) {
  if (proof?.schema !== "geomacro.public-intelligence-live-proof.v1") throw new Error("GDELT_COVERAGE_PROOF_SCHEMA_INVALID");
  if (proof?.source_project !== PROJECT_REF) throw new Error("GDELT_COVERAGE_PROOF_PROJECT_INVALID");
  if (proof?.current_source_id !== SOURCE_ID) throw new Error("GDELT_COVERAGE_PROOF_SOURCE_INVALID");
  if (proof?.current_evidence_contract !== CURRENT_EVIDENCE_CONTRACT) throw new Error("GDELT_COVERAGE_PROOF_CONTRACT_INVALID");
  if (proof?.full_b2_readback_verified !== true || proof?.exact_gzip_restore_verified !== true) {
    throw new Error("GDELT_COVERAGE_PROOF_READBACK_INVALID");
  }
  if (proof?.live_observed_unscored !== true || proof?.real_event_timestamps_preserved !== true) {
    throw new Error("GDELT_COVERAGE_PROOF_EVIDENCE_MODE_INVALID");
  }
  if (proof?.synthetic_score !== false || proof?.provider_identity_exposed !== false || proof?.raw_source_headlines_exposed !== false) {
    throw new Error("GDELT_COVERAGE_PROOF_PUBLIC_BOUNDARY_INVALID");
  }
  if (!Number.isInteger(Number(proof?.live_observed_rows)) || Number(proof.live_observed_rows) < 1) {
    throw new Error("GDELT_COVERAGE_PROOF_LIVE_ROWS_MISSING");
  }
  return {
    generatedAt: requiredIsoTimestamp(proof.generated_at, "GDELT_COVERAGE_PROOF_GENERATED_AT", PROOF_MAX_AGE_MS),
    batchAt: requiredIsoTimestamp(proof.current_source_batch_at, "GDELT_COVERAGE_BATCH_AT", GDELT_BATCH_MAX_AGE_MS),
  };
}

function psql(dbUrl, sql) {
  return execFileSync(
    "psql",
    [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PGSSLMODE: "require" },
    },
  ).trim();
}

function refreshCoverageRuntime(dbUrl, generatedAt) {
  const thresholdIso = new Date(Date.parse(generatedAt) - CONTROL_REFRESH_MIN_AGE_MS).toISOString();
  const counts = psql(dbUrl, `
    with registry as (
      select count(*)::bigint as expected_count
      from public.live_country_registry
      where enabled = true
    ), targets as (
      select count(*)::bigint as target_count,
             count(*) filter (where last_success_at is null or last_success_at < '${thresholdIso}'::timestamptz)::bigint as stale_count
      from public.live_raw_source_targets t
      join public.live_country_registry r on r.iso3 = t.country_iso3 and r.enabled = true
      where t.enabled = true
        and t.category = '${SOURCE_CATEGORY}'
        and t.source_id = '${SOURCE_ID}'
        and t.transport = 'GLOBAL_FALLBACK'
        and t.target_id = '${TARGET_PREFIX}' || r.iso3
    )
    select expected_count || '|' || target_count || '|' || stale_count
    from registry cross join targets;
  `);
  const [expectedRaw, targetsRaw, staleRaw] = counts.split("|");
  const expected = Number(expectedRaw);
  const targetCount = Number(targetsRaw);
  const staleCount = Number(staleRaw);
  if (!Number.isInteger(expected) || expected <= 0 || targetCount !== expected) {
    throw new Error(`GDELT_COVERAGE_TARGET_CENSUS_INVALID:${expected}:${targetCount}`);
  }
  if (staleCount === 0) {
    return { expected, rowsRefreshed: 0, alreadyFresh: true };
  }

  const refreshedRaw = psql(dbUrl, `
    begin;
    do $$
    declare
      expected_count bigint;
      updated_count bigint;
    begin
      select count(*) into expected_count
      from public.live_country_registry
      where enabled = true;

      update public.live_raw_source_targets t
      set last_attempt_at = '${generatedAt}'::timestamptz,
          last_success_at = '${generatedAt}'::timestamptz,
          last_observed_at = '${generatedAt}'::timestamptz,
          discovery_state = 'REACHABLE',
          consecutive_failures = 0,
          last_error = null,
          updated_at = now()
      from public.live_country_registry r
      where r.enabled = true
        and r.iso3 = t.country_iso3
        and t.enabled = true
        and t.category = '${SOURCE_CATEGORY}'
        and t.source_id = '${SOURCE_ID}'
        and t.transport = 'GLOBAL_FALLBACK'
        and t.target_id = '${TARGET_PREFIX}' || r.iso3;

      get diagnostics updated_count = row_count;
      if updated_count <> expected_count then
        raise exception 'GDELT_COVERAGE_REFRESH_COUNT_MISMATCH:%:%', expected_count, updated_count;
      end if;
    end $$;
    commit;
    select count(*)::bigint
    from public.live_raw_source_targets t
    join public.live_country_registry r on r.iso3 = t.country_iso3 and r.enabled = true
    where t.enabled = true
      and t.category = '${SOURCE_CATEGORY}'
      and t.source_id = '${SOURCE_ID}'
      and t.transport = 'GLOBAL_FALLBACK'
      and t.target_id = '${TARGET_PREFIX}' || r.iso3
      and t.last_success_at = '${generatedAt}'::timestamptz;
  `);
  const refreshed = Number(refreshedRaw.split(/\r?\n/u).filter(Boolean).at(-1));
  if (refreshed !== expected) throw new Error(`GDELT_COVERAGE_REFRESH_VERIFY_MISMATCH:${expected}:${refreshed}`);
  return { expected, rowsRefreshed: refreshed, alreadyFresh: false };
}

const dbUrl = authoritativeDbUrl();
if (String(process.env.B2_S3_ENDPOINT ?? B2_ENDPOINT).trim() !== B2_ENDPOINT || !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY) {
  throw new Error("GDELT_COVERAGE_B2_CONFIG_REQUIRED");
}

const b2 = createB2Client({
  endpointUrl: B2_ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  bucket: B2_BUCKET,
});
const proofBytes = await b2.get(PROOF_KEY);
let proof;
try {
  proof = JSON.parse(proofBytes.toString("utf8"));
} catch {
  throw new Error("GDELT_COVERAGE_PROOF_JSON_INVALID");
}
const { generatedAt, batchAt } = assertProof(proof);
const refresh = refreshCoverageRuntime(dbUrl, generatedAt);

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.gdelt-coverage-runtime-refresh.v1",
  source_id: SOURCE_ID,
  proof_key: PROOF_KEY,
  proof_generated_at: generatedAt,
  current_source_batch_at: batchAt,
  expected_country_rows: refresh.expected,
  rows_refreshed: refresh.rowsRefreshed,
  already_fresh: refresh.alreadyFresh,
  bounded_write_threshold_minutes: CONTROL_REFRESH_MIN_AGE_MS / 60_000,
  destructive_change: false,
  synthetic_score: false,
}));
