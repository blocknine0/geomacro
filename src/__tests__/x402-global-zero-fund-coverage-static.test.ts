import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/agentic/verify-live-x402-global-zero-fund-coverage.mjs", "utf8");
const workflow = readFileSync(".github/workflows/x402-global-zero-fund-coverage.yml", "utf8");

describe("#1414 x402 global zero-fund coverage", () => {
  it("proves the canonical 195-country floor from governed registry state", () => {
    expect(script).toContain('BASELINE_COUNTRY_COUNT = 195');
    expect(script).toContain('live_country_primary_source_directory');
    expect(script).toContain('live_country_registry');
    expect(script).toContain('CANONICAL_195_COUNTRY_BASELINE_INVALID');
  });

  it("covers all launch domains and country chargeability without settling funds", () => {
    expect(script).toContain('["conflict_geopolitics"]');
    expect(script).toContain('["macro_risk", "fx_external_risk"]');
    expect(script).toContain('["critical_minerals"]');
    expect(script).toContain('payment_required_now === false');
    expect(script).toContain('execution_authorized === false');
    expect(script).toContain('EXPECTED_PRICE_USDC = "0.05"');
  });

  it("binds corridor proof to the canonical registry and a bounded live directional ring", () => {
    expect(script).toContain('live_commercial_corridor_registry_status');
    expect(script).toContain('supported_directed_pair_count');
    expect(script).toContain('BASELINE_COUNTRY_COUNT * (BASELINE_COUNTRY_COUNT - 1)');
    expect(script).toContain('corridorRing');
    expect(script).toContain('["trade_corridor"]');
    expect(script).toContain('all_baseline_countries_directional_ring_plus_registry_census');
  });

  it("keeps production proof no-funds and direct-Postgres census only", () => {
    expect(workflow).toContain('GRI_DB_MODE: direct_postgres');
    expect(workflow).toContain('SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}');
    expect(workflow).toContain('Real payment performed: **false**');
    expect(workflow).toContain('Settlement attempted: **false**');
    expect(workflow).not.toContain('api/x402/intelligence');
    expect(workflow).not.toContain('I_ACCEPT_REAL_USDC');
  });
});
