import { describe, expect, it } from "vitest";
import { sourceNativeObservationTime } from "./source-native-observation-time";

const now = Date.parse("2026-10-09T12:00:00Z");
describe("strict source-native commercial freshness", () => {
  it("never upgrades undated evidence using a new retrieval timestamp", () => {
    expect(sourceNativeObservationTime({
      observed_at: null, published_at: null, retrieved_at: "2026-10-09T12:00:00Z",
    }, now)).toBeNull();
  });

  it("uses the original older observation when publication and observation both exist", () => {
    expect(sourceNativeObservationTime({
      observed_at: "2026-10-05T09:00:00Z",
      published_at: "2026-10-09T11:30:00Z",
      retrieved_at: "2026-10-09T12:00:00Z",
    }, now)).toBe(Date.parse("2026-10-05T09:00:00Z"));
  });

  it("accepts a legitimately fresh original time without needing retrieval", () => {
    expect(sourceNativeObservationTime({
      observed_at: "2026-10-09T11:35:00Z", published_at: null, retrieved_at: null,
    }, now)).toBe(Date.parse("2026-10-09T11:35:00Z"));
  });

  it("fails closed on future or invalid native dates even with another valid date", () => {
    expect(sourceNativeObservationTime({
      observed_at: "2026-10-09T12:01:00Z", published_at: "2026-10-09T11:20:00Z",
    }, now)).toBeNull();
    expect(sourceNativeObservationTime({
      observed_at: "not-a-time", published_at: "2026-10-09T11:20:00Z",
    }, now)).toBeNull();
  });

  it("does not infer freshness from an invalid time boundary", () => {
    expect(sourceNativeObservationTime({
      observed_at: "2026-10-09T11:00:00Z",
    }, Number.NaN)).toBeNull();
  });
});
