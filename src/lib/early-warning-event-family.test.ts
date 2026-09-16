import { describe, expect, it } from "vitest";

import {
  candidateTransmissionChannels,
  normalizeEarlyWarningEventFamily,
} from "./early-warning-event-family";

describe("Early Warning event-family normalization", () => {
  it("normalizes common labels into stable canonical families", () => {
    expect(normalizeEarlyWarningEventFamily("Rate Decision")).toBe("monetary_policy");
    expect(normalizeEarlyWarningEventFamily("central-bank policy")).toBe("monetary_policy");
    expect(normalizeEarlyWarningEventFamily("Sanctions Update")).toBe("sanctions");
    expect(normalizeEarlyWarningEventFamily("port closure")).toBe("shipping_logistics");
    expect(normalizeEarlyWarningEventFamily("earthquake")).toBe("natural_disaster");
  });

  it("does not fuzzy-guess unknown event families", () => {
    expect(normalizeEarlyWarningEventFamily("unexpected mysterious development")).toBe("other");
  });

  it("provides candidate channels as hypotheses rather than asserted impact", () => {
    expect(candidateTransmissionChannels("monetary_policy")).toContain("rates");
    expect(candidateTransmissionChannels("commodity_supply")).toContain("commodity_prices");
    expect(candidateTransmissionChannels("other")).toEqual([]);
  });
});
