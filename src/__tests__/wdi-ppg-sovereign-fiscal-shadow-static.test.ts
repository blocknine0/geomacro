import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ingest = fs.readFileSync("scripts/ingest-wdi-ppg-debt-service-live.mjs", "utf8");
const server = fs.readFileSync("src/lib/risk-gate-v2-wdi-ppg-sovereign-fiscal.server.ts", "utf8");
const macro = fs.readFileSync("src/lib/risk-gate-v2-macro-module-state.server.ts", "utf8");
const builder = fs.readFileSync("src/lib/risk-gate-v2-wdi-ppg-sovereign-fiscal.ts", "utf8");

describe("WDI PPG sovereign-fiscal shadow candidate", () => {
  it("pins the exact reviewed World Bank source and public debt-service metric", () => {
    expect(ingest).toContain('const SOURCE_ID = "world_bank_indicators"');
    expect(ingest).toContain('const WORLD_BANK_API_SOURCE_ID = "2"');
    expect(ingest).toContain('const INDICATOR_ID = "DT.TDS.DPPG.GN.ZS"');
    expect(ingest).toContain('const METRIC = "public_guaranteed_debt_service_pct_gni"');
    expect(ingest).toContain('assertCommercialEligibilityAllowed');
    expect(ingest).toContain('commercial_usage_status !== "COMMERCIAL_OK"');
  });

  it("keeps writes opt-in and preserves the concept boundary", () => {
    expect(ingest).toContain('process.argv.includes("--write")');
    expect(ingest).toContain('public_external_debt_service_is_not_central_government_debt_stock: true');
    expect(ingest).toContain('raw_cross_concept_pooling_allowed: false');
  });

  it("requires the active commercial source and a concept-isolated latest view", () => {
    expect(server).toContain('from("live_external_sources")');
    expect(server).toContain('enabled_for_commercial_signals", true');
    expect(server).toContain('from("live_world_bank_indicator_latest")');
    expect(server).toContain('WDI_PPG_SOVEREIGN_FISCAL_METRIC');
    expect(server).toContain('direction: "HIGHER_IS_HIGHER_RISK"');
  });

  it("does not wire the candidate into the production macro adapter yet", () => {
    expect(macro).toContain('auditCountryRiskGateV2MacroModuleStatesWithWdiPpgFallback');
    const productionSection = macro.slice(
      macro.indexOf('export async function generateCountryRiskGateV2MacroModuleStates('),
      macro.indexOf('/**\n * Shadow-only candidate path'),
    );
    expect(productionSection).not.toContain('generateRiskGateV2WdiPpgSovereignFiscalModuleState');
    expect(builder).toContain('WDI_PPG_SOVEREIGN_FISCAL_MIN_PEERS = 20');
    expect(builder).toContain('coverage: "LIMITED"');
  });
});
