export const HOT_TOPIC_TAXONOMY_VERSION = "geomacro.hot-topic-family.v1" as const;

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

export const HOT_TOPIC_FAMILY_DEFINITIONS: Readonly<
  Record<HotTopicFamily, HotTopicFamilyDefinition>
> = Object.freeze({
  military_conflict: {
    family: "military_conflict",
    label: "War, military escalation and armed conflict",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current-event signal. Organized-violence structural scoring remains a separate governed UCDP module.",
  },
  ceasefire_peace: {
    family: "ceasefire_peace",
    label: "Ceasefire, peace talks and de-escalation",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Time-bounded event evidence; never interpreted as durable peace without continuing evidence.",
  },
  sanctions_export_controls: {
    family: "sanctions_export_controls",
    label: "Sanctions, embargoes and export controls",
    default_max_age_seconds: DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Event detection is distinct from authoritative sanctions-list status. Paid sanctions status also requires its structural module to pass rights and freshness gates.",
  },
  tariffs_trade_restrictions: {
    family: "tariffs_trade_restrictions",
    label: "Tariffs and trade restrictions",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Event-level restrictions do not imply measured bilateral trade exposure unless corridor evidence is separately available.",
  },
  election_government_transition: {
    family: "election_government_transition",
    label: "Elections, referenda and government transition",
    default_max_age_seconds: 3 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Outcome reporting remains timestamped and evidence-bound; governance scoring is separate.",
  },
  coup_civil_unrest: {
    family: "coup_civil_unrest",
    label: "Coups, civil unrest, mass protest and emergency",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current instability signal only; long-run governance remains separate.",
  },
  monetary_policy_rates: {
    family: "monetary_policy_rates",
    label: "Central-bank and interest-rate shocks",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current-event interpretation should be paired with governed macro observations when a numeric rate claim is required.",
  },
  inflation_growth_employment: {
    family: "inflation_growth_employment",
    label: "Inflation, growth, recession and employment shocks",
    default_max_age_seconds: 3 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Headline event detection is not a substitute for official macro observations.",
  },
  fx_external_stress: {
    family: "fx_external_stress",
    label: "Currency, reserves and external-balance stress",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Numeric FX/external claims require the governed structural module in addition to current-event evidence.",
  },
  sovereign_debt_fiscal: {
    family: "sovereign_debt_fiscal",
    label: "Sovereign debt, default and fiscal shocks",
    default_max_age_seconds: 3 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Debt/fiscal current events are distinct from the structural sovereign-fiscal score and peer methodology.",
  },
  energy_oil_gas: {
    family: "energy_oil_gas",
    label: "Energy, oil and gas disruption",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Physical supply/production claims require an eligible energy data source when the structural module is requested.",
  },
  shipping_chokepoints: {
    family: "shipping_chokepoints",
    label: "Shipping and chokepoint disruption",
    default_max_age_seconds: DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Route disruption is current-event evidence. It does not create direct route-exposure data by inference.",
  },
  supply_chain_logistics: {
    family: "supply_chain_logistics",
    label: "Supply-chain and logistics disruption",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Supply-chain impact remains evidence-bound and must disclose when direct dependency data is absent.",
  },
  critical_minerals: {
    family: "critical_minerals",
    label: "Critical-mineral and rare-earth disruption",
    default_max_age_seconds: 3 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current restrictions are distinct from structural mineral-production/dependency observations.",
  },
  food_agriculture: {
    family: "food_agriculture",
    label: "Food, agriculture and fertilizer shock",
    default_max_age_seconds: 3 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current event evidence does not substitute for a governed commodity/agriculture structural series.",
  },
  natural_hazards: {
    family: "natural_hazards",
    label: "Earthquake, flood, cyclone, wildfire and natural hazards",
    default_max_age_seconds: DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE",
    notes: "USGS earthquake ingestion exists as a direct supplement; other hazard families require exact-source promotion before structural claims.",
  },
  banking_financial_system: {
    family: "banking_financial_system",
    label: "Banking, liquidity and financial-system stress",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current bank-stress evidence is separate from structural banking-system observations.",
  },
  trade_corridor_disruption: {
    family: "trade_corridor_disruption",
    label: "Trade-corridor disruption",
    default_max_age_seconds: 2 * DAY,
    event_detection_source: "gdelt_structured_derived",
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current corridor-event evidence does not imply direct bilateral route modeling; endpoint-only limitations remain explicit until route data is proven.",
  },
});

