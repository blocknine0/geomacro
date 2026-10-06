import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("permanent RSS direct-Postgres transport", () => {
  it("runs canonical ingest and current strict corroboration locally instead of through Supabase Edge", () => {
    const cycle = read("scripts/run-rss-live-cycle.mjs");
    const ingest = read("scripts/run-live-flash-ingest-local.ts");
    const corroborate = read("scripts/run-live-flash-corroborate-local.ts");
    const canonicalCorroborate = read("supabase/functions/live-flash-corroborate/index.ts");

    expect(cycle).toContain('RSS_LIVE_CYCLE_REQUIRES_DIRECT_POSTGRES');
    expect(cycle).toContain('"scripts/run-live-flash-ingest-local.ts"');
    expect(cycle).toContain('"scripts/run-live-flash-corroborate-local.ts"');
    expect(cycle).toContain('edge_function_dependency: false');
    expect(cycle).not.toContain(".supabase.co/functions/v1/");

    expect(ingest).toContain("--payload-dir");
    expect(ingest).toContain("createGriDbClient");
    expect(ingest).toContain('execution_mode: "local_canonical_source_direct_postgres"');

    expect(corroborate).toContain("supabase/functions/live-flash-corroborate/index.ts");
    expect(corroborate).toContain("createGriDbClient");
    expect(corroborate).toContain("FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2");
    expect(corroborate).toContain("FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45");
    expect(corroborate).toContain("FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65");
    expect(corroborate).toContain('threshold_weakening: false');

    for (const marker of [
      "FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2",
      "FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45",
      "FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65",
    ]) {
      expect(canonicalCorroborate).toContain(marker);
    }
  });

  it("keeps production, Testnet and Federico RSS callers off the Edge transport", () => {
    const orchestrator = read("scripts/intelligence-orchestrator.mjs");
    const productionWorkflow = read(".github/workflows/intelligence-orchestrator.yml");
    const testnet = read(".github/workflows/testnet-rss-live-runner.yml");
    const federico = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    const authorized = read(".github/workflows/day6-authorized-federico-pilot-once.yml");

    expect(orchestrator).toContain('requiredEnv: ["SUPABASE_DB_URL"]');
    expect(orchestrator).not.toContain('disabledReason: () => "supabase_edge_function_service_unavailable"');
    expect(productionWorkflow).not.toContain("GEOMACRO_FLASH_INGEST_URL:");

    for (const source of [testnet, federico, authorized]) {
      expect(source).toContain("GRI_DB_MODE: direct_postgres");
      expect(source).not.toContain(".supabase.co/functions/v1/live-flash-ingest");
      expect(source).not.toContain(".supabase.co/functions/v1/live-flash-corroborate");
    }

    expect(federico).toContain("scripts/run-live-flash-corroborate-local.ts");
    expect(authorized).toContain("scripts/run-live-flash-corroborate-local.ts");
  });

  it("does not change partner allowance or execution safety", () => {
    const authorized = read(".github/workflows/day6-authorized-federico-pilot-once.yml");
    expect(authorized).toContain("use_partner_allowance=false");
    expect(authorized).toContain("use_partner_allowance=true");
    expect(authorized.indexOf("use_partner_allowance=false")).toBeLessThan(
      authorized.indexOf("use_partner_allowance=true"),
    );
    expect(authorized).toContain('"user_funds_authorized":false');
    expect(authorized).toContain('"real_money_payment_authorized":false');
    expect(authorized).toContain('"execution_authorized":false');
    expect(authorized).toContain('"automatic_retry_of_allowance":false');
  });
});
