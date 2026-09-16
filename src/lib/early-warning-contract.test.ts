import { describe, expect, it } from "vitest";

import {
  CEWS_METHOD_VERSION,
  computeCews,
  earlyWarningStatus,
  localTimestampFor,
  publicEarlyWarningEligible,
} from "./early-warning-contract";

describe("early warning contract", () => {
  it("computes a deterministic provisional CEWS score with auditable contributions", () => {
    const result = computeCews({
      novelty: 80,
      severity: 90,
      escalation_velocity: 80,
      structural_vulnerability: 70,
      transmission_potential: 90,
      evidence_confidence: 80,
      source_reliability: 90,
      recency: 100,
    });

    expect(result.methodology_version).toBe(CEWS_METHOD_VERSION);
    expect(result.score).toBe(84);
    expect(result.status).toBe("CRITICAL");
    expect(result.calibrated).toBe(false);
    expect(result.weighted_contributions).toEqual({
      novelty: 8,
      severity: 18,
      escalation_velocity: 12,
      structural_vulnerability: 10.5,
      transmission_potential: 13.5,
      evidence_confidence: 8,
      source_reliability: 9,
      recency: 5,
    });
  });

  it("uses explicit provisional status thresholds", () => {
    expect(earlyWarningStatus(0)).toBe("NORMAL");
    expect(earlyWarningStatus(29.99)).toBe("NORMAL");
    expect(earlyWarningStatus(30)).toBe("WATCH");
    expect(earlyWarningStatus(50)).toBe("ELEVATED");
    expect(earlyWarningStatus(65)).toBe("WARNING");
    expect(earlyWarningStatus(80)).toBe("CRITICAL");
  });

  it("fails closed on invalid CEWS component values", () => {
    expect(() =>
      computeCews({
        novelty: 101,
        severity: 90,
        escalation_velocity: 80,
        structural_vulnerability: 70,
        transmission_potential: 90,
        evidence_confidence: 80,
        source_reliability: 90,
        recency: 100,
      }),
    ).toThrow(/novelty/);
  });

  it("converts a canonical UTC timestamp to the affected country local time", () => {
    expect(localTimestampFor("2026-09-16T08:12:41Z", "Asia/Kolkata")).toBe(
      "2026-09-16T13:42:41+05:30",
    );
    expect(localTimestampFor("2026-09-16T08:12:41Z", "Asia/Tokyo")).toBe(
      "2026-09-16T17:12:41+09:00",
    );
  });

  it("requires public high-severity evidence-backed alerts before public distribution", () => {
    expect(
      publicEarlyWarningEligible({
        visibility: "public",
        status: "WARNING",
        confidence: 0.86,
        independent_evidence_count: 3,
        official_source_present: false,
      }),
    ).toBe(true);

    expect(
      publicEarlyWarningEligible({
        visibility: "public",
        status: "ELEVATED",
        confidence: 0.95,
        independent_evidence_count: 5,
        official_source_present: true,
      }),
    ).toBe(false);

    expect(
      publicEarlyWarningEligible({
        visibility: "public",
        status: "CRITICAL",
        confidence: 0.69,
        independent_evidence_count: 5,
        official_source_present: true,
      }),
    ).toBe(false);
  });
});
