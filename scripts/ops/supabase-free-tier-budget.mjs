#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const url = String(process.env.APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const role = String(
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
).trim();

if (url !== "https://ldpwajisioljyjtojvfx.supabase.co" || !role) {
  throw new Error("SUPABASE_FREE_TIER_BUDGET_CONFIG_INVALID");
}

const db = createClient(url, role, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await db.rpc("geomacro_free_tier_budget_state");
if (error || !data) throw error ?? new Error("SUPABASE_FREE_TIER_BUDGET_UNAVAILABLE");

const result = {
  ok: true,
  ...data,
  policy: {
    supabase_role: "compact_operational_control_plane",
    b2_role: "raw_archive_historical_large_payloads",
    bulk_supabase_writes_allowed: data.bulk_write_allowed === true,
    recurring_ingest_allowed: data.mode === "normal",
  },
};
console.log(JSON.stringify(result));

const reportOnly = process.argv.includes("--report-only");
const requireBulkWrite =
  !reportOnly &&
  (process.argv.includes("--require-bulk-write") ||
    process.env.GITHUB_WORKFLOW === "Auto Ingest News");

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

// Recurring writers need more headroom than one-off maintenance. The warning
// band starts at 400 MiB; scheduled growth is allowed only below that line.
const requireNormal = !reportOnly && process.argv.includes("--require-normal");
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
