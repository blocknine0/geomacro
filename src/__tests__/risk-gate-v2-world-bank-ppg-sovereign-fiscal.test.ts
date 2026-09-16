import { describe, expect, it } from "vitest";
import { buildMacroNormalizationSnapshot } from "../lib/country-risk-v02-normalization";
import {
  buildRiskGateV2WorldBankPpgSovereignFiscalModuleState,
  RISK_GATE_V2_WORLD_BANK_PPG_SOVEREIGN_FISCAL_METHOD_VERSION,
  WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
  type WorldBankPpgSourceProof,
} from "../lib/risk-gate-v2-world-bank-ppg-sovereign-fiscal";

const proof: WorldBankPpgSourceProof = {
  numerator_indicator: "DT.DOD.DPPG.CD",
  denominator_indicator: "NY.GNP.MKTP.CD",
  numerator_license: "CC BY-4.0",
  denominator_license: "CC BY-4.0",
  numerator_response_sha256: "a".repeat(64),
  denominator_response_sha256: "b".repeat(64),
  same_country_same_year_join_required: true,
  semantic_boundary:
    "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT",
};

function snapshot(peerCount = 20) {
  return buildMacroNormalizationSnapshot({
    metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: "2026-09-16T00:00:00.000Z",
    observations: Array.from({ length: peerCount }, (_, index) => ({
      country_iso3: `X${String(index).padStart(2, "0")}`.slice(-3).toUpperCase(),
      metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
      value_numeric: index + 1,
      unit: "% of GNI",
      observed_at: "2024-12-31T23:59:59.999Z",
      freshness_status: "AGING" as const,
    })),
  });
}

function validSnapshot() {
  const iso = [
    "AFG","AGO","ALB","ARG","ARM","AZE","BDI","BEN","BFA","BGD",
    "BIH","BLR","BLZ","BOL","BRA","BTN","BWA","CAF","CHN","CIV",
  ];
  return buildMacroNormalizationSnapshot({
    metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: "2026-09-16T00:00:00.000Z",
    observations: iso.map((country_iso3, index) => ({
      country_iso3,
      metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
      value_numeric: index + 1,
      unit: "% of GNI",
      observed_at: "2024-12-31T23:59:59.999Z",
      freshness_status: "AGING" as const,
    })),
  });
}

describe("World Bank PPG sovereign-fiscal shadow methodology", () => {
  it("builds a source-specific sovereign_fiscal state without relabelling the metric", () => {
    const state = buildRiskGateV2WorldBankPpgSovereignFiscalModuleState({
      country_iso3: "CIV",
      generated_at: "2026-09-16T00:00:00.000Z",
      snapshot: validSnapshot(),
      source_proof: proof,
    });

    expect(state).not.toBeNull();
    expect(state?.module).toBe("sovereign_fiscal");
    expect(state?.coverage).toBe("LIMITED");
    expect(state?.commercial_eligibility_status).toBe("VERIFIED");
    expect(state?.methodology_version).toBe(
      RISK_GATE_V2_WORLD_BANK_PPG_SOVEREIGN_FISCAL_METHOD_VERSION,
    );
    expect(state?.drivers[0]?.driver).toBe("debt_sustainability");
  });

  it("fails closed when source-proof hashes are not valid sha256", () => {
    const state = buildRiskGateV2WorldBankPpgSovereignFiscalModuleState({
      country_iso3: "CIV",
      generated_at: "2026-09-16T00:00:00.000Z",
      snapshot: validSnapshot(),
      source_proof: { ...proof, numerator_response_sha256: "not-a-hash" },
    });
    expect(state).toBeNull();
  });

  it("rejects a normalization snapshot for the wrong metric", () => {
    const wrong = buildMacroNormalizationSnapshot({
      metric: "central_government_debt_pct_gdp",
      direction: "HIGHER_IS_HIGHER_RISK",
      as_of: "2026-09-16T00:00:00.000Z",
      observations: [
        "AFG","AGO","ALB","ARG","ARM","AZE","BDI","BEN","BFA","BGD",
        "BIH","BLR","BLZ","BOL","BRA","BTN","BWA","CAF","CHN","CIV",
      ].map((country_iso3, index) => ({
        country_iso3,
        metric: "central_government_debt_pct_gdp",
        value_numeric: index + 1,
        unit: "% of GDP",
        observed_at: "2024-12-31T23:59:59.999Z",
        freshness_status: "AGING" as const,
      })),
    });

    expect(() =>
      buildRiskGateV2WorldBankPpgSovereignFiscalModuleState({
        country_iso3: "CIV",
        generated_at: "2026-09-16T00:00:00.000Z",
        snapshot: wrong,
        source_proof: proof,
      }),
    ).toThrow("normalization metric mismatch");
  });

  it("retains the normalization layer's fixed 20-peer minimum", () => {
    expect(() => snapshot(19)).toThrow(
      `Insufficient peer coverage for ${WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC}: 19`,
    );
  });
});
