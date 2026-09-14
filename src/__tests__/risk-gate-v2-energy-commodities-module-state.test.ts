import { describe, expect, it } from "vitest";

import {
  buildRiskGateV2EnergyCommoditiesModuleState,
  RISK_GATE_V2_CRITICAL_MINERAL_SUPPLY_METHOD_VERSION,
  type RiskGateV2CriticalMineralManifest,
  type RiskGateV2CriticalMineralObservation,
} from "../lib/risk-gate-v2-energy-commodities-module-state";

function manifest(
  patch: Partial<RiskGateV2CriticalMineralManifest> = {},
): RiskGateV2CriticalMineralManifest {
  return {
    release_id: "mcs-2026:2025",
    dataset_version: "MCS 2026",
    retrieved_at: "2026-09-14T00:00:00.000Z",
    coverage_end: "2025-12-31T00:00:00.000Z",
    write_completed: true,
    metadata: {
      global_release: true,
      production_source_rows: 12,
      production_normalized_rows: 12,
      production_unmapped_rows: 0,
      production_non_numeric_rows: 0,
    },
    ...patch,
  };
}

function observations(
  values: Array<[string, number]>,
  patch: Partial<RiskGateV2CriticalMineralObservation> = {},
): RiskGateV2CriticalMineralObservation[] {
  return values.map(([country_iso3, value_numeric]) => ({
    country_iso3,
    commodity: "Lithium",
    metric: "mine_production",
    value_numeric,
    unit: "metric tons",
    observed_at: "2025-12-31T00:00:00.000Z",
    statistic: "Mine production",
    ...patch,
  }));
}

describe("Risk Gate v2 critical-mineral supply concentration", () => {
  it("builds a deterministic LIMITED commodity state from a clean global release", () => {
    const state = buildRiskGateV2EnergyCommoditiesModuleState({
      commodity: "Lithium",
      observations: observations([
        ["AUS", 60],
        ["CHL", 30],
        ["ARG", 10],
      ]),
      manifest: manifest(),
      generated_at: "2026-09-14T00:00:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.module).toBe("energy_commodities");
    expect(state!.score).toBe(54.4);
    expect(state!.coverage).toBe("LIMITED");
    expect(state!.confidence).toBe(0.5);
    expect(state!.methodology_version).toBe(
      RISK_GATE_V2_CRITICAL_MINERAL_SUPPLY_METHOD_VERSION,
    );
    expect(state!.drivers).toEqual([
      expect.objectContaining({
        driver: "critical_mineral_disruption",
        score_contribution: 54.4,
      }),
    ]);
  });

  it("fails closed without explicit clean global production completeness", () => {
    expect(
      buildRiskGateV2EnergyCommoditiesModuleState({
        commodity: "Lithium",
        observations: observations([
          ["AUS", 60],
          ["CHL", 40],
        ]),
        manifest: manifest({
          metadata: {
            global_release: true,
            production_source_rows: 10,
            production_normalized_rows: 9,
            production_unmapped_rows: 1,
            production_non_numeric_rows: 0,
          },
        }),
        generated_at: "2026-09-14T00:00:00.000Z",
        commercial_eligibility_status: "VERIFIED",
      }),
    ).toBeNull();
  });

  it("fails closed when producer units cannot be compared", () => {
    const rows = observations([
      ["AUS", 60],
      ["CHL", 40],
    ]);
    rows[1] = { ...rows[1], unit: "kilograms" };

    expect(
      buildRiskGateV2EnergyCommoditiesModuleState({
        commodity: "Lithium",
        observations: rows,
        manifest: manifest(),
        generated_at: "2026-09-14T00:00:00.000Z",
        commercial_eligibility_status: "VERIFIED",
      }),
    ).toBeNull();
  });

  it("fails closed when the source year is too stale", () => {
    expect(
      buildRiskGateV2EnergyCommoditiesModuleState({
        commodity: "Lithium",
        observations: observations(
          [
            ["AUS", 60],
            ["CHL", 40],
          ],
          { observed_at: "2022-12-31T00:00:00.000Z" },
        ),
        manifest: manifest({ coverage_end: "2022-12-31T00:00:00.000Z" }),
        generated_at: "2026-09-14T00:00:00.000Z",
        commercial_eligibility_status: "VERIFIED",
      }),
    ).toBeNull();
  });

  it("derives delta only from a separately supplied previous clean release", () => {
    const state = buildRiskGateV2EnergyCommoditiesModuleState({
      commodity: "Lithium",
      observations: observations([
        ["AUS", 60],
        ["CHL", 30],
        ["ARG", 10],
      ]),
      manifest: manifest(),
      previous_observations: observations(
        [
          ["AUS", 50],
          ["CHL", 30],
          ["ARG", 20],
        ],
        { observed_at: "2024-12-31T00:00:00.000Z" },
      ),
      previous_manifest: manifest({
        release_id: "mcs-2025:2024",
        coverage_end: "2024-12-31T00:00:00.000Z",
      }),
      generated_at: "2026-09-14T00:00:00.000Z",
      commercial_eligibility_status: "VERIFIED",
    });

    expect(state).not.toBeNull();
    expect(state!.previous_score).toBe(45.2);
    expect(state!.delta).toBe(9.2);
    expect(state!.drivers[0].delta_contribution).toBe(9.2);
  });
});
