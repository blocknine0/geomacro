import { describe, expect, it } from "vitest";

import {
  COUNTRY_RISK_V02_GEOPOLITICS_METHOD_VERSION,
  type CountryGeopoliticalRiskComponent,
} from "../lib/country-risk-v02-geopolitics-contract";
import {
  buildRiskGateV2PoliticalGovernanceModuleState,
  RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION,
} from "../lib/risk-gate-v2-political-governance-module-state";
import {
  buildRiskGateV2SocietalModuleState,
  RISK_GATE_V2_SOCIETAL_DISPLACEMENT_METHOD_VERSION,
} from "../lib/risk-gate-v2-societal-module-state";

function societalComponent(
  patch: Partial<CountryGeopoliticalRiskComponent> = {},
): CountryGeopoliticalRiskComponent {
  return {
    methodology_version: COUNTRY_RISK_V02_GEOPOLITICS_METHOD_VERSION,
    country_iso3: "IND",
    as_of: "2026-09-14T00:00:00.000Z",
    dimensions: [],
    available_dimension_count: 4,
    total_dimension_count: 5,
    coverage_ratio: 0.8,
    weighted_observed_risk: 62.5,
    score_contribution: 50,
    confidence_factor: 0.8,
    calculation_hash: "c".repeat(64),
    ...patch,
  };
}

describe("Risk Gate v2 political governance support", () => {
  it("turns governed WGI stability into inverse political risk", () => {
    const state = buildRiskGateV2PoliticalGovernanceModuleState({
      current: {
        country_iso3: "IND",
        stability_score: 72,
        observed_at: "2025-12-31T00:00:00.000Z",
        normalized_hash: "d".repeat(64),
        score_ci_lower: 66,
        score_ci_upper: 78,
        source_count: 12,
        commercial_eligibility_status: "VERIFIED",
      },
      generated_at: "2026-09-14T06:30:00.000Z",
    });

    expect(state.module).toBe("political_governance");
    expect(state.score).toBe(28);
    expect(state.coverage).toBe("LIMITED");
    expect(state.commercial_eligibility_status).toBe("VERIFIED");
    expect(state.methodology_version).toBe(
      RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION,
    );
    expect(state.confidence).toBeGreaterThan(0);
    expect(state.confidence).toBeLessThanOrEqual(1);
    expect(state.drivers).toEqual([
      expect.objectContaining({
        driver: "government_stability",
        score_contribution: 28,
      }),
    ]);
  });

  it("derives an auditable delta and preserves non-verified commercial state", () => {
    const state = buildRiskGateV2PoliticalGovernanceModuleState({
      current: {
        country_iso3: "USA",
        stability_score: 55,
        observed_at: "2025-12-31T00:00:00.000Z",
        commercial_eligibility_status: "UNVERIFIED",
      },
      previous: {
        country_iso3: "USA",
        stability_score: 65,
        observed_at: "2024-12-31T00:00:00.000Z",
        commercial_eligibility_status: "UNVERIFIED",
      },
      generated_at: "2026-09-14T06:30:00.000Z",
    });

    expect(state.previous_score).toBe(35);
    expect(state.score).toBe(45);
    expect(state.delta).toBe(10);
    expect(state.commercial_eligibility_status).toBe("UNVERIFIED");
  });
});

describe("Risk Gate v2 societal displacement support", () => {
  it("promotes the existing population-normalized displacement component without broadening coverage", () => {
    const state = buildRiskGateV2SocietalModuleState({
      component: societalComponent(),
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.module).toBe("societal_labor_health");
    expect(state!.score).toBe(62.5);
    expect(state!.coverage).toBe("LIMITED");
    expect(state!.confidence).toBe(0.8);
    expect(state!.methodology_version).toBe(
      RISK_GATE_V2_SOCIETAL_DISPLACEMENT_METHOD_VERSION,
    );
    expect(state!.drivers).toEqual([
      expect.objectContaining({
        driver: "migration_shock",
        score_contribution: 62.5,
      }),
    ]);
  });

  it("fails closed by returning no state when the governed component has no score", () => {
    const state = buildRiskGateV2SocietalModuleState({
      component: societalComponent({
        weighted_observed_risk: null,
        available_dimension_count: 0,
        coverage_ratio: 0,
        confidence_factor: 0,
      }),
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).toBeNull();
  });

  it("keeps previous score and delta tied to the same country", () => {
    const state = buildRiskGateV2SocietalModuleState({
      component: societalComponent({ weighted_observed_risk: 60 }),
      previous_component: societalComponent({
        weighted_observed_risk: 50,
        calculation_hash: "e".repeat(64),
      }),
      generated_at: "2026-09-14T06:30:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state!.previous_score).toBe(50);
    expect(state!.delta).toBe(10);
  });
});
