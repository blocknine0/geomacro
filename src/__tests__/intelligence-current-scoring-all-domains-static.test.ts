import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/intelligence-current-scoring-all-domains.yml", "utf8");
const script = readFileSync("scripts/ops/run-intelligence-current-scoring-cycle.mjs", "utf8");

describe("#1414 current scored Intelligence across all launch domains", () => {
  it("quota-holds frozen Supabase legacy scoring on every main push and workflow completion", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("permit_legacy_supabase_scoring:");
    expect(workflow).toContain("default: false");
    expect(workflow).not.toContain("\n  schedule:");
    expect(workflow).not.toContain("\n  push:");
    expect(workflow).not.toContain("\n  workflow_run:");
    expect(workflow).toContain("github.event.inputs.permit_legacy_supabase_scoring == 'true'");
    expect(workflow).toContain("vars.GEOMACRO_ENABLE_LEGACY_SUPABASE_SCORING == 'true'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    // The actual fresh first-party discovery workflow is NOT disabled.
    const source=readFileSync(".github/workflows/expanded-official-source-observation.yml", "utf8");
    expect(source).toContain('cron: "17 0,3,6,9,12,15,18,21 * * *"');
    expect(source).toContain('cron: "47 1,4,7,10,13,16,19,22 * * *"');
  });

  it("covers geopolitics, macro and rare earth with the canonical classifier contract", () => {
    expect(script).toContain('const DOMAINS = ["geopolitics", "macro", "rare_earth"]');
    expect(script).toContain('event-severity-v1.0.5');
    expect(script).toContain('risk-desk-filter-v1.0.5');
    expect(script).toContain('raw_feature_score_promotion: false');
    expect(script).toContain('raw_event_metadata_score_promotion: false');
    expect(script).toContain('Date.parse(String(row?.published_at ?? ""))');
    expect(script).not.toContain("row?.published_at ?? row?.created_at");
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

  it("rejects frozen or unavailable Supabase write budgets before every legacy scorer", () => {
    const budgetGate = "requireCanonicalScoringWriteHeadroom()";
    expect(script).toContain('const FREE_TIER_BUDGET_CHECK = "scripts/ops/supabase-free-tier-budget.mjs"');
    expect(script).toContain('"--require-bulk-write", "--require-normal"');
    expect(script).toContain('code: "CURRENT_SCORING_CANONICAL_WRITE_HEADROOM_REQUIRED"');
    expect(script).toContain('code: "CURRENT_SCORING_CANONICAL_WRITE_BUDGET_INVALID"');
    expect(script).toContain('budget.mode !== "normal"');
    expect(script).toContain('budget.bulk_write_allowed !== true');
    expect(script).toContain('budget.policy?.recurring_ingest_allowed !== true');
    expect(script).toContain('process.exit(78);');
    expect(script.indexOf(`if (!${budgetGate})`)).toBeLessThan(
      script.indexOf("patchCanonicalScorer();"),
    );
    expect(script.indexOf(`if (!${budgetGate})`)).toBeLessThan(
      script.indexOf("for (const category of DOMAINS)"),
    );
    expect(workflow).toContain("Require real authoritative Supabase write headroom");
    const check = "node scripts/ops/supabase-free-tier-budget.mjs --require-bulk-write --require-normal";
    expect(workflow).toContain(check);
    expect(workflow.indexOf(check)).toBeLessThan(
      workflow.indexOf("node scripts/ops/run-intelligence-current-scoring-cycle.mjs"),
    );
  });

  it("fails closed on stale launch domains and republishes the canonical B2 projection only after scoring", () => {
    expect(script).toContain("CURRENT_SCORING_REQUIRED_FRESHNESS_MISSING");
    expect(script).toContain("runPublicationSync();");
    expect(script).toContain('scripts/ops/sync-fastlane-scored-intelligence.mjs');
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
  });
});
