import { describe, expect, it } from "vitest";

import { evaluateEarlyWarningDerivedEligibility } from "./early-warning-source-eligibility.server";

const source = {
  source_id: "example_source",
  commercial_usage_status: "COMMERCIAL_OK",
  enabled_for_ingestion: true,
  enabled_for_commercial_signals: true,
  raw_redistribution_allowed: false,
  attribution_required: true,
  licence_name: "Example licence",
};

const observation = {
  observation_id: "obs-1",
  source_id: "example_source",
  quality_status: "VERIFIED",
  commercial_eligibility_status: "DERIVED_ONLY",
};

describe("Early Warning derived source policy", () => {
  it("allows commercially approved derived-only delivery without granting raw redistribution", () => {
    const result = evaluateEarlyWarningDerivedEligibility({ source, observation });
    expect(result.eligible).toBe(true);
    expect(result.delivery_boundary).toBe("DERIVED_ONLY");
    expect(result.raw_payload_allowed).toBe(false);
    expect(result.attribution_required).toBe(true);
  });

  it("fails closed when commercial-signal activation is disabled", () => {
    const result = evaluateEarlyWarningDerivedEligibility({
      source: { ...source, enabled_for_commercial_signals: false },
      observation,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason_codes).toContain("SOURCE_COMMERCIAL_SIGNALS_DISABLED");
  });

  it("allows an explicitly DERIVED_ONLY source only when its commercial signal gate is enabled", () => {
    const result = evaluateEarlyWarningDerivedEligibility({
      source: { ...source, commercial_usage_status: "DERIVED_ONLY" },
      observation,
    });
    expect(result.eligible).toBe(true);
  });

  it("rejects review-required or unverified source states", () => {
    const result = evaluateEarlyWarningDerivedEligibility({
      source: { ...source, commercial_usage_status: "REVIEW_REQUIRED" },
      observation,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason_codes).toContain("SOURCE_STATUS_REVIEW_REQUIRED");
  });

  it("requires a verified observation for public/commercial derived alerts", () => {
    const result = evaluateEarlyWarningDerivedEligibility({
      source,
      observation: { ...observation, quality_status: "PARTIAL" },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason_codes).toContain("OBSERVATION_QUALITY_PARTIAL");
  });

  it("rejects blocked observation commercial state", () => {
    const result = evaluateEarlyWarningDerivedEligibility({
      source,
      observation: { ...observation, commercial_eligibility_status: "BLOCKED" },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason_codes).toContain("OBSERVATION_COMMERCIAL_STATUS_BLOCKED");
  });

  it("rejects a source mismatch", () => {
    const result = evaluateEarlyWarningDerivedEligibility({
      source,
      observation: { ...observation, source_id: "different_source" },
    });
    expect(result.eligible).toBe(false);
    expect(result.reason_codes).toContain("OBSERVATION_SOURCE_MISMATCH");
  });
});
