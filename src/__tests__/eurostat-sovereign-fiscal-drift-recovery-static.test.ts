import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const registryWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/apply-multi-source-registry-production.yml"),
  "utf8",
);

const recoveryWorkflow = readFileSync(
  join(process.cwd(), ".github/workflows/eurostat-sovereign-fiscal-drift-recovery.yml"),
  "utf8",
);

describe("Eurostat sovereign-fiscal source-state drift recovery", () => {
  it("keeps the multi-source registry workflow read-only after bootstrap", () => {
    expect(registryWorkflow).toContain("writes_performed\":false");
    expect(registryWorkflow).toContain("bootstrap_migration_reapplied\":false");
    expect(registryWorkflow).not.toMatch(/psql .*920_multi_source_commercial_registry\.sql/);
    expect(registryWorkflow).not.toMatch(/supabase db\s+push/);
  });

  it("recovers only the already-approved Eurostat signal state after proving source evidence", () => {
    expect(recoveryWorkflow).toContain("commercial_usage_status || '|' || enabled_for_ingestion::text || '|' || enabled_for_commercial_signals::text");
    expect(recoveryWorkflow).toContain("verified_rows || '|' || partial_rows || '|' || rejected_rows || '|' || unmapped_rows || '|' || write_completed::text");
    expect(recoveryWorkflow).toContain("audit-eurostat-sovereign-fiscal-shadow-census.ts");
    expect(recoveryWorkflow).toContain("925_enable_eurostat_sovereign_fiscal_signals.sql");
  });

  it("requires real global census acceptance and preserves the non-execution boundary", () => {
    expect(recoveryWorkflow).toContain("global-risk-gate-country-census.ts --require-any-accepted");
    expect(recoveryWorkflow).toContain("eurostat-general-government");
    expect(recoveryWorkflow).toContain("execution_authorized === false");
    expect(recoveryWorkflow).toContain("Emergency rollback only if this run changed the source state and proof failed");
  });

  it("does not touch payment or Base mainnet configuration", () => {
    expect(recoveryWorkflow).not.toContain("COINBASE_X402_MAINNET_ACK");
    expect(recoveryWorkflow).not.toContain("COINBASE_X402_PRICE_USDC");
    expect(recoveryWorkflow).not.toContain("I_ACCEPT_REAL_USDC");
  });
});
