import { describe, expect, it } from "vitest";
import {
  HOT_TOPIC_FAMILIES,
  HOT_TOPIC_FAMILY_DEFINITIONS,
  HOT_TOPIC_TAXONOMY_VERSION,
  classifyHotTopicEvent,
  inferHotTopicFamiliesFromQuestion,
} from "./hot-topic-taxonomy";

describe("governed hot-topic taxonomy", () => {
  it("publishes a versioned definition for every family", () => {
    expect(HOT_TOPIC_TAXONOMY_VERSION).toBe("geomacro.hot-topic-family.v1");
    expect(HOT_TOPIC_FAMILIES).toHaveLength(18);
    expect(Object.keys(HOT_TOPIC_FAMILY_DEFINITIONS).sort()).toEqual(
      [...HOT_TOPIC_FAMILIES].sort(),
    );
    for (const family of HOT_TOPIC_FAMILIES) {
      const definition = HOT_TOPIC_FAMILY_DEFINITIONS[family];
      expect(definition.family).toBe(family);
      expect(definition.default_max_age_seconds).toBeGreaterThan(0);
      expect(definition.event_detection_source).toBe("gdelt_structured_derived");
    }
  });

  it.each([
    ["Iran military escalation and missile attacks", "military_conflict"],
    ["new ceasefire and peace talks", "ceasefire_peace"],
    ["latest export controls and sanctions", "sanctions_export_controls"],
    ["new tariffs and import restrictions", "tariffs_trade_restrictions"],
    ["election and government transition", "election_government_transition"],
    ["coup and mass protests", "coup_civil_unrest"],
    ["central bank rate cut", "monetary_policy_rates"],
    ["inflation and unemployment shock", "inflation_growth_employment"],
    ["currency devaluation and reserve stress", "fx_external_stress"],
    ["sovereign default and debt restructuring", "sovereign_debt_fiscal"],
    ["oil and gas pipeline disruption", "energy_oil_gas"],
    ["shipping disruption in the Red Sea", "shipping_chokepoints"],
    ["supply chain and freight disruption", "supply_chain_logistics"],
    ["rare earth export disruption", "critical_minerals"],
    ["wheat and fertilizer shock", "food_agriculture"],
    ["earthquake and tsunami", "natural_hazards"],
    ["bank run and liquidity crisis", "banking_financial_system"],
    ["cross-border trade corridor disruption", "trade_corridor_disruption"],
  ] as const)("maps %s to %s", (question, expected) => {
    expect(inferHotTopicFamiliesFromQuestion(question)).toContain(expected);
  });

  it("can classify one event into multiple relevant families without inventing exclusivity", () => {
    const families = classifyHotTopicEvent({
      event_type: "export control",
      title: "Rare earth export controls disrupt supply chains",
      summary: "Shipping and logistics reroute after new restrictions",
      domain: "rare_earth",
    });
    expect(families).toContain("sanctions_export_controls");
    expect(families).toContain("critical_minerals");
    expect(families).toContain("supply_chain_logistics");
    expect(families).toContain("shipping_chokepoints");
  });

  it("returns no family when governed patterns do not match", () => {
    expect(
      classifyHotTopicEvent({
        event_type: "other",
        title: "Routine administrative notice",
        summary: null,
        domain: "multi",
      }),
    ).toEqual([]);
  });
});