const FAMILY_PATTERNS: Readonly<Record<HotTopicFamily, RegExp[]>> = {
  military_conflict: [
    /\bwar\b/i,
    /\bmilitary\b/i,
    /\barmed conflict\b/i,
    /\bair ?strike\b/i,
    /\bmissile\b/i,
    /\bdrone attack\b/i,
    /\binvasion\b/i,
    /\bshelling\b/i,
    /\bhostilit/i,
    /\bterror(?:ism|ist)?\b/i,
  ],
  ceasefire_peace: [
    /\bceasefire\b/i,
    /\bcease-fire\b/i,
    /\bpeace talks?\b/i,
    /\bpeace agreement\b/i,
    /\btruce\b/i,
    /\bde[- ]escalat/i,
  ],
  sanctions_export_controls: [
    /\bsanction/i,
    /\bembargo\b/i,
    /\bexport control/i,
    /\bexport ban/i,
    /\basset freeze\b/i,
    /\bblacklist/i,
  ],
  tariffs_trade_restrictions: [
    /\btariff/i,
    /\btrade restriction/i,
    /\bimport ban/i,
    /\bimport restriction/i,
    /\btrade ban/i,
    /\bcustoms dut/i,
  ],
  election_government_transition: [
    /\belection/i,
    /\breferendum\b/i,
    /\bgovernment transition\b/i,
    /\bpower transition\b/i,
    /\bnew government\b/i,
    /\bprime minister resign/i,
    /\bpresident resign/i,
  ],
  coup_civil_unrest: [
    /\bcoup\b/i,
    /\bmass protest/i,
    /\bcivil unrest\b/i,
    /\bstate of emergency\b/i,
    /\bmartial law\b/i,
    /\bgovernment collapse\b/i,
    /\briots?\b/i,
  ],
  monetary_policy_rates: [
    /\bcentral bank\b/i,
    /\binterest rate/i,
    /\bpolicy rate/i,
    /\brate hike\b/i,
    /\brate cut\b/i,
    /\bmonetary policy\b/i,
    /\bquantitative easing\b/i,
    /\bquantitative tightening\b/i,
  ],
  inflation_growth_employment: [
    /\binflation\b/i,
    /\bdeflation\b/i,
    /\bgdp\b/i,
    /\bgrowth\b/i,
    /\brecession\b/i,
    /\bunemployment\b/i,
    /\bemployment\b/i,
    /\bpayroll/i,
  ],
  fx_external_stress: [
    /\bcurrenc/i,
    /\bforeign exchange\b/i,
    /\bfx\b/i,
    /\breserve(?:s)?\b/i,
    /\bbalance of payments\b/i,
    /\bcapital controls?\b/i,
    /\bdevaluat/i,
    /\bexchange rate\b/i,
  ],
  sovereign_debt_fiscal: [
    /\bsovereign debt\b/i,
    /\bsovereign default\b/i,
    /\bdebt crisis\b/i,
    /\bbond yield/i,
    /\bfiscal (?:crisis|shock|deficit|policy)\b/i,
    /\bgovernment debt\b/i,
    /\bdebt restructur/i,
  ],
  energy_oil_gas: [
    /\boil\b/i,
    /\bnatural gas\b/i,
    /\blng\b/i,
    /\benergy\b/i,
    /\bpipeline\b/i,
    /\brefiner/i,
    /\bpower grid\b/i,
    /\bpower outage\b/i,
  ],
  shipping_chokepoints: [
    /\bshipping\b/i,
    /\bmaritime\b/i,
    /\bchokepoint\b/i,
    /\bstrait of hormuz\b/i,
    /\bred sea\b/i,
    /\bsuez\b/i,
    /\bbab el[- ]mandeb\b/i,
    /\bpanama canal\b/i,
    /\bmalacca\b/i,
    /\bport closure\b/i,
    /\bvessel\b/i,
  ],
  supply_chain_logistics: [
    /\bsupply chain\b/i,
    /\blogistics\b/i,
    /\bfreight\b/i,
    /\bcontainer\b/i,
    /\bport congestion\b/i,
    /\btransport disruption\b/i,
    /\bdelivery disruption\b/i,
  ],
  critical_minerals: [
    /\bcritical mineral/i,
    /\brare earth/i,
    /\blithium\b/i,
    /\bcobalt\b/i,
    /\bnickel\b/i,
    /\bgraphite\b/i,
    /\bcopper\b/i,
    /\bgallium\b/i,
    /\bgermanium\b/i,
  ],
  food_agriculture: [
    /\bfood\b/i,
    /\bagricultur/i,
    /\bwheat\b/i,
    /\bcorn\b/i,
    /\bmaize\b/i,
    /\brice\b/i,
    /\bgrain\b/i,
    /\bfertilizer\b/i,
    /\bcrop\b/i,
    /\bharvest\b/i,
  ],
  natural_hazards: [
    /\bearthquake\b/i,
    /\btsunami\b/i,
    /\bflood\b/i,
    /\bcyclone\b/i,
    /\bhurricane\b/i,
    /\btyphoon\b/i,
    /\bwildfire\b/i,
    /\bvolcan/i,
    /\blandslide\b/i,
    /\bdrought\b/i,
  ],
  banking_financial_system: [
    /\bbank(?:ing)?\b/i,
    /\bbank run\b/i,
    /\bliquidity crisis\b/i,
    /\bfinancial system\b/i,
    /\bcredit crunch\b/i,
    /\bcapital adequacy\b/i,
    /\bdeposit outflow/i,
    /\bbank failure\b/i,
  ],
  trade_corridor_disruption: [
    /\btrade corridor\b/i,
    /\btransit corridor\b/i,
    /\boverland route\b/i,
    /\bborder closure\b/i,
    /\bcross[- ]border disruption\b/i,
    /\btrade route\b/i,
    /\broute disruption\b/i,
  ],
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
