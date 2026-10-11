#!/usr/bin/env node
// Read-only, conservative admission for the one-key B2 rights snapshot.
// Does not reserve tickets: each later real PUT/GET still requires its
// own atomic D1 reservation immediately before Backblaze network activity.
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createB2D1AccountGovernor } from "./b2-d1-account-governor.mjs";
import { evaluateGovernedB2Headroom } from "../lib/governed-b2-headroom.mjs";

export async function checkB2RightsOnlyHeadroom({
  governor = createB2D1AccountGovernor(),
  now = new Date(),
} = {}) {
  const status = await governor.status();
  // The actual upload requires one PUT plus one independently signed
  // full-body GET. Require 2 of each to keep modest retry headroom before
  // spending frozen Supabase query quota; native fallback may need more.
  const assessed = evaluateGovernedB2Headroom(status, {
    getRequests: 2, putRequests: 2, now,
  });
  return Object.freeze({
    schema: "geomacro.b2-rights-only-headroom.v1",
    day_utc: assessed.day_utc,
    admitted: assessed.admitted,
    reason: assessed.admitted
      ? "D1_SHARED_HEADROOM_OBSERVED"
      : "D1_SHARED_DAILY_B2_QUOTA_HELD",
    minimum_get_tickets: 2,
    minimum_put_tickets: 2,
    checked_before_source_database_read: true,
    read_only_d1_check: true,
    d1_ledger_writes: 0,
    b2_requests: 0,
    supabase_requests: 0,
    payment_executed: false,
    // The ledger does NOT certify provider billing/free-cap headroom,
    // non-participating B2 clients or concurrent future reservation.
    backblaze_provider_quota_verified: false,
    guaranteed_future_reservations: false,
    full_readback_verified: false,
    rights_refresh_complete: false,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 2 ||
        process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
        process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "rights_only_refresh" ||
        !process.env.GITHUB_STEP_SUMMARY) {
      throw Error("B2_RIGHTS_PREFLIGHT_RUNNER_CONFIG_INVALID");
    }
    const proof = await checkB2RightsOnlyHeadroom();
    console.log(JSON.stringify(proof));
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      proof.admitted
        ? "Rights-only B2: D1 shared quota has read-only preflight headroom for a bounded PUT/GET + retry. Every actual request still needs an atomic D1 ticket; no source DB or B2 request has occurred yet.\n"
        : "Rights-only B2: QUOTA-HELD before reading frozen source DB or issuing B2 requests. Wait for the next UTC day and re-check; rights freshness and payment stay unchanged.\n",
      "utf8");
    if (!proof.admitted) process.exitCode = 3;
  } catch {
    console.error("::error::B2_RIGHTS_ONLY_D1_PREFLIGHT_FAILED_CLOSED");
    process.exitCode = 2;
  }
}
