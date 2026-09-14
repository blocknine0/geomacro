import { describe, expect, it } from "vitest";
import {
  buildRiskGateV2GeopoliticalSecuritySnapshot,
  RISK_GATE_V2_GEOPOLITICAL_SECURITY_METHOD_VERSION,
} from "../lib/risk-gate-v2-geopolitical-security-state";

const release = {
  release_id: "ucdp-candidate:26.0.7",
  manifest_hash: "c".repeat(64),
  coverage_start: "2026-01-01T00:00:00.000Z",
  coverage_end: "2026-07-31T00:00:00.000Z",
  retrieved_at: "2026-08-10T00:00:00.000Z",
  write_completed: true as const,
  rejected_rows: 0 as const,
  unmapped_rows: 0 as const,
};

describe("Risk Gate v2 UCDP geopolitical security snapshot", () => {
  it("creates comparable states from one clean global release", () => {
    const states = buildRiskGateV2GeopoliticalSecuritySnapshot({
      sovereign_iso3: ["IND", "USA", "CHN"],
      release,
      generated_at: "2026-09-01T00:00:00.000Z",
      events: [
        { country_iso3: "IND", observed_at: "2026-07-20T00:00:00.000Z", best_deaths: 2, type_of_violence: "2" },
        { country_iso3: "CHN", observed_at: "2026-07-10T00:00:00.000Z", best_deaths: 20, type_of_violence: "1" },
      ],
    });

    expect(states.size).toBe(3);
    expect(states.get("USA")?.score).toBe(0);
    expect(states.get("CHN")?.score).toBeGreaterThan(states.get("IND")?.score ?? 0);
    expect(states.get("CHN")?.coverage).toBe("PARTIAL");
    expect(states.get("CHN")?.commercial_eligibility_status).toBe("VERIFIED");
    expect(states.get("CHN")?.methodology_version).toBe(RISK_GATE_V2_GEOPOLITICAL_SECURITY_METHOD_VERSION);
  });

  it("returns no current states when the global release is stale", () => {
    const states = buildRiskGateV2GeopoliticalSecuritySnapshot({
      sovereign_iso3: ["IND", "USA"],
      release,
      generated_at: "2027-01-01T00:00:00.000Z",
      events: [],
    });
    expect(states.size).toBe(0);
  });

  it("rejects an unreconciled release", () => {
    const badRelease = { ...release, unmapped_rows: 1 } as unknown as typeof release;
    expect(() =>
      buildRiskGateV2GeopoliticalSecuritySnapshot({
        sovereign_iso3: ["IND", "USA"],
        release: badRelease,
        generated_at: "2026-09-01T00:00:00.000Z",
        events: [],
      }),
    ).toThrow(/clean completed global release/);
  });
});
