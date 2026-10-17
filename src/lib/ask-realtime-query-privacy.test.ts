import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { planSafeRealtimeIndexQueries } from "./ask-realtime-search.server";

describe("Ask Geomacro safe worldwide index discovery", () => {
  it("restricts a missing-data lookup to the selected country and topic", () => {
    const plan = planSafeRealtimeIndexQueries("Latest lithium developments in India today?");
    expect(plan.country_iso3).toBe("IND");
    expect(plan.queries).toHaveLength(1);
    expect(plan.queries[0].category).toBe("CRITICAL_MINERALS");
    expect(plan.queries[0].query).toContain('"India" AND (');
    expect(plan.queries[0].query).toContain("lithium");
    expect(plan.timespan).toBe("2d");
  });

  it("uses official 195-country aliases rather than arbitrary user-supplied names", () => {
    const usa = planSafeRealtimeIndexQueries("US latest sanctions news");
    expect(usa.country_iso3).toBe("USA");
    expect(usa.queries).toHaveLength(1);
    expect(usa.queries[0].query).toContain('"United States" AND');
    const korea = planSafeRealtimeIndexQueries("South Korea recent FX developments");
    expect(korea.country_iso3).toBe("KOR");
    expect(korea.queries[0].query).toContain('"South Korea" AND');
  });

  it("uses bounded globally scoped fixed topics without any country", () => {
    const plan = planSafeRealtimeIndexQueries("What changed globally today?");
    expect(plan.country_iso3).toBeNull();
    expect(plan.queries.map(x => x.category)).toEqual([
      "GEOPOLITICS", "MACRO", "CRITICAL_MINERALS",
    ]);
    expect(plan.queries).toHaveLength(3);
    expect(plan.queries.every(q => q.query.length < 250)).toBe(true);
  });

  it("never forwards unrecognized private research words in index queries", () => {
    const privateMarker = "MY_PRIVATE_CUSTOMER_PLAN_92X7";
    const plan = planSafeRealtimeIndexQueries(
      "India latest copper news " + privateMarker,
    );
    expect(plan.country_iso3).toBe("IND");
    expect(JSON.stringify(plan.queries)).not.toContain(privateMarker);
    expect(plan.queries).toHaveLength(1);
  });

  it("does not pass the full question to the optional model formatter", () => {
    const source = readFileSync("src/lib/ask-realtime-search.server.ts", "utf8");
    const modelPayload = source.slice(
      source.indexOf("user: JSON.stringify({"),
      source.indexOf("temperature: 0.1,"),
    );
    expect(modelPayload).toContain("country_iso3: planSafeRealtimeIndexQueries(question)");
    expect(modelPayload).not.toMatch(/\\bquestion\\s*,/u);
    expect(source).not.toContain("searchGdelt(clean,");
    expect(source).toContain('intelligence_tier: "index_observation_unverified"');
    expect(source).toContain("insufficient_evidence: true");
  });
});
