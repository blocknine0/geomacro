export const HOT_TOPIC_TAXONOMY_VERSION = "geomacro.hot-topic-family.v2" as const;

export const HOT_TOPIC_FAMILIES = [
  "military_conflict",
  "ceasefire_peace",
  "sanctions_export_controls",
  "tariffs_trade_restrictions",
  "election_government_transition",
  "coup_civil_unrest",
  "monetary_policy_rates",
  "inflation_growth_employment",
  "fx_external_stress",
  "sovereign_debt_fiscal",
  "energy_oil_gas",
  "shipping_chokepoints",
  "supply_chain_logistics",
  "critical_minerals",
  "food_agriculture",
  "natural_hazards",
  "banking_financial_system",
  "trade_corridor_disruption",
  "cyber_digital_infrastructure",
  "technology_semiconductors_ai_controls",
  "public_health_biosecurity",
  "migration_refugee_displacement",
  "climate_extreme_weather",
  "water_resource_stress",
  "capital_markets_asset_stress",
  "housing_property_stress",
  "aviation_transport_disruption",
  "industrial_commodities_metals",
  "legal_regulatory_policy",
  "nuclear_security",
] as const;

export type HotTopicFamily = (typeof HOT_TOPIC_FAMILIES)[number];

export type HotTopicFamilyDefinition = {
  family: HotTopicFamily;
  label: string;
  default_max_age_seconds: number;
  event_detection_source: "gdelt_structured_derived";
  authoritative_confirmation:
    | "STRUCTURAL_MODULE_WHEN_REQUESTED"
    | "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE"
    | "EVENT_EVIDENCE_ONLY";
  notes: string;
};

const HOUR = 3_600;
const DAY = 24 * HOUR;

function definition(
  family: HotTopicFamily,
  label: string,
  days: number,
  authoritative_confirmation: HotTopicFamilyDefinition["authoritative_confirmation"],
  notes: string,
): HotTopicFamilyDefinition {
  return {
    family,
    label,
    default_max_age_seconds: days * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation,
    notes,
  };
}

export const HOT_TOPIC_FAMILY_DEFINITIONS: Readonly<
  Record<HotTopicFamily, HotTopicFamilyDefinition>
