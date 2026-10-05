import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/intelligence-current-scoring-all-domains.yml", "utf8");
const script = readFileSync("scripts/ops/run-intelligence-current-scoring-cycle.mjs", "utf8");

describe("#1414 current scored Intelligence across all launch domains", () => {
  it("runs after the existing fastlane and on canonical main changes without adding an independent timer", () => {
    expect(workflow).toContain('workflows: ["Intelligence Current Scoring Fastlane"]');
    expect(workflow).toContain("types: [completed]");
    expect(workflow).toContain("push:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
  });

  it("covers geopolitics, macro and rare earth with the canonical classifier contract", () => {
    expect(script).toContain('const DOMAINS = ["geopolitics", "macro", "rare_earth"]');
    expect(script).toContain('event-severity-v1.0.5');
    expect(script).toContain('risk-desk-filter-v1.0.5');
    expect(script).toContain('raw_feature_score_promotion: false');
    expect(script).toContain('raw_event_metadata_score_promotion: false');
  });

  it("falls back from any failed or empty GDELT DOC response to governed GAL discovery", () => {
    expect(script).toContain("GDELT DOC returned no current candidates; trying governed GAL fallback.");
    expect(script).toContain("GDELT DOC failed (");
    expect(script).toContain("fetchGdeltGalFastlaneArticles");
    expect(script).toContain("GDELT GAL fallback:");
  });

  it("protects free quotas by skipping recently scored domains and bounding candidate volume", () => {
    expect(script).toContain("INTELLIGENCE_DOMAIN_SCORE_FRESH_MS");
    expect(script).toContain('action: "skipped_recent_score"');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "1"');
    expect(workflow).toContain('GROQ_MAX_REQUESTS_PER_RUN: "3"');
  });

  it("fails closed on stale launch domains and republishes the canonical B2 projection only after scoring", () => {
    expect(script).toContain("CURRENT_SCORING_REQUIRED_FRESHNESS_MISSING");
    expect(script).toContain("runPublicationSync();");
    expect(script).toContain('scripts/ops/sync-fastlane-scored-intelligence.mjs');
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
  });
});
