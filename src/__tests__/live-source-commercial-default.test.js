import { describe, expect, it } from "vitest";

import {
  buildObservation,
} from "../../scripts/lib-live-source-utils.mjs";

const baseInput = {
  sourceId: "test_source",
  sourceRecordId: "record_1",
  category: "macro",
  countryIso3: "USA",
  observedAt: "2026-09-08T00:00:00.000Z",
  metric: "test_metric",
  valueNumeric: 1,
  rawPayload: {
    id: "record_1",
    value: 1,
  },
};

describe("live external source commercial eligibility", () => {
  it("fails closed when commercial eligibility is not explicitly supplied", () => {
    const observation = buildObservation(baseInput);
    expect(observation.commercial_eligibility_status).toBe("UNVERIFIED");
  });

  it("rejects an unknown source that attempts to self-promote to VERIFIED", () => {
    expect(() =>
      buildObservation({
        ...baseInput,
        sourceRecordId: "record_2",
        commercialEligibilityStatus: "VERIFIED",
      }),
    ).toThrow(/not approved for source test_source/);
  });

  it("allows VERIFIED only for a reviewed source in the runtime policy", () => {
    const observation = buildObservation({
      ...baseInput,
      sourceId: "unhcr_refugee_statistics",
      sourceRecordId: "record_3",
      commercialEligibilityStatus: "VERIFIED",
    });
    expect(observation.commercial_eligibility_status).toBe("VERIFIED");
  });

  it("preserves the derived-only boundary for ReliefWeb", () => {
    const observation = buildObservation({
      ...baseInput,
      sourceId: "reliefweb",
      sourceRecordId: "record_4",
      commercialEligibilityStatus: "DERIVED_ONLY",
    });
    expect(observation.commercial_eligibility_status).toBe("DERIVED_ONLY");
  });

  it("does not allow ReliefWeb to escalate from DERIVED_ONLY to VERIFIED", () => {
    expect(() =>
      buildObservation({
        ...baseInput,
        sourceId: "reliefweb",
        sourceRecordId: "record_5",
        commercialEligibilityStatus: "VERIFIED",
      }),
    ).toThrow(/not approved for source reliefweb/);
  });
});
