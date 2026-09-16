import { describe, expect, it } from "vitest";

import { buildEarlyWarningAlertRecord } from "./early-warning-service.server";

const baseInput = {
  alert_key: "ind-policy-20260916-001",
  visibility: "public" as const,
  country_iso3: "IND",
  country_name: "India",
  country_timezone: "Asia/Kolkata",
  event_family: "monetary_policy",
  event_title: "Verified policy-sensitive development",
  primary_cause: "A verified policy development with cross-market transmission potential",
  cews_inputs: {
    novelty: 80,
    severity: 90,
    escalation_velocity: 80,
    structural_vulnerability: 70,
    transmission_potential: 90,
    evidence_confidence: 80,
    source_reliability: 90,
    recency: 100,
  },
  confidence: 0.86,
  independent_evidence_count: 3,
  official_source_present: true,
  evidence_refs: ["official:example", "independent:example-2"],
  transmission_channels: ["rates", "currency", "capital_flows", "equities"],
  market_relevance: {
    equities: "HIGH" as const,
    crypto: "MODERATE" as const,
    fx: "VERY_HIGH" as const,
  },
  source_event_ids: ["event-1"],
  first_source_seen_at_utc: "2026-09-16T08:12:20Z",
  detected_at_utc: "2026-09-16T08:12:41Z",
  public_url: "https://geomacro.live/intelligence/example",
};

const driverInput = {
  ...baseInput,
  transmission_channels: undefined,
  market_relevance: undefined,
};

describe("early warning record builder", () => {
  it("builds a timestamped auditable public-eligible legacy record", () => {
    const record = buildEarlyWarningAlertRecord(baseInput);

    expect(record.status).toBe("CRITICAL");
    expect(record.cews_score).toBe(84);
    expect(record.detected_at_utc).toBe("2026-09-16T08:12:41.000Z");
    expect(record.detected_at_local).toBe("2026-09-16T13:42:41+05:30");
    expect(record.public_eligible).toBe(true);
    expect(record.public_eligibility_reasons).toEqual(["eligible"]);
    expect(record.evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.calculation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.market_impact).toBeNull();
    expect(record.market_impact_methodology_version).toBeNull();
    expect(record.market_impact_hash).toBeNull();
    expect(record.market_impact_calibrated).toBe(false);
  });

  it("derives a deterministic market-impact map from the structural driver", () => {
    const record = buildEarlyWarningAlertRecord({
      ...driverInput,
      market_impact_driver: "MONETARY_TIGHTENING",
    });

    expect(record.market_impact).toMatchObject({
      methodology_version: "early-warning-market-impact-v0.1-provisional",
      calibrated: false,
      structural_pressure_only: true,
      market_price_prediction: false,
      trading_instruction: false,
      driver: "MONETARY_TIGHTENING",
      country_iso3: "IND",
      assets: {
        equities: { relevance: "HIGH", pressure_direction: "NEGATIVE" },
        crypto: { relevance: "HIGH", pressure_direction: "NEGATIVE" },
        fx: { relevance: "HIGH", pressure_direction: "POSITIVE" },
        rates: { relevance: "VERY_HIGH", pressure_direction: "POSITIVE" },
        commodities: { relevance: "MODERATE", pressure_direction: "MIXED" },
      },
    });
    expect(record.market_relevance).toEqual({
      equities: "HIGH",
      crypto: "HIGH",
      fx: "HIGH",
      rates: "VERY_HIGH",
      commodities: "MODERATE",
    });
    expect(record.transmission_channels).toEqual([
      "policy_rates",
      "discount_rates",
      "financial_conditions",
      "capital_flows",
    ]);
    expect(record.market_impact_methodology_version).toBe(
      "early-warning-market-impact-v0.1-provisional",
    );
    expect(record.market_impact_calibrated).toBe(false);
    expect(record.market_impact_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces stable hashes for the same canonical input", () => {
    const a = buildEarlyWarningAlertRecord(baseInput);
    const b = buildEarlyWarningAlertRecord(baseInput);
    expect(a.evidence_hash).toBe(b.evidence_hash);
    expect(a.calculation_hash).toBe(b.calculation_hash);

    const c = buildEarlyWarningAlertRecord({
      ...driverInput,
      market_impact_driver: "BANKING_STRESS",
    });
    const d = buildEarlyWarningAlertRecord({
      ...driverInput,
      market_impact_driver: "BANKING_STRESS",
    });
    expect(c.market_impact_hash).toBe(d.market_impact_hash);
  });

  it("keeps different market-impact drivers cryptographically distinct", () => {
    const tightening = buildEarlyWarningAlertRecord({
      ...driverInput,
      market_impact_driver: "MONETARY_TIGHTENING",
    });
    const easing = buildEarlyWarningAlertRecord({
      ...driverInput,
      market_impact_driver: "MONETARY_EASING",
    });
    expect(tightening.market_impact_hash).not.toBe(easing.market_impact_hash);
  });

  it("rejects conflicting deterministic and caller-supplied market mappings", () => {
    expect(() =>
      buildEarlyWarningAlertRecord({
        ...baseInput,
        market_impact_driver: "MONETARY_TIGHTENING",
      }),
    ).toThrow(/cannot be combined/);
  });

  it("keeps lower-confidence records private from automatic distribution", () => {
    const record = buildEarlyWarningAlertRecord({ ...baseInput, confidence: 0.69 });
    expect(record.public_eligible).toBe(false);
    expect(record.public_eligibility_reasons).toContain("confidence_below_public_threshold");
  });

  it("rejects source timing that occurs after detection", () => {
    expect(() =>
      buildEarlyWarningAlertRecord({
        ...baseInput,
        first_source_seen_at_utc: "2026-09-16T08:13:00Z",
      }),
    ).toThrow(/cannot be after/);
  });
});