> = Object.freeze({
  military_conflict: definition("military_conflict", "War, military escalation and armed conflict", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Current-event signal. Organized-violence structural scoring remains a separate governed UCDP module."),
  ceasefire_peace: definition("ceasefire_peace", "Ceasefire, peace talks and de-escalation", 2, "EVENT_EVIDENCE_ONLY", "Time-bounded event evidence; never interpreted as durable peace without continuing evidence."),
  sanctions_export_controls: definition("sanctions_export_controls", "Sanctions, embargoes and export controls", 1, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Event detection is distinct from authoritative sanctions-list status and cannot replace compliance screening."),
  tariffs_trade_restrictions: definition("tariffs_trade_restrictions", "Tariffs and trade restrictions", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Event-level restrictions do not imply measured bilateral trade exposure unless corridor evidence is separately available."),
  election_government_transition: definition("election_government_transition", "Elections, referenda and government transition", 3, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Outcome reporting remains timestamped and evidence-bound; governance scoring is separate."),
  coup_civil_unrest: definition("coup_civil_unrest", "Coups, civil unrest, mass protest and emergency", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Current instability signal only; long-run governance remains separate."),
  monetary_policy_rates: definition("monetary_policy_rates", "Central-bank and interest-rate shocks", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Numeric policy-rate claims require governed official macro observations."),
  inflation_growth_employment: definition("inflation_growth_employment", "Inflation, growth, recession and employment shocks", 3, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Headline event detection is not a substitute for official macro observations."),
  fx_external_stress: definition("fx_external_stress", "Currency, reserves and external-balance stress", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Numeric FX and external claims require governed structural observations; QEDS/IDS are candidates, not implicit authority."),
  sovereign_debt_fiscal: definition("sovereign_debt_fiscal", "Sovereign debt, default and fiscal shocks", 3, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Current events remain separate from versioned sovereign-fiscal peer methodologies."),
  energy_oil_gas: definition("energy_oil_gas", "Energy, oil and gas disruption", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Physical supply and production claims require an eligible governed energy source."),
  shipping_chokepoints: definition("shipping_chokepoints", "Shipping and chokepoint disruption", 1, "EVENT_EVIDENCE_ONLY", "Route disruption evidence does not create direct route-exposure data by inference."),
  supply_chain_logistics: definition("supply_chain_logistics", "Supply-chain and logistics disruption", 2, "EVENT_EVIDENCE_ONLY", "Impact remains evidence-bound and direct dependency gaps must be disclosed."),
  critical_minerals: definition("critical_minerals", "Critical-mineral and rare-earth disruption", 3, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Current restrictions are distinct from governed production and dependency observations."),
  food_agriculture: definition("food_agriculture", "Food, agriculture and fertilizer shock", 3, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Event evidence does not substitute for governed commodity or agriculture series."),
  natural_hazards: definition("natural_hazards", "Earthquake, flood, cyclone, wildfire and natural hazards", 1, "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE", "USGS earthquake ingestion exists; other hazard classes require exact-source promotion before structural claims."),
  banking_financial_system: definition("banking_financial_system", "Banking, liquidity and financial-system stress", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Current bank-stress evidence is separate from structural banking-system observations."),
  trade_corridor_disruption: definition("trade_corridor_disruption", "Trade-corridor disruption", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Current events do not imply full route modeling; endpoint-only limitations remain explicit until direct route evidence exists."),
  cyber_digital_infrastructure: definition("cyber_digital_infrastructure", "Cyberattack and digital-infrastructure disruption", 1, "EVENT_EVIDENCE_ONLY", "Event evidence may indicate disruption but does not establish attribution, compromise scope or technical root cause without authoritative proof."),
  technology_semiconductors_ai_controls: definition("technology_semiconductors_ai_controls", "Semiconductors, AI controls and strategic technology disruption", 2, "EVENT_EVIDENCE_ONLY", "Policy and supply events are separated from measured semiconductor or compute dependencies until governed source data exists."),
  public_health_biosecurity: definition("public_health_biosecurity", "Public-health emergency and biosecurity risk", 2, "EVENT_EVIDENCE_ONLY", "Health-event intelligence is informational and does not replace public-health authority guidance or medical advice."),
  migration_refugee_displacement: definition("migration_refugee_displacement", "Migration, refugee and forced-displacement pressure", 3, "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE", "UNHCR-derived governed evidence may supplement current-event signals where exact source and rights gates pass."),
  climate_extreme_weather: definition("climate_extreme_weather", "Climate and extreme-weather disruption", 2, "EVENT_EVIDENCE_ONLY", "Current disruption evidence is distinct from long-run climate attribution and modeled climate risk."),
  water_resource_stress: definition("water_resource_stress", "Water scarcity, drought and resource stress", 3, "EVENT_EVIDENCE_ONLY", "Event detection does not create a structural water-stress score without a governed quantitative source."),
  capital_markets_asset_stress: definition("capital_markets_asset_stress", "Capital-market and asset-price stress", 1, "EVENT_EVIDENCE_ONLY", "Market-event reporting is contextual and is not an investment signal or trading instruction."),
  housing_property_stress: definition("housing_property_stress", "Housing and property-sector stress", 3, "EVENT_EVIDENCE_ONLY", "Property events are not converted into a structural housing score without governed comparable data."),
  aviation_transport_disruption: definition("aviation_transport_disruption", "Aviation and transport-network disruption", 1, "EVENT_EVIDENCE_ONLY", "Operational disruption evidence does not imply full network or route exposure modeling."),
  industrial_commodities_metals: definition("industrial_commodities_metals", "Industrial commodities and metals disruption", 2, "STRUCTURAL_MODULE_WHEN_REQUESTED", "Price, production and dependency claims require eligible governed commodity observations."),
  legal_regulatory_policy: definition("legal_regulatory_policy", "Material legal, regulatory and policy change", 3, "EVENT_EVIDENCE_ONLY", "Event detection identifies material policy change but does not provide legal advice or jurisdiction-specific compliance clearance."),
  nuclear_security: definition("nuclear_security", "Nuclear-security, facility and proliferation risk", 1, "EVENT_EVIDENCE_ONLY", "High-consequence nuclear events require corroboration; event evidence alone does not establish technical status or attribution."),
});

const FAMILY_PATTERNS: Readonly<Record<HotTopicFamily, RegExp[]>> = {
  military_conflict: [/\bwar\b/i, /\bmilitary\b/i, /\barmed conflict\b/i, /\bair ?strike\b/i, /\bmissile\b/i, /\bdrone attack\b/i, /\binvasion\b/i, /\bshelling\b/i, /\bhostilit/i, /\bterror(?:ism|ist)?\b/i],
  ceasefire_peace: [/\bceasefire\b/i, /\bcease-fire\b/i, /\bpeace talks?\b/i, /\bpeace agreement\b/i, /\btruce\b/i, /\bde[- ]escalat/i],
  sanctions_export_controls: [/\bsanction/i, /\bembargo\b/i, /\bexport control/i, /\bexport ban/i, /\basset freeze\b/i, /\bblacklist/i],
  tariffs_trade_restrictions: [/\btariff/i, /\btrade restriction/i, /\bimport ban/i, /\bimport restriction/i, /\btrade ban/i, /\bcustoms dut/i],
  election_government_transition: [/\belection/i, /\breferendum\b/i, /\bgovernment transition\b/i, /\bpower transition\b/i, /\bnew government\b/i, /\bprime minister resign/i, /\bpresident resign/i],
  coup_civil_unrest: [/\bcoup\b/i, /\bmass protest/i, /\bcivil unrest\b/i, /\bstate of emergency\b/i, /\bmartial law\b/i, /\bgovernment collapse\b/i, /\briots?\b/i],
  monetary_policy_rates: [/\bcentral bank\b/i, /\binterest rate/i, /\bpolicy rate/i, /\brate hike\b/i, /\brate cut\b/i, /\bmonetary policy\b/i, /\bquantitative easing\b/i, /\bquantitative tightening\b/i],
  inflation_growth_employment: [/\binflation\b/i, /\bdeflation\b/i, /\bgdp\b/i, /\bgrowth\b/i, /\brecession\b/i, /\bunemployment\b/i, /\bemployment\b/i, /\bpayroll/i],
  fx_external_stress: [/\bcurrenc/i, /\bforeign exchange\b/i, /\bfx\b/i, /\breserve(?:s)?\b/i, /\bbalance of payments\b/i, /\bcapital controls?\b/i, /\bdevaluat/i, /\bexchange rate\b/i],
  sovereign_debt_fiscal: [/\bsovereign debt\b/i, /\bsovereign default\b/i, /\bdebt crisis\b/i, /\bbond yield/i, /\bfiscal (?:crisis|shock|deficit|policy)\b/i, /\bgovernment debt\b/i, /\bdebt restructur/i],
  energy_oil_gas: [/\boil\b/i, /\bnatural gas\b/i, /\blng\b/i, /\benergy\b/i, /\bpipeline\b/i, /\brefiner/i, /\bpower grid\b/i, /\bpower outage\b/i],
  shipping_chokepoints: [/\bshipping\b/i, /\bmaritime\b/i, /\bchokepoint\b/i, /\bstrait of hormuz\b/i, /\bred sea\b/i, /\bsuez\b/i, /\bbab el[- ]mandeb\b/i, /\bpanama canal\b/i, /\bmalacca\b/i, /\bport closure\b/i, /\bvessel\b/i],
  supply_chain_logistics: [/\bsupply chain\b/i, /\blogistics\b/i, /\bfreight\b/i, /\bcontainer\b/i, /\bport congestion\b/i, /\btransport disruption\b/i, /\bdelivery disruption\b/i],
  critical_minerals: [/\bcritical mineral/i, /\brare earth/i, /\blithium\b/i, /\bcobalt\b/i, /\bnickel\b/i, /\bgraphite\b/i, /\bcopper\b/i, /\bgallium\b/i, /\bgermanium\b/i],
  food_agriculture: [/\bfood\b/i, /\bagricultur/i, /\bwheat\b/i, /\bcorn\b/i, /\bmaize\b/i, /\brice\b/i, /\bgrain\b/i, /\bfertilizer\b/i, /\bcrop\b/i, /\bharvest\b/i],
  natural_hazards: [/\bearthquake\b/i, /\btsunami\b/i, /\bflood\b/i, /\bcyclone\b/i, /\bhurricane\b/i, /\btyphoon\b/i, /\bwildfire\b/i, /\bvolcan/i, /\blandslide\b/i, /\bdrought\b/i],
  banking_financial_system: [/\bbank(?:ing)?\b/i, /\bbank run\b/i, /\bliquidity crisis\b/i, /\bfinancial system\b/i, /\bcredit crunch\b/i, /\bcapital adequacy\b/i, /\bdeposit outflow/i, /\bbank failure\b/i],
  trade_corridor_disruption: [/\btrade corridor\b/i, /\btransit corridor\b/i, /\boverland route\b/i, /\bborder closure\b/i, /\bcross[- ]border disruption\b/i, /\btrade route\b/i, /\broute disruption\b/i],
  cyber_digital_infrastructure: [/\bcyber ?attack\b/i, /\bransomware\b/i, /\bdata breach\b/i, /\bmalware\b/i, /\bddos\b/i, /\bcybersecurity incident\b/i, /\binternet outage\b/i, /\btelecom(?:s)? outage\b/i, /\bsubsea cable\b/i],
  technology_semiconductors_ai_controls: [/\bsemiconductor/i, /\bchip(?:s)?\b/i, /\badvanced computing\b/i, /\bai chip/i, /\bgpu\b/i, /\btechnology control/i, /\bcompute restriction/i, /\bfoundry\b/i],
  public_health_biosecurity: [/\bpandemic\b/i, /\bepidemic\b/i, /\boutbreak\b/i, /\bpublic health emergency\b/i, /\bbiosecurity\b/i, /\bquarantine\b/i, /\binfectious disease\b/i],
  migration_refugee_displacement: [/\brefugee/i, /\bforced displacement\b/i, /\bdisplaced people\b/i, /\bmigration crisis\b/i, /\bmigrant flow/i, /\basylum\b/i, /\binternally displaced\b/i],
  climate_extreme_weather: [/\bextreme weather\b/i, /\bheatwave\b/i, /\bheat wave\b/i, /\bclimate emergency\b/i, /\bclimate shock\b/i, /\bextreme temperature\b/i],
  water_resource_stress: [/\bwater scarcity\b/i, /\bwater stress\b/i, /\breservoir\b/i, /\bwater shortage\b/i, /\bdrought\b/i, /\briver level\b/i, /\bwater ration/i],
  capital_markets_asset_stress: [/\bstock market crash\b/i, /\bmarket selloff\b/i, /\bmarket sell-off\b/i, /\basset price shock\b/i, /\bvolatility spike\b/i, /\bequity rout\b/i, /\bbond market stress\b/i],
  housing_property_stress: [/\bhousing crisis\b/i, /\bproperty crisis\b/i, /\breal estate stress\b/i, /\bmortgage stress\b/i, /\bproperty developer default\b/i, /\bhome prices?\b/i],
  aviation_transport_disruption: [/\bairspace clos/i, /\bflight cancellation/i, /\bairport clos/i, /\baviation disruption\b/i, /\brail disruption\b/i, /\btransport network\b/i, /\bground stop\b/i],
  industrial_commodities_metals: [/\bsteel\b/i, /\baluminium\b/i, /\baluminum\b/i, /\biron ore\b/i, /\bmetals? market\b/i, /\bindustrial commodity\b/i, /\bcommodity shortage\b/i],
  legal_regulatory_policy: [/\bregulation\b/i, /\bregulatory change\b/i, /\bnew law\b/i, /\blegislation\b/i, /\bpolicy change\b/i, /\bcourt ruling\b/i, /\bregulatory ban\b/i],
  nuclear_security: [/\bnuclear plant\b/i, /\bnuclear facility\b/i, /\bnuclear security\b/i, /\bnuclear accident\b/i, /\bradiation\b/i, /\buranium enrichment\b/i, /\bnuclear proliferation\b/i],
};

function canonicalText(parts: Array<string | null | undefined>) {
  return parts
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchingFamilies(text: string) {
  return HOT_TOPIC_FAMILIES.filter((family) =>
    FAMILY_PATTERNS[family].some((pattern) => pattern.test(text)),
  );
}

export function inferHotTopicFamiliesFromQuestion(
  question: string | null | undefined,
): HotTopicFamily[] {
  if (!question?.trim()) return [];
  return matchingFamilies(question);
}

export function classifyHotTopicEvent(input: {
  event_type?: string | null;
  title?: string | null;
  summary?: string | null;
  domain?: string | null;
}): HotTopicFamily[] {
  const text = canonicalText([
    input.event_type,
    input.title,
    input.summary,
    input.domain,
  ]);
  if (!text) return [];
  return matchingFamilies(text);
}

export function hotTopicFamilyMaxAgeSeconds(family: HotTopicFamily) {
  return HOT_TOPIC_FAMILY_DEFINITIONS[family].default_max_age_seconds;
}
