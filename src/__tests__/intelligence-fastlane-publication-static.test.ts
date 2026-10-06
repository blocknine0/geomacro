import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/intelligence-fastlane-publication.yml", "utf8");
const script = readFileSync("scripts/ops/sync-fastlane-scored-intelligence.mjs", "utf8");

describe("#1414 fastlane scored Intelligence publication", () => {
  it("chains publication from the canonical scoring fastlane without adding another schedule", () => {
    expect(workflow).toContain('workflows: ["Intelligence Current Scoring Fastlane"]');
    expect(workflow).toContain("types: [completed]");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("group: geomacro-intelligence-scored-realtime");
  });

  it("reuses the existing verified B2 publisher and production credentials", () => {
    expect(script).toContain('scripts/ops/run-b2-public-intelligence-publisher.mjs');
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
  });

  it("skips redundant B2 writes only when scores and source-native coverage heartbeat are both fresh", () => {
    expect(script).toContain('const CATEGORIES = ["geopolitics", "macro", "rare_earth"]');
    expect(script).toContain("caughtUp(before.latest_scored_by_category, canonicalLatest)");
    expect(script).toContain("GDELT_COVERAGE_MAINTENANCE_MAX_AGE_MS");
    expect(script).toContain("gdeltCoverageMaintenanceStatus");
    expect(script).toContain("maintenance_required");
    expect(script).toContain("already_caught_up_coverage_fresh");
    expect(script).toContain("publisherInvoked: false");
  });

  it("forces the verified publisher before the two-hour GDELT coverage window expires", () => {
    expect(script).toContain('GDELT_COVERAGE_SOURCE_ID = "gdelt_v2_events"');
    expect(script).toContain('GDELT_COVERAGE_TARGET_PREFIX = "GEO:COVERAGE_FALLBACK:"');
    expect(script).toContain("95 * 60 * 1000");
    expect(script).toContain("FASTLANE_PUBLICATION_COVERAGE_MAINTENANCE_REQUIRED");
    expect(script).toContain("FASTLANE_GDELT_COVERAGE_MAINTENANCE_UNSATISFIED");
    expect(script).toContain("coverage_maintenance_before");
    expect(script).toContain("coverage_maintenance_after");
  });

  it("accepts scored-first serving while preserving verified live fallback compatibility", () => {
    expect(script).toContain('mode === "verified_b2"');
    expect(script).toContain('mode === "verified_b2_plus_live_observed"');
    expect(script).toContain("live === 0");
    expect(script).toContain("live >= 1");
    expect(script).toContain("caughtUp(after.latest_scored_by_category, canonicalLatest)");
    expect(script).toContain("FASTLANE_PUBLICATION_PUBLIC_SCORE_NOT_CAUGHT_UP");
  });

  it("keeps evidence metadata-only and never serializes raw Intelligence rows", () => {
    expect(script).toContain("raw_rows_serialized: false");
    expect(script).not.toContain("source_title");
    expect(script).not.toContain("source_url");
    expect(script).not.toContain("source_name");
  });
});
