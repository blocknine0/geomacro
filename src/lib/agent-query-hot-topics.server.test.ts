import { describe, expect, it } from "vitest";
import { evaluateHotTopicSourceFreshness } from "./agent-query-hot-topics.server";

describe("hot-topic source-native freshness", () => {
  const nowMs = Date.parse("2026-10-09T12:00:00.000Z");

  it("accepts a healthy cursor within its configured cadence", () => {
    expect(
      evaluateHotTopicSourceFreshness({
        status: "healthy",
        lastSuccessAt: new Date(nowMs - 120_000).toISOString(),
        cadenceSeconds: 120,
        nowMs,
      }),
    ).toEqual({ healthy: true, lagSeconds: 120, allowedLagSeconds: 120 });
  });

  it("rejects a fast source after its 60-second jitter floor", () => {
    expect(
      evaluateHotTopicSourceFreshness({
        status: "healthy",
        lastSuccessAt: new Date(nowMs - 61_000).toISOString(),
        cadenceSeconds: 30,
        nowMs,
      }),
    ).toEqual({ healthy: false, lagSeconds: 61, allowedLagSeconds: 60 });
  });

  it("fails closed for missing cursors and invalid cadence", () => {
    expect(
      evaluateHotTopicSourceFreshness({
        status: "healthy",
        lastSuccessAt: null,
        cadenceSeconds: 60,
        nowMs,
      }).healthy,
    ).toBe(false);
    expect(
      evaluateHotTopicSourceFreshness({
        status: "healthy",
        lastSuccessAt: new Date(nowMs).toISOString(),
        cadenceSeconds: 0,
        nowMs,
      }),
    ).toEqual({ healthy: false, lagSeconds: 0, allowedLagSeconds: 0 });
  });

  it("rejects future cursors instead of clamping their age to zero", () => {
    expect(
      evaluateHotTopicSourceFreshness({
        status: "healthy",
        lastSuccessAt: new Date(nowMs + 1_000).toISOString(),
        cadenceSeconds: 60,
        nowMs,
      }),
    ).toEqual({ healthy: false, lagSeconds: null, allowedLagSeconds: 60 });
  });
});
