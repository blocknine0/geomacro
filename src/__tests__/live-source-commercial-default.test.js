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
    const observation =
      buildObservation(baseInput);

    expect(
      observation
        .commercial_eligibility_status,
    ).toBe("UNVERIFIED");
  });

  it("preserves an explicitly reviewed commercial eligibility status", () => {
    const observation =
      buildObservation({
        ...baseInput,
        sourceRecordId:
          "record_2",
        commercialEligibilityStatus:
          "VERIFIED",
      });

    expect(
      observation
        .commercial_eligibility_status,
    ).toBe("VERIFIED");
  });
});
