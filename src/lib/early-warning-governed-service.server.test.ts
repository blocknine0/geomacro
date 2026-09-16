import { describe, expect, it } from "vitest";

import { canonicalGovernedEventFamily } from "./early-warning-governed-service.server";

describe("governed Early Warning entrypoint", () => {
  it("normalizes a public known event family", () => {
    expect(
      canonicalGovernedEventFamily({
        event_family: "central bank policy",
        visibility: "public",
      }),
    ).toBe("monetary_policy");
  });

  it("rejects an unclassified public event family", () => {
    expect(() =>
      canonicalGovernedEventFamily({
        event_family: "mysterious development",
        visibility: "public",
      }),
    ).toThrow(/classified canonical event family/);
  });

  it("allows unclassified private research records without inventing a category", () => {
    expect(
      canonicalGovernedEventFamily({
        event_family: "mysterious development",
        visibility: "private",
      }),
    ).toBe("other");
  });
});
