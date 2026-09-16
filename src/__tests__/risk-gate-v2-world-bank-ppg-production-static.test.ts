import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ingest = fs.readFileSync(
  "scripts/ingest-world-bank-ppg-sovereign-fiscal-live.mjs",
  "utf8",
);
const adapter = fs.readFileSync(
  "src/lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal.server.ts",
  "utf8",
);
const macro = fs.readFileSync(
  "src/lib/risk-gate-v2-macro-module-state.server.ts",
  "utf8",
);

describe("World Bank PPG production sovereign-fiscal fallback", () => {
  it("uses the exact same-country same-year PPG/GNI derived contract", () => {
    expect(ingest).toContain('id: "DT.DOD.DPPG.CD"');
    expect(ingest).toContain('id: "NY.GNP.MKTP.CD"');
    expect(ingest).toContain('DERIVED_METRIC = "ppg_external_debt_stock_pct_gni"');
    expect(ingest).toContain("same_country_same_year_join_required: true");
    expect(ingest).toContain(
      "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT",
    );
    expect(ingest).toContain('licence: "CC BY 4.0"');
  });

  it("persists only governed verified observations and a clean release manifest", () => {
    expect(ingest).toContain('assertCommercialEligibilityAllowed(\n  SOURCE_ID,\n  "VERIFIED"');
    expect(ingest).toContain('quality_status: "VERIFIED"');
    expect(ingest).toContain("commercial_eligibility_status: COMMERCIAL_ELIGIBILITY_STATUS");
    expect(ingest).toContain('from("live_source_release_manifests")');
    expect(ingest).toContain("write_completed: true");
    expect(ingest).toContain("raw_cross_source_value_pooling_allowed: false");
    expect(ingest).toContain("ppg_external_debt_relabelled_as_total_government_debt: false");
    expect(ingest).toContain("fixed_peer_minimum: 20");
  });

  it("requires the exact clean manifest and source proof before producing a fiscal state", () => {
    expect(adapter).toContain('MANIFEST_KIND = "WORLD_BANK_PPG_GNI_DERIVED_V1"');
    expect(adapter).toContain('from("live_source_release_manifests")');
    expect(adapter).toContain('.contains("metadata", {');
    expect(adapter).toContain("kind: MANIFEST_KIND");
    expect(adapter).toContain("metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC");
    expect(adapter).toContain("semantic_boundary: SEMANTIC_BOUNDARY");
    expect(adapter).not.toContain('.limit(50)');
    expect(adapter).toContain('metadata.numerator_indicator !== "DT.DOD.DPPG.CD"');
    expect(adapter).toContain('metadata.denominator_indicator !== "NY.GNP.MKTP.CD"');
    expect(adapter).toContain("metadata.same_country_same_year_join_required !== true");
    expect(adapter).toContain("metadata.raw_cross_source_value_pooling_allowed !== false");
    expect(adapter).toContain("Number(row.verified_rows ?? 0) < 20");
    expect(adapter).toContain("if (!manifest) return null");
  });

  it("keeps source-specific fiscal precedence without raw concept pooling", () => {
    const wdiIndex = macro.indexOf("baseStates.some");
    const eurostatIndex = macro.indexOf("generateRiskGateV2EurostatSovereignFiscalModuleState");
    const ppgIndex = macro.lastIndexOf("generateRiskGateV2WorldBankPpgSovereignFiscalModuleState");
    expect(wdiIndex).toBeGreaterThan(-1);
    expect(eurostatIndex).toBeGreaterThan(-1);
    expect(ppgIndex).toBeGreaterThan(eurostatIndex);
    expect(macro).toContain("These concepts are never raw-value pooled or placed into one peer universe");
    expect(macro).toContain("fallback_sovereign_fiscal: ppgFiscal");
  });

  it("does not change execution authorization or the Base mainnet gate", () => {
    expect(ingest).toContain("production_scoring_changed_by_ingest: false");
    expect(ingest).toContain("base_mainnet_gate_changed: false");
    expect(ingest).not.toContain("I_ACCEPT_REAL_USDC");
    expect(adapter).not.toContain("I_ACCEPT_REAL_USDC");
  });
});
