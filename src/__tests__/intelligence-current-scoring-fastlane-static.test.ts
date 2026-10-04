import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/intelligence-current-scoring-fastlane.yml",
  "utf8",
);

describe("current Intelligence scoring fastlane", () => {
  it("uses the canonical scorer under the existing writer lock", () => {
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain("node scripts/ingest-news.js");
    expect(workflow).toContain("classification_version: 'event-severity-v1.0.5'");
    expect(workflow).toContain("classification_prompt_version: 'risk-desk-filter-v1.0.5'");
    expect(workflow).toContain("raw_feature_score_promotion: false");
  });

  it("rotates one domain per bounded GDELT-only run and holds expensive discovery lanes", () => {
    expect(workflow).toContain('cron: "13,33,53 * * * *"');
    expect(workflow).toContain("timeout-minutes: 12");
    expect(workflow).toContain("GDELT_FORCE_CATEGORY=$domain");
    expect(workflow).toContain('GEOMACRO_GDELT_ONLY: "true"');
    expect(workflow).toContain("FASTLANE_NON_GDELT_DISCOVERY_USED");
    expect(workflow).toContain('GUARDIAN_QUERY_BUDGET_PER_CATEGORY: "0"');
    expect(workflow).toContain('GDACS_ENABLED: "false"');
    expect(workflow).toContain('RELIEFWEB_ENABLED: "false"');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "2"');
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
  });

  it("bounds recurring history reads instead of scanning the full event table", () => {
    expect(workflow).toContain("7 * 24 * 60 * 60 * 1000");
    expect(workflow).toContain("recent_dedupe_window_days: 7");
  });

  it("never maps GDELT numeric features directly into severity", () => {
    expect(workflow).not.toMatch(/Goldstein|AvgTone|NumMentions|NumSources.*severity|severity.*NumSources/i);
    expect(workflow).not.toContain("live_observed_unscored: false");
  });
});
