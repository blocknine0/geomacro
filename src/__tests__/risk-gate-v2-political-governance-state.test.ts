import { describe, expect, it } from "vitest";

import {
  buildRiskGateV2PoliticalGovernanceState,
  RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION,
} from "../lib/risk-gate-v2-political-governance-state";

const HASH = "a".repeat(64);

function observation(overrides: Partial<Parameters<typeof buildRiskGateV2PoliticalGovernanceState>[0]["observation"]> = {}) {
  return {
    country_iso3: "IND",
    absolute_score: 52.4723123,
    score_ci_lower: 46.2443539,
    score_ci_upper: 58.7002706,
    source_count: 12,
    observed_at: "2025-12-31T00:00:00.000Z",
    normalized_hash: HASH,
    ...overrides,
  };
}

describe("Risk Gate v2 WGI political governance state", () => {
  it("inverts the WGI governance score transparently and preserves limited coverage", () => {
    const state = buildRiskGateV2PoliticalGovernanceState({
      observation: observation(),
      generated_at: "2026-09-14T00:00:00.000Z",
    });

    expect(state).not.toBeNull();
    expect(state?.module).toBe("political_governance");
    expect(state?.score).toBeCloseTo(47.527688, 6);
    expect(state?.coverage).toBe("LIMITED");
    expect(state?.commercial_eligibility_status).toBe("VERIFIED");
    expect(state?.methodology_version).toBe(
      RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION,
    );
    expect(state?.drivers[0]?.driver).toBe("government_stability");
  });

  it("uses WGI uncertainty, source breadth and freshness in confidence", () => {
    const current = buildRiskGateV2PoliticalGovernanceState({
      observation: observation({ observed_at: "2026-06-30T00:00:00.000Z" }),
      generated_at: "2026-09-14T00:00:00.000Z",
    });
    const aging = buildRiskGateV2PoliticalGovernanceState({
      observation: observation({ observed_at: "2025-01-01T00:00:00.000Z" }),
      generated_at: "2026-09-14T00:00:00.000Z",
    });

    expect(current?.confidence).toBeGreaterThan(aging?.confidence ?? 1);
    expect(current?.confidence).toBeGreaterThan(0);
    expect(current?.confidence).toBeLessThanOrEqual(1);
  });

  it("fails closed when the annual governance observation is stale", () => {
    const state = buildRiskGateV2PoliticalGovernanceState({
      observation: observation({ observed_at: "2023-01-01T00:00:00.000Z" }),
      generated_at: "2026-09-14T00:00:00.000Z",
    });

    expect(state).toBeNull();
  });

  it("preserves deterministic delta direction from the prior WGI observation", () => {
    const state = buildRiskGateV2PoliticalGovernanceState({
      observation: observation({ absolute_score: 50 }),
      previous_observation: observation({
        absolute_score: 60,
        observed_at: "2024-12-31T00:00:00.000Z",
        normalized_hash: "b".repeat(64),
      }),
      generated_at: "2026-09-14T00:00:00.000Z",
    });

    expect(state?.score).toBe(50);
    expect(state?.previous_score).toBe(40);
    expect(state?.delta).toBe(10);
  });
});
