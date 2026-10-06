import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Testnet RSS live runner", () => {
  it("uses the same canonical direct-Postgres RSS path as production without Supabase Edge", () => {
    const worker = readFileSync("workers/telegram-flash/worker.py", "utf8");
    const workflow = readFileSync(".github/workflows/testnet-rss-live-runner.yml", "utf8");
    const cycle = readFileSync("scripts/run-rss-live-cycle.mjs", "utf8");
    const orchestrator = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
    const productionEntryPoint = readFileSync("workers/telegram-flash/production_entrypoint.py", "utf8");

    expect(worker).toContain('RSS_RUN_ONCE = env_bool("BREAKING_RSS_RUN_ONCE", False)');
    expect(worker).toContain("if RSS_RUN_ONCE and TELEGRAM_ENABLED:");
    expect(worker).toContain("if RSS_RUN_ONCE:");
    expect(worker).toContain("if not failed_sources:");
    expect(worker).toContain("asyncio.gather(");
    expect(worker).toContain("http.client.IncompleteRead");

    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain('TELEGRAM_ENABLED: "false"');
    expect(workflow).toContain('BREAKING_RSS_ENABLED: "true"');
    expect(workflow).toContain('BREAKING_RSS_RUN_ONCE: "true"');
    expect(workflow).toContain("node scripts/run-rss-live-cycle.mjs");
    expect(workflow).not.toContain("GEOMACRO_FLASH_INGEST_URL:");
    expect(workflow).not.toContain("ACTIONS_ID_TOKEN_REQUEST_URL");
    expect(workflow).not.toContain(".supabase.co/functions/v1/");
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");

    expect(cycle).toContain('"canonical_direct_postgres"');
    expect(cycle).toContain('"scripts/run-live-flash-ingest-local.ts"');
    expect(cycle).toContain('"scripts/run-live-flash-corroborate-local.ts"');
    expect(cycle).not.toContain(".supabase.co/functions/v1/");
    expect(orchestrator).toContain('key: "rss_live"');
    expect(orchestrator).toContain('requiredEnv: ["SUPABASE_DB_URL"]');
    expect(orchestrator).not.toContain('disabledReason: () => "supabase_edge_function_service_unavailable"');

    expect(productionEntryPoint).toContain("import worker");
    expect(productionEntryPoint).not.toContain("PRODUCTION_RSS_FEEDS");
    expect(worker).toContain('"source_id": "bis_rss_media_releases"');
    expect(worker).toContain('"source_id": "bis_rss_central_banker_speeches"');
  });
});
