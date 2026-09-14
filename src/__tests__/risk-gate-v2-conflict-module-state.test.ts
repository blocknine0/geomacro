import { describe, expect, it } from "vitest";

import {
  buildRiskGateV2GeopoliticalSecurityModuleState,
  RISK_GATE_V2_CONFLICT_METHOD_VERSION,
  type RiskGateV2ConflictCountryInput,
} from "../lib/risk-gate-v2-geopolitical-security-module-state";

function iso3For(index: number) {
  const a = Math.floor(index / (26 * 26)) % 26;
  const b = Math.floor(index / 26) % 26;
  const c = index % 26;
  return String.fromCharCode(65 + a, 65 + b, 65 + c);
}

function peers(): RiskGateV2ConflictCountryInput[] {
  const rows: RiskGateV2ConflictCountryInput[] = [];
  for (let index = 0; index < 120; index += 1) {
    const country = iso3For(index);
    rows.push({
      country_iso3: country === "IND" ? "ZZZ" : country,
      population: 10_000_000,
      population_observed_at: "2025-12-31T00:00:00.000Z",
      verified_event_count: index === 0 ? 0 : index,
      excluded_event_count: 0,
      best_estimate_deaths: index === 0 ? 0 : index * 2,
    });
  }
  return rows;
}

function snapshot(target: RiskGateV2ConflictCountryInput) {
  return {
    as_of: "2026-09-14T00:00:00.000Z",
    source_retrieved_at: "2026-09-10T00:00:00.000Z",
    countries: [...peers(), target],
  };
}

describe("Risk Gate v2 UCDP conflict module", () => {
  it("builds a deterministic LIMITED geopolitical-security state", () => {
    const state = buildRiskGateV2GeopoliticalSecurityModuleState({
      country_iso3: "IND",
      current: snapshot({
        country_iso3: "IND",
        population: 10_000_000,
        population_observed_at: "2025-12-31T00:00:00.000Z",
        verified_event_count: 150,
        excluded_event_count: 0,
        best_estimate_deaths: 500,
      }),
      generated_at: "2026-09-14T06:30:00.000Z",
    });

    expect(state).not.toBeNull();
    expect(state!.module).toBe("geopolitical_security");
    expect(state!.coverage).toBe("LIMITED");
    expect(state!.commercial_eligibility_status).toBe("VERIFIED");
    expect(state!.methodology_version).toBe(RISK_GATE_V2_CONFLICT_METHOD_VERSION);
    expect(state!.score).toBeGreaterThan(90);
    expect(state!.confidence).toBeGreaterThan(0.9);
    expect(state!.drivers).toEqual([
      expect.objectContaining({
        driver: "military_escalation",
      }),
    ]);
  });

  it("treats a verified zero-event country as zero organized-violence exposure", () => {
    const state = buildRiskGateV2GeopoliticalSecurityModuleState({
      country_iso3: "IND",
      current: snapshot({
        country_iso3: "IND",
        population: 10_000_000,
        population_observed_at: "2025-12-31T00:00:00.000Z",
        verified_event_count: 0,
        excluded_event_count: 0,
        best_estimate_deaths: 0,
      }),
      generated_at: "2026-09-14T06:30:00.000Z",
    });

    expect(state!.score).toBe(0);
  });

  it("reduces confidence when provisional rows are excluded", () => {
    const clean = buildRiskGateV2GeopoliticalSecurityModuleState({
      country_iso3: "IND",
      current: snapshot({
        country_iso3: "IND",
        population: 10_000_000,
        population_observed_at: "2025-12-31T00:00:00.000Z",
        verified_event_count: 10,
        excluded_event_count: 0,
        best_estimate_deaths: 20,
      }),
      generated_at: "2026-09-14T06:30:00.000Z",
    });

    const degraded = buildRiskGateV2GeopoliticalSecurityModuleState({
      country_iso3: "IND",
      current: snapshot({
        country_iso3: "IND",
        population: 10_000_000,
        population_observed_at: "2025-12-31T00:00:00.000Z",
        verified_event_count: 10,
        excluded_event_count: 10,
        best_estimate_deaths: 20,
      }),
      generated_at: "2026-09-14T06:30:00.000Z",
    });

    expect(degraded!.confidence).toBeLessThan(clean!.confidence);
  });

  it("fails closed when the governed monthly source is too stale", () => {
    const current = snapshot({
      country_iso3: "IND",
      population: 10_000_000,
      population_observed_at: "2025-12-31T00:00:00.000Z",
      verified_event_count: 10,
      excluded_event_count: 0,
      best_estimate_deaths: 20,
    });
    current.source_retrieved_at = "2026-06-01T00:00:00.000Z";

    expect(
      buildRiskGateV2GeopoliticalSecurityModuleState({
        country_iso3: "IND",
        current,
        generated_at: "2026-09-14T06:30:00.000Z",
      }),
    ).toBeNull();
  });

  it("fails closed when the peer universe is too small", () => {
    expect(
      buildRiskGateV2GeopoliticalSecurityModuleState({
        country_iso3: "IND",
        current: {
          as_of: "2026-09-14T00:00:00.000Z",
          source_retrieved_at: "2026-09-10T00:00:00.000Z",
          countries: [
            {
              country_iso3: "IND",
              population: 10_000_000,
              population_observed_at: "2025-12-31T00:00:00.000Z",
              verified_event_count: 1,
              excluded_event_count: 0,
              best_estimate_deaths: 1,
            },
          ],
        },
        generated_at: "2026-09-14T06:30:00.000Z",
      }),
    ).toBeNull();
  });
});
