import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/intelligence-current-scoring-fastlane.yml",
  "utf8",
);
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
const cycle = readFileSync("scripts/ops/run-intelligence-current-scoring-cycle.mjs", "utf8");

describe("current Intelligence scoring fastlane", () => {
  it("moves recurring current scoring into the single master orchestrator", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("\n  push:\n");
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(orchestrator).toContain('key: "current_scoring"');
    expect(orchestrator).toContain("cadenceSeconds: 1200");
    expect(orchestrator).toContain("offsetSeconds: 780");
    expect(orchestrator).toContain('scripts/ops/run-intelligence-current-scoring-cycle.mjs');
  });

  it("keeps manual recovery bounded to exactly current_scoring", () => {
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_TASK_ALLOWLIST: current_scoring');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_FORCE_TASKS: current_scoring');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_MAX_TASKS: "1"');
    expect(workflow).toContain('GRI_DB_MODE: direct_postgres');
    expect(workflow).toContain("--experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).toContain('.selected[0].task == "current_scoring"');
    expect(orchestrator).toContain("TASK_ALLOWLIST.size > 0 && !TASK_ALLOWLIST.has(task.key)");
  });

  it("retains the bounded all-domain scorer and verified B2 publication sync", () => {
    expect(cycle).toContain('const DOMAINS = ["geopolitics", "macro", "rare_earth"]');
    expect(cycle).toContain('GEOMACRO_GDELT_ONLY: "true"');
    expect(cycle).toContain('GDELT_GAL_FALLBACK_ENABLED: "true"');
    expect(cycle).toContain('GUARDIAN_QUERY_BUDGET_PER_CATEGORY: "0"');
    expect(cycle).toContain("CURRENT_SCORING_NON_GDELT_DISCOVERY_USED");
    expect(cycle).toContain('raw_feature_score_promotion: false');
    expect(cycle).toContain('raw_event_metadata_score_promotion: false');
    expect(cycle).toContain('sync-fastlane-scored-intelligence.mjs');
    expect(cycle).toContain('required_fresh_ms: REQUIRED_FRESH_MS');
  });

  it("does not allow legacy numeric source features to become severity", () => {
    expect(cycle).not.toMatch(/Goldstein|AvgTone|NumMentions|NumSources.*severity|severity.*NumSources/i);
    expect(workflow).not.toContain("live_observed_unscored: false");
  });
});
