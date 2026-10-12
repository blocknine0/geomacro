import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { requireGdeltB2RecoveryHeadroom } from "../../scripts/lib/gdelt-b2-shared-quota-guard.mjs";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

const now = new Date("2026-10-12T12:00:00.000Z");
const env = {
  B2_GDELT_PRIMARY: "1",
  B2_ACCOUNT_QUOTA_REQUIRED: "1",
  B2_ACCOUNT_QUOTA_WORKFLOW_ID: "gdelt_gal_recovery",
  B2_REQUEST_BUDGET: "4",
  D1_DATABASE_ID: "1234567890abcdef1234567890abcdef",
  CLOUDFLARE_API_TOKEN: "x".repeat(64),
  CLOUDFLARE_ACCOUNT_ID: "1234567890abcdef1234567890abcdef",
};
function status(GET=0, PUT=0, HEAD=0, NATIVE_AUTH=0) {
  return {
    ok: true,
    schema: "geomacro.b2-account-quota-status.v1",
    day_utc: "2026-10-12",
    account_wide_reporting_requires_all_clients_governed: true,
    limits: B2_DAILY_LIMITS,
    used: { total: GET + PUT + HEAD + NATIVE_AUTH, GET, PUT, HEAD, NATIVE_AUTH },
  };
}
const governor = (value: unknown) => ({ status: async () => value });

describe("GDELT GAL manual B2 recovery quota safety", () => {
  it("accepts one PUT and one full readback only when shared D1 headroom exists", async () => {
    const result = await requireGdeltB2RecoveryHeadroom({
      env, now, governor: governor(status(24, 54)),
    });
    expect(result).toMatchObject({
      allowed: true, expected_b2_puts: 1, expected_b2_gets: 1,
      actual_b2_requests: 0,
      each_request_still_requires_atomic_d1_reservation: true,
      no_storage_cleanup: true,
      no_commercial_promotion: true,
    });
  });

  it("holds at GET, PUT or total limits before invoking upstream or B2", async () => {
    for (const counts of [[25, 0, 0, 0],[0, 55, 0, 0],[20, 50, 10, 0]] as const) {
      await expect(requireGdeltB2RecoveryHeadroom({
        env, now, governor: governor(status(...counts)),
      })).rejects.toThrow("GDELT_B2_SHARED_DAILY_QUOTA_HELD");
    }
  });

  it("refuses forged quota receipts, stale UTC dates and ungoverned manual config", async () => {
    for (const invalid of [
      { ...status(), day_utc: "2026-10-11" },
      { ...status(), limits: {...B2_DAILY_LIMITS, GET: 999} },
      { ...status(), used: {...status().used, total: 1} },
      { ...status(), account_wide_reporting_requires_all_clients_governed: false },
    ]) {
      await expect(requireGdeltB2RecoveryHeadroom({
        env, now, governor: governor(invalid),
      })).rejects.toThrow("GDELT_B2_SHARED_D1_QUOTA_STATUS_INVALID");
    }
    for (const patch of [
      { B2_ACCOUNT_QUOTA_REQUIRED: "0" },
      { B2_ACCOUNT_QUOTA_WORKFLOW_ID: "other_job" },
      { D1_DATABASE_ID: "" },
      { B2_REQUEST_BUDGET: "100" },
    ]) {
      await expect(requireGdeltB2RecoveryHeadroom({
        env: {...env, ...patch}, now, governor: governor(status()),
      })).rejects.toThrow("GDELT_B2_ACCOUNT_QUOTA_GUARD_REQUIRED");
    }
  });

  it("requires shared ledger before any GDELT source probe or archival in both entrypoints", () => {
    const cycle = readFileSync("scripts/run-gdelt-gal-cycle.mjs","utf8");
    const sync = readFileSync("scripts/sync-gdelt-gal-production.mjs","utf8");
    const wf = readFileSync(".github/workflows/gdelt-gal-live-sync.yml","utf8");
    expect(cycle.indexOf("await requireGdeltB2RecoveryHeadroom();"))
      .toBeLessThan(cycle.indexOf("await runSyncAttempt(attempt);"));
    expect(sync.indexOf("await requireGdeltB2RecoveryHeadroom();"))
      .toBeLessThan(sync.indexOf("const supabase = createClient(url, key"));
    expect(wf).toContain('B2_REQUEST_BUDGET: "4"');
    expect(wf).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(wf).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: gdelt_gal_recovery");
    expect(wf).toContain("Resolve existing shared D1 B2 quota ledger (read-only)");
    const preflightIndex = wf.indexOf("Read-only shared B2 quota preflight");
    const sourceIndex = wf.indexOf("Run canonical GDELT GAL fresh cycle");
    expect(preflightIndex).toBeGreaterThan(0);
    expect(preflightIndex).toBeLessThan(sourceIndex);
    expect(wf).not.toContain("\n  schedule:");
    expect(wf).not.toContain("\n  push:");
    expect(wf).toContain("inputs.permit_legacy_supabase_gal == true");
    expect(wf).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(sync).toContain("await b2.put(fragmentPath, compressedBytes)");
    expect(sync).toContain("await b2.get(fragmentPath)");
  });
});
