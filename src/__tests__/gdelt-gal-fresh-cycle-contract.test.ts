import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("GDELT GAL canonical fresh-cycle contract", () => {
  it("executes the complete production path as one fail-closed cycle", () => {
    const cycle = read("scripts/run-gdelt-gal-cycle.mjs");
    expect(cycle).toContain("scripts/sync-gdelt-gal-production.mjs");
    expect(cycle).toContain("scripts/drain-live-structure.mjs");
    expect(cycle).toContain("scripts/reconcile-structured-event-commercial-rights.mjs");
    expect(cycle).toContain("scripts/audit-agent-hot-topic-readiness.ts");
    expect(cycle).toContain("scripts/verify-gdelt-gal-cycle.mjs");
    expect(cycle).toContain('syncPayload?.status !== "sealed"');
    expect(cycle).toContain("fragment-ids.json");
    expect(cycle).toContain("scripts/verify-gdelt-gal-cycle.mjs");
    const verifier = read("scripts/verify-gdelt-gal-cycle.mjs");
    expect(verifier).toContain("fragment_reached_structured_event_layer");
    expect(verifier).toContain("structured_event_rights_reconciled");
    expect(verifier).toContain("hot_topic_pipeline_healthy");
    expect(verifier).toContain("source-stamp lag exceeds 1800s");
    expect(verifier).toContain("source_lag_within_1800_seconds");
    expect(verifier).toContain("lag_within_1800_seconds");
  });

  it("retries upstream delay and transport timeouts with bounded backoff while classifying pipeline failures separately", () => {
    const cycle = read("scripts/run-gdelt-gal-cycle.mjs");
    const sync = read("scripts/sync-gdelt-gal-production.mjs");
    expect(cycle).toContain("UPSTREAM_TEMPORARY_OUTAGE");
    expect(cycle).toContain("UPSTREAM_SOURCE_DELAYED");
    expect(cycle).toContain("BACKOFF_SECONDS * attempt * 1000");
    expect(cycle).toContain("function syncFailureIsRetryable(payload, result = null)");
    expect(cycle).toContain("result?.stderr");
    expect(cycle).toContain("aborted due to timeout");
    expect(cycle).toContain("failure_class");
    expect(sync).toContain("GDELT_GAL_FETCH_TIMEOUT_SECONDS");
    expect(sync).toContain("rejectedProbes.length === probeResults.length");
    expect(sync).toContain("function classifyFailure(error)");
    expect(sync).toContain('return "UPSTREAM_TEMPORARY_OUTAGE"');
    expect(sync).toContain('return "PIPELINE_FAILURE"');
    expect(sync).toContain('error_code: failureClass');
  });

  it("proves the fresh cycle against the authoritative database state", () => {
    const verify = read("scripts/verify-gdelt-gal-cycle.mjs");
    expect(verify).toContain('const MAX_LAG_SECONDS = 30 * 60');
    expect(verify).toContain("cursor was not refreshed by this cycle");
    expect(verify).toContain("Expected fresh GDELT GAL fragment was not found");
    expect(verify).toContain("did not reach the structured-event evidence layer");
    expect(verify).toContain("commercial-rights evaluation");
    expect(verify).toContain("pipeline.healthy=true");
    expect(verify).toContain("lag exceeds 1800s");
    expect(verify).toContain("writes_performed_by_verifier: false");
  });

  it("keeps manual recovery on the exact same canonical cycle", () => {
    const workflow = read(".github/workflows/gdelt-gal-live-sync.yml");
    expect(workflow).toContain("scripts/run-gdelt-gal-cycle.mjs");
    expect(workflow).not.toContain("bun scripts/sync-gdelt-gal-production.mjs");
    expect(workflow).not.toContain("node scripts/sync-gdelt-gal-production.mjs");
    expect(workflow).not.toContain("node scripts/reconcile-structured-event-commercial-rights.mjs");
    expect(workflow).not.toContain("live-structure-intelligence");
    expect(workflow).not.toContain("schedule:");
  });
});
