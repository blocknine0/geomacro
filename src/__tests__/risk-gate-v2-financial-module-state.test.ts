import { describe, expect, it } from "vitest";

import type { MacroNormalizationInput } from "../lib/country-risk-v02-normalization";
import {
  buildRiskGateV2FinancialModuleState,
  RISK_GATE_V2_WDI_FINANCIAL_METHOD_VERSION,
} from "../lib/risk-gate-v2-financial-module-state";

function iso3For(index: number) {
  const a = Math.floor(index / (26 * 26)) % 26;
  const b = Math.floor(index / 26) % 26;
  const c = index % 26;
  return String.fromCharCode(65 + a, 65 + b, 65 + c);
}

function observation(
  country_iso3: string,
  metric: string,
  value_numeric: number,
): MacroNormalizationInput {
  return {
    country_iso3,
    metric,
    value_numeric,
    unit: "percent",
    observed_at: "2025-12-31T00:00:00.000Z",
    freshness_status: "CURRENT",
  };
}

function peerObservations() {
  const rows: MacroNormalizationInput[] = [];
  const metrics = [
    "total_reserves_months_imports",
    "current_account_balance_pct_gdp",
    "bank_nonperforming_loans_pct",
    "bank_capital_to_assets_pct",
    "bank_liquid_reserves_to_assets_pct",
  ];

  for (let index = 0; index < 40; index += 1) {
    const iso3 = iso3For(index);
    if (iso3 === "IND") continue;
    for (const metric of metrics) {
      let value = index + 1;
      if (metric === "current_account_balance_pct_gdp") value = index - 20;
      rows.push(observation(iso3, metric, value));
    }
  }
  return rows;
}

describe("Risk Gate v2 WDI financial modules", () => {
  it("builds a PARTIAL currency/capital-mobility state from reserves and current account", () => {
    const state = buildRiskGateV2FinancialModuleState({
      country_iso3: "IND",
      module: "currency_capital_mobility",
      as_of: "2026-09-14T00:00:00.000Z",
      observations: [
        ...peerObservations(),
        observation("IND", "total_reserves_months_imports", 0.5),
        observation("IND", "current_account_balance_pct_gdp", -25),
      ],
      generated_at: "2026-09-14T07:15:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.module).toBe("currency_capital_mobility");
    expect(state!.coverage).toBe("PARTIAL");
    expect(state!.score).toBeGreaterThan(90);
    expect(state!.commercial_eligibility_status).toBe("VERIFIED");
    expect(state!.methodology_version).toBe(
      RISK_GATE_V2_WDI_FINANCIAL_METHOD_VERSION,
    );
    expect(state!.drivers.map((item) => item.driver).sort()).toEqual([
      "currency_shock",
      "reserve_depletion",
    ]);
  });

  it("builds a PARTIAL banking-system state from NPL, capital and liquidity buffers", () => {
    const state = buildRiskGateV2FinancialModuleState({
      country_iso3: "IND",
      module: "banking_financial_system",
      as_of: "2026-09-14T00:00:00.000Z",
      observations: [
        ...peerObservations(),
        observation("IND", "bank_nonperforming_loans_pct", 60),
        observation("IND", "bank_capital_to_assets_pct", 0.5),
        observation("IND", "bank_liquid_reserves_to_assets_pct", 0.5),
      ],
      generated_at: "2026-09-14T07:15:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.module).toBe("banking_financial_system");
    expect(state!.coverage).toBe("PARTIAL");
    expect(state!.score).toBeGreaterThan(90);
    expect(state!.drivers.map((item) => item.driver).sort()).toEqual([
      "banking_system_stress",
      "credit_deterioration",
      "funding_stress",
    ]);
  });

  it("keeps banking coverage LIMITED when only one governed dimension exists", () => {
    const observations = peerObservations().filter(
      (item) => item.metric === "bank_nonperforming_loans_pct",
    );
    observations.push(observation("IND", "bank_nonperforming_loans_pct", 20));

    const state = buildRiskGateV2FinancialModuleState({
      country_iso3: "IND",
      module: "banking_financial_system",
      as_of: "2026-09-14T00:00:00.000Z",
      observations,
      generated_at: "2026-09-14T07:15:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.coverage).toBe("LIMITED");
    expect(state!.confidence).toBeLessThan(0.34);
  });

  it("fails closed when the target country has no governed eligible dimension", () => {
    expect(
      buildRiskGateV2FinancialModuleState({
        country_iso3: "IND",
        module: "currency_capital_mobility",
        as_of: "2026-09-14T00:00:00.000Z",
        observations: peerObservations(),
        generated_at: "2026-09-14T07:15:00.000Z",
        commercial_eligibility_status: "VERIFIED",
      }),
    ).toBeNull();
  });

  it("preserves commercial eligibility instead of silently promoting it", () => {
    const state = buildRiskGateV2FinancialModuleState({
      country_iso3: "IND",
      module: "currency_capital_mobility",
      as_of: "2026-09-14T00:00:00.000Z",
      observations: [
        ...peerObservations(),
        observation("IND", "total_reserves_months_imports", 5),
      ],
      generated_at: "2026-09-14T07:15:00.000Z",
      commercial_eligibility_status: "UNVERIFIED",
    });

    expect(state!.commercial_eligibility_status).toBe("UNVERIFIED");
  });
});
