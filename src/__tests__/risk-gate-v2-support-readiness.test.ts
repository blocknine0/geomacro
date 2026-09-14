import { describe, expect, it } from "vitest";

import {
  COUNTRY_RISK_V02_MACRO_METHOD_VERSION,
  type CountryMacroRiskComponent,
  type MacroDimensionKey,
  type MacroDimensionResult,
} from "../lib/country-risk-v02-macro-contract";
import {
  buildRiskGateV2MacroModuleState,
  buildRiskGateV2SupportedMacroStates,
  RISK_GATE_V2_MACRO_MODULE_METHOD_VERSION,
} from "../lib/risk-gate-v2-macro-module-state";
import {
  getRiskGateV2PromotionBacklog,
  getRiskGateV2SupportedModules,
  RISK_GATE_V2_SUPPORT_READINESS,
} from "../lib/risk-gate-v2-support-readiness";
import { RISK_GATE_V2_MODULES } from "../lib/risk-gate-v2-taxonomy";

function dimension(
  key: MacroDimensionKey,
  score: number,
  patch: Partial<MacroDimensionResult> = {},
): MacroDimensionResult {
  const metricByKey: Record<MacroDimensionKey, string> = {
    inflation: "inflation_consumer_prices_annual_pct",
    growth: "real_gdp_growth_annual_pct",
    unemployment: "unemployment_total_pct",
    government_debt: "central_government_debt_pct_gdp",
  };

  return {
    key,
    metric: metricByKey[key],
    base_weight: 0.25,
    available: true,
    peer_count: 180,
    normalized_risk_score: score,
    freshness_status: "CURRENT",
    normalization_hash: `${key}-normalization-hash`,
    contribution: score * 0.25,
    exclusion_reason: null,
    ...patch,
  };
}

function component(
  patch: Partial<CountryMacroRiskComponent> = {},
): CountryMacroRiskComponent {
  const dimensions: MacroDimensionResult[] = [
    dimension("inflation", 60),
    dimension("growth", 30),
    dimension("unemployment", 45),
    dimension("government_debt", 70),
  ];

  return {
    methodology_version: COUNTRY_RISK_V02_MACRO_METHOD_VERSION,
    country_iso3: "IND",
    as_of: "2026-09-14T00:00:00.000Z",
    dimensions,
    available_dimension_count: 4,
    total_dimension_count: 4,
    coverage_ratio: 1,
    weighted_observed_risk: 51.25,
    score_contribution: 51.25,
    confidence_factor: 1,
    calculation_hash: "a".repeat(64),
    ...patch,
  };
}

describe("Risk Gate v2 support readiness", () => {
  it("tracks every taxonomy module and keeps unsupported work explicit", () => {
    expect(Object.keys(RISK_GATE_V2_SUPPORT_READINESS).sort()).toEqual(
      [...RISK_GATE_V2_MODULES].sort(),
    );

    const backlog = getRiskGateV2PromotionBacklog();
    expect(backlog.length).toBe(RISK_GATE_V2_MODULES.length - 5);

    for (const item of backlog) {
      expect(item.status).not.toBe("SUPPORTED");
      expect(item.blockers.length).toBeGreaterThan(0);
      expect(item.promotion_requirements.length).toBeGreaterThan(0);
    }
  });

  it("marks only modules with real deterministic builders as supported", () => {
    expect(getRiskGateV2SupportedModules().sort()).toEqual([
      "geopolitical_security",
      "macro_monetary",
      "political_governance",
      "societal_labor_health",
      "sovereign_fiscal",
    ]);

    expect(
      RISK_GATE_V2_SUPPORT_READINESS.geopolitical_security.coverage_ceiling,
    ).toBe("LIMITED");
    expect(RISK_GATE_V2_SUPPORT_READINESS.macro_monetary.coverage_ceiling).toBe(
      "PARTIAL",
    );
    expect(RISK_GATE_V2_SUPPORT_READINESS.sovereign_fiscal.coverage_ceiling).toBe(
      "LIMITED",
    );
    expect(
      RISK_GATE_V2_SUPPORT_READINESS.political_governance.coverage_ceiling,
    ).toBe("LIMITED");
    expect(
      RISK_GATE_V2_SUPPORT_READINESS.societal_labor_health.coverage_ceiling,
    ).toBe("LIMITED");
  });
});

