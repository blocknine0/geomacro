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
    expect(HOT_TOPIC_TAXONOMY_VERSION).toBe("geomacro.hot-topic-family.v2");
    expect(HOT_TOPIC_FAMILIES).toHaveLength(30);
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
    ["ransomware cyberattack caused an internet outage", "cyber_digital_infrastructure"],
    ["semiconductor and AI chip controls tightened", "technology_semiconductors_ai_controls"],
    ["public health emergency after infectious disease outbreak", "public_health_biosecurity"],
    ["refugee and forced displacement crisis", "migration_refugee_displacement"],
    ["extreme weather and heatwave disrupt operations", "climate_extreme_weather"],
    ["water scarcity and reservoir shortage", "water_resource_stress"],
    ["market selloff and volatility spike", "capital_markets_asset_stress"],
    ["property crisis and mortgage stress", "housing_property_stress"],
    ["airspace closure causes flight cancellations", "aviation_transport_disruption"],
    ["steel and iron ore commodity shortage", "industrial_commodities_metals"],
    ["new legislation triggers a regulatory change", "legal_regulatory_policy"],
    ["nuclear facility security and radiation incident", "nuclear_security"],
  ] as const)("maps %s to %s", (question, expected) => {
    expect(inferHotTopicFamiliesFromQuestion(question)).toContain(expected);
  });

  it("can classify one event into multiple relevant families without inventing exclusivity", () => {
    const families = classifyHotTopicEvent({
      event_type: "export control",
      title: "Rare earth and semiconductor export controls disrupt supply chains",
      summary: "Shipping and logistics reroute after new technology restrictions",
      domain: "rare_earth",
    });
    expect(families).toContain("sanctions_export_controls");
    expect(families).toContain("critical_minerals");
    expect(families).toContain("technology_semiconductors_ai_controls");
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
