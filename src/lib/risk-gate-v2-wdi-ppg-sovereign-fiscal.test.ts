import { describe, expect, it } from "vitest";
import { COUNTRY_RISK_V02_NORMALIZATION_VERSION } from "./country-risk-v02-normalization-contract";
import {
  buildRiskGateV2WdiPpgSovereignFiscalModuleState,
  WDI_PPG_SOVEREIGN_FISCAL_METRIC,
} from "./risk-gate-v2-wdi-ppg-sovereign-fiscal";

function snapshot(input: {
  peerCount?: number;
  freshness?: "CURRENT" | "AGING" | "STALE" | "UNKNOWN";
  score?: number;
  metric?: string;
}) {
  const peerCount = input.peerCount ?? 117;
  const metric = input.metric ?? WDI_PPG_SOVEREIGN_FISCAL_METRIC;
  return {
    normalization_version: COUNTRY_RISK_V02_NORMALIZATION_VERSION,
    as_of: "2026-09-16T00:00:00.000Z",
    metric,
    direction: "HIGHER_IS_HIGHER_RISK" as const,
    peer_count: peerCount,
    signals: [
      {
        country_iso3: "IND",
        category: "MACRO" as const,
        metric,
        raw_value: 2.5,
        unit: "percent_of_gni",
        observed_at: "2024-12-31T00:00:00.000Z",
        freshness_status: input.freshness ?? "AGING",
        direction: "HIGHER_IS_HIGHER_RISK" as const,
        peer_count: peerCount,
        percentile: 0.7,
        normalized_risk_score: input.score ?? 70,
        normalization_version: COUNTRY_RISK_V02_NORMALIZATION_VERSION,
      },
    ],
    calculation_hash: "a".repeat(64),
  };
}

describe("WDI PPG sovereign-fiscal fallback", () => {
  it("builds a verified limited sovereign-fiscal state from a concept-isolated peer universe", () => {
    const state = buildRiskGateV2WdiPpgSovereignFiscalModuleState({
      country_iso3: "ind",
      generated_at: "2026-09-16T00:00:00.000Z",
      snapshot: snapshot({}),
    });
    expect(state).not.toBeNull();
    expect(state?.module).toBe("sovereign_fiscal");
    expect(state?.score).toBe(70);
    expect(state?.confidence).toBe(0.75);
    expect(state?.coverage).toBe("LIMITED");
    expect(state?.commercial_eligibility_status).toBe("VERIFIED");
    expect(state?.methodology_version).toContain("wdi-ppg-debt-service");
  });

  it("fails closed below the unchanged 20-peer minimum", () => {
    expect(
      buildRiskGateV2WdiPpgSovereignFiscalModuleState({
        country_iso3: "IND",
        generated_at: "2026-09-16T00:00:00.000Z",
        snapshot: snapshot({ peerCount: 19 }),
      }),
    ).toBeNull();
  });

  it("fails closed for stale data", () => {
    expect(
      buildRiskGateV2WdiPpgSovereignFiscalModuleState({
        country_iso3: "IND",
        generated_at: "2026-09-16T00:00:00.000Z",
        snapshot: snapshot({ freshness: "STALE" }),
      }),
    ).toBeNull();
  });

  it("rejects a different debt concept", () => {
    expect(() =>
      buildRiskGateV2WdiPpgSovereignFiscalModuleState({
        country_iso3: "IND",
        generated_at: "2026-09-16T00:00:00.000Z",
        snapshot: snapshot({ metric: "central_government_debt_pct_gdp" }),
      }),
    ).toThrow("normalization metric mismatch");
  });
});
