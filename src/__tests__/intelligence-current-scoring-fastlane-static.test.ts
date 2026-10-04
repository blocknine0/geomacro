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

  it("rotates one domain per bounded GDELT run and holds expensive discovery lanes", () => {
    expect(workflow).toContain('cron: "3,23,43 * * * *"');
    expect(workflow).toContain("GDELT_FORCE_CATEGORY=$domain");
    expect(workflow).toContain('GUARDIAN_QUERY_BUDGET_PER_CATEGORY: "0"');
    expect(workflow).toContain('GDACS_ENABLED: "false"');
    expect(workflow).toContain('RELIEFWEB_ENABLED: "false"');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "2"');
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
  });

  it("never maps GDELT numeric features directly into severity", () => {
    expect(workflow).not.toMatch(/Goldstein|AvgTone|NumMentions|NumSources.*severity|severity.*NumSources/i);
    expect(workflow).not.toContain("live_observed_unscored: false");
  });
});
