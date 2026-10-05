#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
const url = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const role = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
).trim();
const dbUrl = String(process.env.SUPABASE_DB_URL ?? "").trim();

if ((url && url !== PROJECT_URL) || (!role && !dbUrl)) {
  throw new Error("SUPABASE_FREE_TIER_BUDGET_CONFIG_INVALID");
}

function validateDatabaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("SUPABASE_FREE_TIER_BUDGET_DB_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.password || parsed.pathname !== "/postgres") {
    throw new Error("SUPABASE_FREE_TIER_BUDGET_DB_URL_INVALID");
  }
  const direct = parsed.hostname === `db.${PROJECT_REF}.supabase.co` && parsed.username === "postgres";
  const pooler = parsed.hostname.endsWith(".pooler.supabase.com") && parsed.username === `postgres.${PROJECT_REF}`;
  if (!direct && !pooler) throw new Error("SUPABASE_FREE_TIER_BUDGET_DB_TARGET_INVALID");
  return raw;
}

function validBudgetState(value) {
  return value && typeof value === "object" &&
    ["normal", "warning", "frozen"].includes(value.mode) &&
    Number.isSafeInteger(Number(value.database_bytes)) &&
    Number.isSafeInteger(Number(value.target_bytes)) &&
    Number.isSafeInteger(Number(value.warn_bytes)) &&
    Number.isSafeInteger(Number(value.freeze_bytes)) &&
    typeof value.bulk_write_allowed === "boolean";
}

async function readViaDataApi() {
  if (!url || !role) return null;
  const db = createClient(url, role, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("geomacro_free_tier_budget_state");
  if (error || !validBudgetState(data)) return null;
  return { data, transport: "data_api" };
}

function readViaDirectPostgres() {
  if (!dbUrl) return null;
  const target = validateDatabaseUrl(dbUrl);
  try {
    const output = execFileSync(
      "psql",
      [target, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", "select public.geomacro_free_tier_budget_state()::text;"],
      {
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15_000,
      },
    ).trim();
    if (!output) return null;
    const data = JSON.parse(output.split(/\r?\n/).filter(Boolean).at(-1));
    if (!validBudgetState(data)) return null;
    return { data, transport: "direct_postgres_fallback" };
  } catch {
    return null;
  }
}

// Data API is the normal transport, but project-level egress restriction can
// disable PostgREST while Postgres itself remains healthy. The budget state is
// one canonical database function, so direct PostgreSQL is a transport fallback
// only; it never creates a second source of truth.
const state = await readViaDataApi() ?? readViaDirectPostgres();
if (!state) throw new Error("SUPABASE_FREE_TIER_BUDGET_UNAVAILABLE");
const { data, transport } = state;

const result = {
  ok: true,
  ...data,
  transport,
  policy: {
    supabase_role: "compact_operational_control_plane",
    b2_role: "raw_archive_historical_large_payloads",
    bulk_supabase_writes_allowed: data.bulk_write_allowed === true,
    recurring_ingest_allowed: data.mode === "normal",
  },
};
console.log(JSON.stringify(result));

// Fail closed for bulk writers once the project reaches the hard 450 MiB
// emergency threshold. Auto Ingest News is also treated as a bulk writer even
// when a caller forgets the explicit flag.
const requireBulkWrite =
  process.argv.includes("--require-bulk-write") ||
  process.env.GITHUB_WORKFLOW === "Auto Ingest News";

if (requireBulkWrite && data.bulk_write_allowed !== true) {
  console.error(
    JSON.stringify({
      ok: false,
      code: "SUPABASE_FREE_TIER_BULK_WRITE_FROZEN",
      database_bytes: data.database_bytes,
      freeze_bytes: data.freeze_bytes,
    }),
  );
  process.exitCode = 78;
}

// Recurring ingestion needs more headroom than a one-off operator action. In
// the 400-450 MiB warning band the database is still technically writable, but
// allowing scheduled growth there would immediately recreate the quota issue.
// --require-normal therefore permits recurring writers only below warn_bytes.
const requireNormal = process.argv.includes("--require-normal");
if (requireNormal && data.mode !== "normal") {
  console.error(
    JSON.stringify({
      ok: false,
      code: "SUPABASE_FREE_TIER_HEADROOM_REQUIRED",
      mode: data.mode,
      database_bytes: data.database_bytes,
      warn_bytes: data.warn_bytes,
      target_bytes: data.target_bytes,
    }),
  );
  process.exitCode = 78;
}

// Final canonical refresh follows recovery, so require its lower target even
// while the emergency bulk-write budget still allows essential writes.
if (process.argv.includes("--require-recovery-target")) {
  const bytes = Number(data.database_bytes);
  const target = Number(data.target_bytes);
  if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(target) ||
      target !== 367001600 || bytes > target) {
    console.error(JSON.stringify({
      ok: false,
      code: "SUPABASE_FREE_TIER_RECOVERY_TARGET_NOT_MET",
      database_bytes: Number.isFinite(bytes) ? bytes : null,
      target_bytes: Number.isFinite(target) ? target : null,
    }));
    process.exitCode = 78;
  }
}
