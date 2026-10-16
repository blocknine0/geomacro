#!/usr/bin/env node
// Read-only admission BEFORE model classification or B2 upload.
// Two immutable private bundles require two PUT + two full-body GET;
// one additional ticket of each type is reserved as bounded retry headroom.
// This is advisory; every real B2 request still requires an atomic D1 ticket.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createB2D1AccountGovernor } from "./b2-d1-account-governor.mjs";
import { evaluateGovernedB2Headroom } from "../lib/governed-b2-headroom.mjs";

export async function checkPrivateScoringB2Headroom({
  governor = createB2D1AccountGovernor(), now = new Date(),
} = {}) {
  const quota = await governor.status();
  const verdict = evaluateGovernedB2Headroom(quota, {
    getRequests: 3, putRequests: 3, now,
  });
  return Object.freeze({
    schema: "geomacro.restricted-private-scoring-b2-headroom.v1",
    day_utc: verdict.day_utc,
    admitted: verdict.admitted,
    reason: verdict.admitted ? "SHARED_D1_HEADROOM_OBSERVED" : "QUOTA_HELD_NO_CLASSIFIER_CLAIM",
    required_get_tickets: 3, required_put_tickets: 3,
    checked_before_classifier_and_b2: true,
    d1_status_read_only: true,
    guaranteed_future_b2_reservations: false,
    backblaze_provider_quota_verified: false,
    existing_atomic_reservations_still_required: true,
    private_stage_archived: false,
    current_event_verified: false,
    licensed_commercial_use_verified: false,
    user_api_delivery_verified: false,
    public_published: false, commercial_eligible: false,
    b2_requests: 0, supabase_requests: 0, payments: 0,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length !== 2 ||
       process.env.GITHUB_REPOSITORY !== "blocknine0/geomacro" ||
       process.env.GITHUB_REF !== "refs/heads/main" ||
       process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
       process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID !== "restricted_private_scoring" ||
       !process.env.GITHUB_OUTPUT || !process.env.GITHUB_STEP_SUMMARY)
      throw Error("PRIVATE_SCORING_QUOTA_PREFLIGHT_CONTEXT_INVALID");
    const verdict = await checkPrivateScoringB2Headroom();
    appendFileSync(process.env.GITHUB_OUTPUT,
      "admitted=" + String(verdict.admitted) + "\n");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, verdict.admitted
      ? "Private scoring: shared D1 B2 quota has read-only headroom for 2 immutable bundles and bounded retry. Per-request D1 tickets are still mandatory; no commercial evidence is asserted.\n"
      : "Private scoring: QUOTA HELD before any classifier claim/model read/B2 upload. Current commercial evidence remains unverified. Next UTC budget day may be retried by the existing source pulse.\n");
    console.log(JSON.stringify(verdict));
  } catch {
    console.error("::error::PRIVATE_SCORING_QUOTA_PREFLIGHT_FAILED_CLOSED");
    process.exitCode = 2;
  }
}
