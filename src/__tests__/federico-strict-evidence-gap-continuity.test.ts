import { describe, expect, it } from "vitest";
import { buildCountryRiskObject } from "../lib/country-risk-engine";

describe("Federico strict evidence-gap continuity", () => {
  it("carries forward the previous score without inventing cooling when no fresh evidence exists", async () => {
    const previous = {
      schema_version: "gro-1.1",
      subject: {
        type: "country",
        id: "CHN",
      },
      methodology_version: "country-risk-v0.1.0-pilot",
      risk: {
        score: 57.388,
      },
      attribution: [
        {
          driver: "conflict",
          score_contribution: 57.388,
          delta_contribution: 1.25,
          event_count: 2,
          weight: 0.75,
        },
      ],
    } as any;

    const result = await buildCountryRiskObject({
      country_iso3: "CHN",
      events: [],
      previous,
      as_of: "2026-09-19T04:30:00.000Z",
      calculation_namespace: "federico_strict_evidence_v1",
    });

    expect(result.risk.score).toBe(57.4);
    expect(result.risk.previous_score).toBe(57.388);
    expect(result.risk.delta).toBeNull();
    expect(result.risk.direction).toBe("unknown");
    expect(result.decision_readiness.status).toBe("UNREADY");
    expect(result.decision_readiness.reason_codes).toContain(
      "no_fresh_evidence",
    );
    expect(result.decision_readiness.reason_codes).toContain(
      "score_carried_forward_without_fresh_evidence",
    );
    expect(result.provenance.reproducibility.score_components.raw_score).toBe(
      57.4,
    );
    expect(result.attribution[0]?.score_contribution).toBe(57.388);
    expect(result.attribution[0]?.delta_contribution).toBeNull();
    expect(result.attribution[0]?.event_count).toBe(0);
    expect(result.attribution[0]?.weight).toBe(0);
  });
});
