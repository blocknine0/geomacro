import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("sovereign-fiscal production diagnostics", () => {
  it("is read-only and preserves fixed methodology boundaries", () => {
    const script = read("scripts/audit-sovereign-fiscal-production-diagnostics.ts");
    expect(script).toContain('writes_performed: false');
    expect(script).toContain('source_thresholds_changed: false');
    expect(script).toContain('freshness_thresholds_changed: false');
    expect(script).toContain('debt_concepts_merged: false');
    expect(script).toContain('fixed_peer_minimum: 20');
    expect(script).toContain('base_mainnet_gate_changed: false');
    expect(script).not.toContain('.insert(');
    expect(script).not.toContain('.update(');
    expect(script).not.toContain('.upsert(');
    expect(script).not.toContain('.delete(');
  });

  it("probes governed WDI, Eurostat and PPG production adapters without making countries payable", () => {
    const script = read("scripts/audit-sovereign-fiscal-production-diagnostics.ts");
    expect(script).toContain("generateRiskGateV2EurostatSovereignFiscalModuleState");
    expect(script).toContain("generateCountryRiskGateV2WdiMacroModuleStates");
    expect(script).toContain("generateRiskGateV2WorldBankPpgSovereignFiscalModuleState");
    expect(script).toContain("live_eurostat_government_debt_latest");
    expect(script).toContain("live_world_bank_indicator_latest");
    expect(script).toContain('PPG_METRIC = "ppg_external_debt_stock_pct_gni"');
    expect(script).toContain('PPG_MANIFEST_KIND = "WORLD_BANK_PPG_GNI_DERIVED_V1"');
    expect(script).toContain('.contains("metadata", {');
    expect(script).toContain('ppg_manifest_probe: {');
    expect(script).toContain('ppg_provenance_valid_rows:');
    expect(script).toContain('ppg_sovereign_fiscal_state_count:');
    expect(script).toContain('ppg_evidence_classification:');
    expect(script).toContain("NO_ADAPTER_ELIGIBLE_PPG_MANIFEST");
    expect(script).toContain("ADAPTER_RETURNS_NULL_WITH_ELIGIBLE_MANIFEST_AND_ROWS");
    expect(script).toContain("no_country_is_marked_payable_by_this_report: true");
  });

  it("keeps the PPG semantic boundary explicit during diagnosis", () => {
    const script = read("scripts/audit-sovereign-fiscal-production-diagnostics.ts");
    expect(script).toContain(
      "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT",
    );
    expect(script).toContain('metadata.raw_cross_source_value_pooling_allowed !== false');
    expect(script).toContain(
      'metadata.ppg_external_debt_relabelled_as_total_government_debt !== false',
    );
    expect(script).toContain('metadata.numerator_indicator !== "DT.DOD.DPPG.CD"');
    expect(script).toContain('metadata.denominator_indicator !== "NY.GNP.MKTP.CD"');
    expect(script).toContain('ppg_external_debt_is_not_relabelled_as_total_government_debt: true');
    expect(script).toContain('ppg_raw_values_are_not_pooled_with_other_debt_concepts: true');
    expect(script).toContain('ppg_adapter_probe_is_read_only: true');
  });

  it("runs only against the authoritative production credential boundary", () => {
    const workflow = read(".github/workflows/sovereign-fiscal-production-diagnostics.yml");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("APP_SUPABASE_URL");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("assert-authoritative-supabase.mjs");
    expect(workflow).toContain("sovereign-fiscal-production-diagnostics.json");
  });
});
