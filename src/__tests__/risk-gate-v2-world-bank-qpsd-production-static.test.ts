import fs from "node:fs";
import { describe, expect, it } from "vitest";

const ingest = fs.readFileSync(
  "scripts/ingest-world-bank-qpsd-sovereign-fiscal-live.mjs",
  "utf8",
);
const adapter = fs.readFileSync(
  "src/lib/risk-gate-v2-world-bank-qpsd-sovereign-fiscal.server.ts",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/930_world_bank_qpsd_production_source.sql",
  "utf8",
);
const rights = fs.readFileSync(
  "scripts/commercial-source-rights-evidence.mjs",
  "utf8",
);
const macro = fs.readFileSync(
  "src/lib/risk-gate-v2-macro-module-state.server.ts",
  "utf8",
);

describe("World Bank QPSD governed production sovereign-fiscal fallback", () => {
  it("registers QPSD as an exact standalone commercially reviewed source", () => {
    expect(rights).toContain("world_bank_qpsd: Object.freeze");
    expect(rights).toContain("Quarterly Public Sector Debt (QPSD), DataBank source 3009");
    expect(rights).toContain('dataset_url: "https://datacatalog.worldbank.org/search/dataset/0037906/quarterly-public-sector-debt"');
    expect(rights).toContain('licence: "CC BY 4.0 with World Bank dataset additional terms"');
    expect(rights).toContain("QPSD general-government and central-government debt remain separate source-specific concepts");
    expect(migration).toContain("'world_bank_qpsd'");
    expect(migration).toContain("'COMMERCIAL_OK'");
    expect(migration).toContain("enabled_for_commercial_signals");
    expect(migration).toContain("create or replace view public.live_world_bank_qpsd_latest");
  });

  it("ingests only the two exact debt-to-GDP concepts without cross-concept pooling", () => {
    expect(ingest).toContain('id: "DP.DOD.DECT.CR.GG.Z1"');
    expect(ingest).toContain('id: "DP.DOD.DECT.CR.CG.Z1"');
    expect(ingest).toContain('metric: "qpsd_general_government_gross_debt_pct_gdp"');
    expect(ingest).toContain('metric: "qpsd_central_government_gross_debt_pct_gdp"');
    expect(ingest).toContain('unit: "% of GDP"');
    expect(ingest).toContain("cross_concept_pooling_allowed: false");
    expect(ingest).toContain("raw_cross_source_pooling_allowed: false");
    expect(ingest).toContain("fixed_peer_minimum: FIXED_PEER_MINIMUM");
    expect(ingest).toContain('quality_status: "VERIFIED"');
    expect(ingest).toContain("commercial_eligibility_status: COMMERCIAL_ELIGIBILITY_STATUS");
  });

  it("requires a clean manifest, source state, exact provenance and >=20 peers", () => {
    expect(adapter).toContain('SOURCE_ID = "world_bank_qpsd"');
    expect(adapter).toContain('MANIFEST_KIND = "WORLD_BANK_QPSD_SOVEREIGN_FISCAL_V1"');
    expect(adapter).toContain('from("live_source_release_manifests")');
    expect(adapter).toContain('from("live_world_bank_qpsd_latest")');
    expect(adapter).toContain("metadata.raw_cross_source_value_pooling_allowed !== false");
    expect(adapter).toContain("metadata.cross_concept_peer_pooling_allowed !== false");
    expect(adapter).toContain("Number(metadata.fixed_peer_minimum ?? 0) !== FIXED_PEER_MINIMUM");
    expect(adapter).toContain("metricCoverage.peer_universe_eligible !== true");
    expect(adapter).toContain("Number(metricCoverage.fresh_country_count ?? 0) < FIXED_PEER_MINIMUM");
    expect(adapter).toContain("provenance.dataset_catalog_id === \"0037906\"");
    expect(adapter).toContain("provenance.databank_source_id === \"3009\"");
  });

  it("tries QPSD only after WDI/Eurostat and before the broader PPG pressure fallback", () => {
    const wdiIndex = macro.indexOf("baseStates.some");
    const eurostatIndex = macro.lastIndexOf("generateRiskGateV2EurostatSovereignFiscalModuleState");
    const qpsdIndex = macro.lastIndexOf("generateRiskGateV2WorldBankQpsdSovereignFiscalModuleState");
    const ppgIndex = macro.lastIndexOf("generateRiskGateV2WorldBankPpgSovereignFiscalModuleState");
    expect(wdiIndex).toBeGreaterThan(-1);
    expect(eurostatIndex).toBeGreaterThan(wdiIndex);
    expect(qpsdIndex).toBeGreaterThan(eurostatIndex);
    expect(ppgIndex).toBeGreaterThan(qpsdIndex);
    expect(macro).toContain("fallback_sovereign_fiscal: qpsdFiscal");
    expect(macro).toContain("fallback_sovereign_fiscal: ppgFiscal");
  });

  it("does not alter execution authorization or real-money launch gates", () => {
    expect(ingest).toContain("production_scoring_changed_by_ingest: false");
    expect(ingest).toContain("base_mainnet_gate_changed: false");
    expect(ingest).not.toContain("I_ACCEPT_REAL_USDC");
    expect(adapter).not.toContain("I_ACCEPT_REAL_USDC");
    expect(migration).not.toContain("I_ACCEPT_REAL_USDC");
  });
});
