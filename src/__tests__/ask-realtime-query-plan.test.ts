import { describe, expect, it } from "vitest";
import { buildRealtimeSearchPlan } from "@/lib/ask-realtime-query-plan";

describe("Ask GDELT current search planning", () => {
  it("uses a 24-hour source-native cutoff for changing minerals, not 7-day historical results", () => {
    expect(buildRealtimeSearchPlan("What is changing in critical minerals?")).toMatchObject({
      broad: true, maxAgeHours: 24, timespan: "2d",
      broadCategories: ["CRITICAL_MINERALS"],
    });
    expect(buildRealtimeSearchPlan("What's changing in rare earths?")).toMatchObject({
      broad: true, maxAgeHours: 24, broadCategories: ["CRITICAL_MINERALS"],
    });
  });

  it("limits explicitly current macro and geopolitical queries to their requested domain", () => {
    expect(buildRealtimeSearchPlan("What are the latest macroeconomic developments?")).toMatchObject({
      broad: true, maxAgeHours: 6, broadCategories: ["MACRO"],
    });
    expect(buildRealtimeSearchPlan("What are the latest geopolitical developments?")).toMatchObject({
      broad: true, maxAgeHours: 6, broadCategories: ["GEOPOLITICS"],
    });
  });

  it("keeps true unscoped global news multi-domain and bounded to the original evidence day", () => {
    expect(buildRealtimeSearchPlan("What changed today?")).toMatchObject({
      broad: true, maxAgeHours: 24,
      broadCategories: ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"],
    });
  });

  it("preserves non-time-sensitive research without inventing current news", () => {
    expect(buildRealtimeSearchPlan("Explain the lithium supply chain")).toMatchObject({
      broad: false, maxAgeHours: 168, timespan: "7d",
    });
  });
});
