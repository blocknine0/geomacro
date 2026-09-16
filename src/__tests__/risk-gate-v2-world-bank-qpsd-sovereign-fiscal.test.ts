import { describe, expect, it } from "vitest";
import { buildMacroNormalizationSnapshot } from "../lib/country-risk-v02-normalization";
import {
  RISK_GATE_V2_WORLD_BANK_QPSD_SOVEREIGN_FISCAL_METHOD_VERSION,
  WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC,
  WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC,
  WORLD_BANK_QPSD_PARSER_VERSION,
  buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState,
  type WorldBankQpsdMetric,
  type WorldBankQpsdSourceProof,
} from "../lib/risk-gate-v2-world-bank-qpsd-sovereign-fiscal";

const ISO3 = [
  "USA", "CAN", "MEX", "BRA", "ARG", "CHL", "COL", "PER", "GBR", "FRA",
  "DEU", "ESP", "ITA", "NLD", "SWE", "NOR", "POL", "CZE", "JPN", "KOR",
] as const;

function snapshot(metric: WorldBankQpsdMetric) {
  return buildMacroNormalizationSnapshot({
    metric,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: "2026-09-16T00:00:00.000Z",
    observations: ISO3.map((country_iso3, index) => ({
      country_iso3,
      metric,
      value_numeric: 20 + index * 3,
      unit: "% of GDP",
      observed_at: "2026-06-30T23:59:59.999Z",
      freshness_status: "CURRENT" as const,
    })),
  });
}

function proof(metric: WorldBankQpsdMetric): WorldBankQpsdSourceProof {
  if (metric === WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC) {
    return {
      source_transport: "official_databank_bulk_csv",
      dataset_classification: "Public",
      dataset_license: "CC BY 4.0",
      parser_version: WORLD_BANK_QPSD_PARSER_VERSION,
      bulk_file_sha256: "a".repeat(64),
      series_id: "DP.DOD.DECT.CR.GG.Z1",
      exact_label:
        "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP",
      government_sector: "GENERAL_GOVERNMENT",
      unit: "% of GDP",
      cross_concept_pooling_allowed: false,
      raw_cross_source_pooling_allowed: false,
    };
  }

  return {
    source_transport: "official_databank_bulk_csv",
    dataset_classification: "Public",
    dataset_license: "CC BY 4.0",
    parser_version: WORLD_BANK_QPSD_PARSER_VERSION,
    bulk_file_sha256: "b".repeat(64),
    series_id: "DP.DOD.DECT.CR.CG.Z1",
    exact_label:
      "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP",
    government_sector: "CENTRAL_GOVERNMENT",
    unit: "% of GDP",
    cross_concept_pooling_allowed: false,
    raw_cross_source_pooling_allowed: false,
  };
}

describe("World Bank QPSD sovereign-fiscal shadow module", () => {
  it.each([
    WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC,
    WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC,
  ] as const)("builds a source-specific state for %s", (metric) => {
    const state = buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState({
      country_iso3: "USA",
      generated_at: "2026-09-16T00:00:00.000Z",
      snapshot: snapshot(metric),
      source_proof: proof(metric),
      risk_object_ids: ["risk-object-2", "risk-object-1", "risk-object-1"],
    });

    expect(state).not.toBeNull();
    expect(state?.module).toBe("sovereign_fiscal");
    expect(state?.coverage).toBe("LIMITED");
    expect(state?.commercial_eligibility_status).toBe("VERIFIED");
    expect(state?.methodology_version).toBe(
      RISK_GATE_V2_WORLD_BANK_QPSD_SOVEREIGN_FISCAL_METHOD_VERSION,
    );
    expect(state?.drivers).toHaveLength(1);
    expect(state?.drivers[0].driver).toBe("debt_sustainability");
    expect(state?.risk_object_ids).toEqual(["risk-object-1", "risk-object-2"]);
  });

  it("fails closed when the proof belongs to the other government-sector concept", () => {
    const state = buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState({
      country_iso3: "USA",
      generated_at: "2026-09-16T00:00:00.000Z",
      snapshot: snapshot(WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC),
      source_proof: proof(WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC),
    });

    expect(state).toBeNull();
  });

  it("fails closed when the fixed peer minimum is not met", () => {
    const valid = snapshot(WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC);
    const state = buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState({
      country_iso3: "USA",
      generated_at: "2026-09-16T00:00:00.000Z",
      snapshot: { ...valid, peer_count: 19 },
      source_proof: proof(WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC),
    });

    expect(state).toBeNull();
  });

  it("rejects an unrelated normalization metric", () => {
    const valid = snapshot(WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC);
    expect(() =>
      buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState({
        country_iso3: "USA",
        generated_at: "2026-09-16T00:00:00.000Z",
        snapshot: { ...valid, metric: "unrelated_metric" },
        source_proof: proof(WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC),
      }),
    ).toThrow("normalization metric mismatch");
  });
});
