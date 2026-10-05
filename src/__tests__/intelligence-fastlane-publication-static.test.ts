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

  it("skips redundant B2 writes only when every scored launch domain is already caught up", () => {
    expect(script).toContain('const CATEGORIES = ["geopolitics", "macro", "rare_earth"]');
    expect(script).toContain("caughtUp(before.latest_scored_by_category, canonicalLatest)");
    expect(script).toContain("publisherInvoked: false");
  });

  it("fails closed until public serving exposes canonical scored timestamps for all three domains", () => {
    expect(script).toContain('body?.mode !== "verified_b2_plus_live_observed"');
    expect(script).toContain("after.live_observed_rows >= 1");
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
