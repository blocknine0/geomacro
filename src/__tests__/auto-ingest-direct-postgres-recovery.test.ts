import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/auto-ingest-news.yml", "utf8");
const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
const loader = readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs", "utf8");
const db = readFileSync("scripts/lib/gri-db-client.mjs", "utf8");
const ingest = readFileSync("scripts/ingest-news.js", "utf8");
const rights = readFileSync("scripts/commercial-source-rights-evidence.mjs", "utf8");

describe("canonical Auto Ingest News recovery", () => {
  it("is manual-only because the master orchestrator is the sole recurring ingestion owner", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("\n  push:\n");
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_TASK_ALLOWLIST: news_ingest');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_FORCE_TASKS: news_ingest');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_MAX_TASKS: "1"');
    expect(workflow).toContain('GRI_DB_MODE: direct_postgres');
    expect(workflow).toContain("--experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).toContain("node scripts/intelligence-orchestrator.mjs");
    expect(workflow).not.toContain("run: node scripts/ingest-news.js");
  });

  it("recovers the exact same canonical news_ingest task and structuring path", () => {
    expect(orchestrator).toContain('key: "news_ingest"');
    expect(orchestrator).toContain('["node", ["scripts/ingest-news.js"], "."]');
    expect(orchestrator).toContain('["node", ["scripts/export-admitted-events-for-structure.mjs"], "."]');
    expect(orchestrator).toContain('["node", ["scripts/invoke-live-structure-with-retry.mjs"], "."]');
    expect(orchestrator).toContain("TASK_ALLOWLIST.size > 0 && !TASK_ALLOWLIST.has(task.key)");
    expect(workflow).toContain('.selected[0].task == "news_ingest"');
  });

  it("keeps governed source and classifier inputs available in manual recovery", () => {
    expect(workflow).toContain("RELIEFWEB_APP_NAME: ${{ secrets.RELIEFWEB_APP_NAME }}");
    expect(workflow).toContain("GUARDIAN_API_KEY: ${{ secrets.GUARDIAN_API_KEY }}");
    expect(workflow).toContain("GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}");
    expect(ingest).toContain("process.env.RELIEFWEB_APP_NAME");
    expect(ingest).toContain("Never count reliefweb.int itself as the evidence publisher");
    expect(rights).toContain('approved_status: "DERIVED_ONLY"');
  });

  it("keeps quota and direct database recovery fail-closed", () => {
    expect(workflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(workflow).toContain('SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}');
    expect(loader).toContain('specifier === "@supabase/supabase-js"');
    expect(loader).toContain('=== "direct_postgres"');
    expect(db).toContain("Refusing direct GRI access outside the authoritative Supabase project");
  });
});
