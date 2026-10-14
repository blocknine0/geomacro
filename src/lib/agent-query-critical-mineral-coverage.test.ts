import { describe, expect, it } from "vitest";
import {
  buildAgentQueryPlan,
  inferAgentQueryTopics,
} from "./agent-query-plan";
import { inferOnDemandMineral } from "./on-demand-global-discovery.server";

describe("canonical natural-language mineral-to-category routing", () => {
  it.each([
    ["Copper mining output in Chile", "copper"],
    ["Graphite exports from China", "graphite"],
    ["Rare-earths supply in Australia", "rare earth"],
    ["Lithium demand in Argentina", "lithium"],
    ["Nickel processing in Indonesia", "nickel"],
  ] as const)("routes %s to the existing mineral discovery adapter", (question, mineral) => {
    expect(inferAgentQueryTopics(question)).toContain("critical_minerals");
    expect(inferOnDemandMineral(question)).toBe(mineral);
  });

  it("preserves cross-category sanctions topic for graphite export controls", () => {
    const question="Graphite export controls from China";
    const topics=inferAgentQueryTopics(question);
    expect(topics).toEqual(["critical_minerals", "sanctions_restrictions"]);
    expect(inferOnDemandMineral(question)).toBe("graphite");
    const plan=buildAgentQueryPlan({
      question, subjects:[{type:"country", country_iso3:"CHN"}],
      fulfillment_mode:"live_on_demand",
    });
    expect(plan.topics).toEqual(["critical_minerals", "sanctions_restrictions"]);
    expect(plan.required_modules).toEqual(["critical_minerals", "sanctions_restrictions"]);
    expect(plan.fulfillment_mode).toBe("live_on_demand");
    expect(plan.query_plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("preserves the explicit-topic contract and does not change existing explicit-topic query hashes", () => {
    const shared={subjects:[{type:"country" as const,country_iso3:"CHL"}],
      topics:["macro_risk" as const],
      question:"Copper mining in Chile",fulfillment_mode:"published_only" as const};
    const plan=buildAgentQueryPlan(shared);
    expect(plan.topics).toEqual(["macro_risk"]);
    expect(plan.required_modules).toEqual(["macro_monetary", "sovereign_fiscal"]);
    expect(plan.query_plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not conflate non-mineral substrings with copper and graphite", () => {
    expect(inferAgentQueryTopics("Graphitesque product launch")).not.toContain("critical_minerals");
    expect(inferAgentQueryTopics("Copperfield election poll")).not.toContain("critical_minerals");
  });
});
