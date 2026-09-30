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
  },
};
console.log(JSON.stringify(result));

// The two-hour Auto Ingest News workflow historically used this script in
// report-only mode. That allowed the primary recurring growth path to continue
// even after the database crossed the 450 MiB emergency freeze threshold.
// Enforce the same fail-closed budget automatically for that named workflow,
// while keeping ordinary CLI invocations report-only and leaving B2 archive /
// recovery workflows free to reduce Supabase usage.
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
