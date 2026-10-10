import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifySourcePulse } from "../components/intelligence/source-network-monitor";

const now = Date.parse("2026-10-10T17:00:00Z");
function payload(override: Record<string, unknown> = {}) {
  return {
    category: "critical-minerals",
    original_publisher_observation: {
      schema: "geomacro.category-original-source-pulse-30m.v1",
      target_poll_minutes: 30,
      observational_only: true,
      current_signed_risk_intelligence_verified: false,
      paid_availability_proven: false,
      observation: {
        status: "SOURCE_NATIVE_OBSERVED",
        checked_at: "2026-10-10T16:45:00Z",
        publisher_topic_items_in_last_30m: 2,
      },
      ...override,
    },
  };
}
describe("#1827 private source-monitoring on Intelligence versus actual verified news", () => {
  it("shows a recent original-publisher topic count without claiming accepted scored news", () => {
    const x = classifySourcePulse(payload(), "critical-minerals", now);
    expect(x.topicCount).toBe(2);
    expect(x.label).toContain("not scored");
    expect(x.lastChecked).toBe("2026-10-10T16:45:00Z");
  });
  it("does not claim no worldwide events when one sampled original publisher has zero", () => {
    const x = classifySourcePulse(
      payload({ observation: {
        status: "SOURCE_NATIVE_OBSERVED",
        checked_at: "2026-10-10T16:45:00Z",
        publisher_topic_items_in_last_30m: 0,
      }}),
      "critical-minerals", now,
    );
    expect(x.topicCount).toBe(0);
    expect(x.label).toContain("sampled publisher");
  });
  it("marks stale/future clocks unknown instead of refreshing native pubDate", () => {
    for (const checked_at of ["2026-10-10T15:00:00Z", "2026-10-10T18:00:00Z"]) {
      const x = classifySourcePulse(payload({
        observation: {
          status: "SOURCE_NATIVE_OBSERVED",
          checked_at,
          publisher_topic_items_in_last_30m: 9,
        },
      }), "critical-minerals", now);
      expect(x.topicCount).toBeNull();
      expect(x.label).toContain("stale");
    }
  });
  it("never promotes degraded or malformed provider response to real current events", () => {
    const degraded = classifySourcePulse(payload({ observation: {
      status: "SOURCE_TRANSPORT_DEGRADED",
      checked_at: "2026-10-10T16:45:00Z",
      publisher_topic_items_in_last_30m: null,
    }}), "critical-minerals", now);
    expect(degraded.topicCount).toBeNull();
    expect(degraded.label).toContain("degraded");
    expect(classifySourcePulse(payload(), "macro-fx", now).topicCount).toBeNull();
    for (const v of [NaN, Infinity, -1, "2", 1001, null]) {
      const x = classifySourcePulse(payload({ observation: {
        status: "SOURCE_NATIVE_OBSERVED",
        checked_at: "2026-10-10T16:45:00Z",
        publisher_topic_items_in_last_30m: v,
      }}), "critical-minerals", now);
      expect(x.topicCount).toBeNull();
    }
    expect(classifySourcePulse(payload({ paid_availability_proven: true }), "critical-minerals", now).topicCount).toBeNull();
  });
  it("does not bypass canonical story deduplication, current desk or qualified API", () => {
    const route = readFileSync("src/routes/intelligence.tsx", "utf8");
    const editorial = readFileSync("src/lib/intelligence-editorial.ts", "utf8");
    const alias = readFileSync("src/lib/category-intelligence-alias.server.ts", "utf8");
    expect(route).toContain("<SourceNetworkMonitor />");
    expect(route).toContain("currentVerifiedDeskEvents(pool)");
    expect(route).toContain("scoredNews(intel.data?.all ?? [])");
    expect(editorial).toContain("dedupePublicIntelligenceRows(eligible.map");
    expect(alias).toContain("return mainnetIntelligenceHandlers.POST({ request: canonicalRequest })");
    expect(alias).toContain("source_intake: publicIntelligenceSourceCoverage(");
  });
});