describe("Risk Gate v2 governed macro module states", () => {
  it("builds deterministic macro-monetary support without claiming FULL coverage", () => {
    const state = buildRiskGateV2MacroModuleState({
      component: component(),
      module: "macro_monetary",
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.module).toBe("macro_monetary");
    expect(state!.score).toBe(45);
    expect(state!.coverage).toBe("PARTIAL");
    expect(state!.confidence).toBe(1);
    expect(state!.commercial_eligibility_status).toBe("VERIFIED");
    expect(state!.methodology_version).toBe(
      RISK_GATE_V2_MACRO_MODULE_METHOD_VERSION,
    );
    expect(state!.drivers.map((driver) => driver.driver).sort()).toEqual([
      "growth_slowdown_recession",
      "inflation",
      "labor_market_stress",
    ]);
  });

  it("keeps sovereign-fiscal coverage LIMITED when only governed debt is active", () => {
    const state = buildRiskGateV2MacroModuleState({
      component: component(),
      module: "sovereign_fiscal",
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.score).toBe(70);
    expect(state!.coverage).toBe("LIMITED");
    expect(state!.drivers).toEqual([
      expect.objectContaining({
        driver: "debt_sustainability",
        score_contribution: 70,
      }),
    ]);
  });

  it("does not redistribute missing macro dimensions into false confidence", () => {
    const sparse = component({
      dimensions: [
        dimension("inflation", 80),
        dimension("growth", 0, {
          available: false,
          normalized_risk_score: null,
          freshness_status: null,
          contribution: 0,
          exclusion_reason: "country_signal_unavailable",
        }),
        dimension("unemployment", 0, {
          available: false,
          normalized_risk_score: null,
          freshness_status: null,
          contribution: 0,
          exclusion_reason: "country_signal_unavailable",
        }),
        dimension("government_debt", 70),
      ],
      available_dimension_count: 2,
      coverage_ratio: 0.5,
      confidence_factor: 0.5,
    });

    const state = buildRiskGateV2MacroModuleState({
      component: sparse,
      module: "macro_monetary",
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.score).toBe(80);
    expect(state!.coverage).toBe("LIMITED");
    expect(state!.confidence).toBeCloseTo(1 / 3, 6);
    expect(state!.drivers).toEqual([
      expect.objectContaining({
        driver: "inflation",
        score_contribution: 26.666667,
      }),
    ]);
  });

  it("returns no module state when no governed usable dimension exists", () => {
    const empty = component({
      dimensions: component().dimensions.map((item) => ({
        ...item,
        available: false,
        normalized_risk_score: null,
        freshness_status: null,
        contribution: 0,
        exclusion_reason: "country_signal_unavailable",
      })),
      available_dimension_count: 0,
      coverage_ratio: 0,
      weighted_observed_risk: null,
      score_contribution: 0,
      confidence_factor: 0,
    });

    expect(
      buildRiskGateV2MacroModuleState({
        component: empty,
        module: "macro_monetary",
        generated_at: "2026-09-14T06:30:00.000Z",
        commercial_eligibility_status: "VERIFIED",
      }),
    ).toBeNull();
  });

  it("preserves commercial eligibility instead of silently promoting an input", () => {
    const state = buildRiskGateV2MacroModuleState({
      component: component(),
      module: "macro_monetary",
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "UNVERIFIED",
    });

    expect(state!.commercial_eligibility_status).toBe("UNVERIFIED");
  });

  it("derives previous score and delta only from a matching previous component", () => {
    const previous = component({
      calculation_hash: "b".repeat(64),
      dimensions: [
        dimension("inflation", 45),
        dimension("growth", 30),
        dimension("unemployment", 30),
        dimension("government_debt", 65),
      ],
    });

    const state = buildRiskGateV2MacroModuleState({
      component: component(),
      previous_component: previous,
      module: "macro_monetary",
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state!.previous_score).toBe(35);
    expect(state!.delta).toBe(10);
  });

  it("returns both currently supported macro module states from one component", () => {
    const states = buildRiskGateV2SupportedMacroStates({
      component: component(),
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(states.map((state) => state.module).sort()).toEqual([
      "macro_monetary",
      "sovereign_fiscal",
    ]);
  });
});
