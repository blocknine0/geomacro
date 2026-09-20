export const HOT_TOPIC_TAXONOMY_VERSION =
  "geomacro.hot-topic-family.v2" as const;

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
  "payments_settlement_disruption",
  "border_customs_transit_disruption",
  "electricity_grid_disruption",
  "climate_water_heat_stress",
  "public_health_emergency",
  "migration_displacement_shock",
  "labor_strike_workforce_disruption",
  "cyber_systemic_attack",
  "telecom_internet_shutdown",
  "submarine_cable_gnss_navigation_disruption",
  "regulatory_legal_policy_shock",
  "information_influence_disinformation_shock",
  "insurance_market_withdrawal_war_risk",
  "expropriation_nationalization_shock",
  "investment_screening_restriction",
  "technology_semiconductor_export_control_shock",
  "capital_controls_convertibility_shock",
  "rare_material_long_tail_supply_shock",
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

type FamilyPolicy = Omit<
  HotTopicFamilyDefinition,
  "family" | "event_detection_source"
> & {
  patterns: RegExp[];
};

const HOUR = 3_600;
const DAY = 24 * HOUR;

const FAMILY_POLICY: Record<HotTopicFamily, FamilyPolicy> = {
  military_conflict: {
    label: "War, military escalation and armed conflict",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current-event signal. Organized-violence structural scoring remains a separate governed UCDP module.",
    patterns: [
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
  },
  ceasefire_peace: {
    label: "Ceasefire, peace talks and de-escalation",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Time-bounded event evidence; never interpreted as durable peace without continuing evidence.",
    patterns: [
      /\bceasefire\b/i,
      /\bcease-fire\b/i,
      /\bpeace talks?\b/i,
      /\bpeace agreement\b/i,
      /\btruce\b/i,
      /\bde[- ]escalat/i,
    ],
  },
  sanctions_export_controls: {
    label: "Sanctions, embargoes and export controls",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Event detection is distinct from authoritative sanctions-list status.",
    patterns: [
      /\bsanction/i,
      /\bembargo\b/i,
      /\bexport control/i,
      /\bexport ban/i,
      /\basset freeze\b/i,
      /\bblacklist/i,
    ],
  },
  tariffs_trade_restrictions: {
    label: "Tariffs and trade restrictions",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Event-level restrictions do not imply measured bilateral trade exposure unless corridor evidence is separately available.",
    patterns: [
      /\btariff/i,
      /\btrade restriction/i,
      /\bimport ban/i,
      /\bimport restriction/i,
      /\btrade ban/i,
      /\bcustoms dut/i,
    ],
  },
  election_government_transition: {
    label: "Elections, referenda and government transition",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Outcome reporting remains timestamped and evidence-bound; governance scoring is separate.",
    patterns: [
      /\belection/i,
      /\breferendum\b/i,
      /\bgovernment transition\b/i,
      /\bpower transition\b/i,
      /\bnew government\b/i,
      /\bprime minister resign/i,
      /\bpresident resign/i,
    ],
  },
  coup_civil_unrest: {
    label: "Coups, civil unrest, mass protest and emergency",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current instability signal only; long-run governance remains separate.",
    patterns: [
      /\bcoup\b/i,
      /\bmass protest/i,
      /\bcivil unrest\b/i,
      /\bstate of emergency\b/i,
      /\bmartial law\b/i,
      /\bgovernment collapse\b/i,
      /\briots?\b/i,
    ],
  },
  monetary_policy_rates: {
    label: "Central-bank and interest-rate shocks",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current-event interpretation should be paired with governed macro observations when a numeric rate claim is required.",
    patterns: [
      /\bcentral bank\b/i,
      /\binterest rate/i,
      /\bpolicy rate/i,
      /\brate hike\b/i,
      /\brate cut\b/i,
      /\bmonetary policy\b/i,
      /\bquantitative easing\b/i,
      /\bquantitative tightening\b/i,
    ],
  },
  inflation_growth_employment: {
    label: "Inflation, growth, recession and employment shocks",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Headline event detection is not a substitute for official macro observations.",
    patterns: [
      /\binflation\b/i,
      /\bdeflation\b/i,
      /\bgdp\b/i,
      /\bgrowth\b/i,
      /\brecession\b/i,
      /\bunemployment\b/i,
      /\bemployment\b/i,
      /\bpayroll/i,
    ],
  },
  fx_external_stress: {
    label: "Currency, reserves and external-balance stress",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Numeric FX/external claims require the governed structural module in addition to current-event evidence.",
    patterns: [
      /\bcurrenc/i,
      /\bforeign exchange\b/i,
      /\bfx\b/i,
      /\breserve(?:s)?\b/i,
      /\bbalance of payments\b/i,
      /\bcapital controls?\b/i,
      /\bdevaluat/i,
      /\bexchange rate\b/i,
    ],
  },
  sovereign_debt_fiscal: {
    label: "Sovereign debt, default and fiscal shocks",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Debt/fiscal current events are distinct from the structural sovereign-fiscal score and peer methodology.",
    patterns: [
      /\bsovereign debt\b/i,
      /\bsovereign default\b/i,
      /\bdebt crisis\b/i,
      /\bbond yield/i,
      /\bfiscal (?:crisis|shock|deficit|policy)\b/i,
      /\bgovernment debt\b/i,
      /\bdebt restructur/i,
    ],
  },
  energy_oil_gas: {
    label: "Energy, oil and gas disruption",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Physical supply/production claims require an eligible energy data source when the structural module is requested.",
    patterns: [
      /\boil\b/i,
      /\bnatural gas\b/i,
      /\blng\b/i,
      /\benergy\b/i,
      /\bpipeline\b/i,
      /\brefiner/i,
      /\bpower grid\b/i,
      /\bpower outage\b/i,
    ],
  },
  shipping_chokepoints: {
    label: "Shipping and chokepoint disruption",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Route disruption is current-event evidence. It does not create direct route-exposure data by inference.",
    patterns: [
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
  },
  supply_chain_logistics: {
    label: "Supply-chain and logistics disruption",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Supply-chain impact remains evidence-bound and must disclose when direct dependency data is absent.",
    patterns: [
      /\bsupply chain\b/i,
      /\blogistics\b/i,
      /\bfreight\b/i,
      /\bcontainer\b/i,
      /\bport congestion\b/i,
      /\btransport disruption\b/i,
      /\bdelivery disruption\b/i,
    ],
  },
  critical_minerals: {
    label: "Critical-mineral and rare-earth disruption",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current restrictions are distinct from structural mineral-production/dependency observations.",
    patterns: [
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
  },
  food_agriculture: {
    label: "Food, agriculture and fertilizer shock",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current event evidence does not substitute for a governed commodity/agriculture structural series.",
    patterns: [
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
  },
  natural_hazards: {
    label: "Earthquake, flood, cyclone, wildfire and natural hazards",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE",
    notes: "USGS and disaster-alert data can supplement current-event detection; structural claims remain source-bound.",
    patterns: [
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
  },
  banking_financial_system: {
    label: "Banking, liquidity and financial-system stress",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current bank-stress evidence is separate from structural banking-system observations.",
    patterns: [
      /\bbank(?:ing)?\b/i,
      /\bbank run\b/i,
      /\bliquidity crisis\b/i,
      /\bfinancial system\b/i,
      /\bcredit crunch\b/i,
      /\bcapital adequacy\b/i,
      /\bdeposit outflow/i,
      /\bbank failure\b/i,
    ],
  },
  trade_corridor_disruption: {
    label: "Trade-corridor disruption",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Current corridor-event evidence does not imply direct bilateral route modeling.",
    patterns: [
      /\btrade corridor\b/i,
      /\btransit corridor\b/i,
      /\boverland route\b/i,
      /\bborder closure\b/i,
      /\bcross[- ]border disruption\b/i,
      /\btrade route\b/i,
      /\broute disruption\b/i,
    ],
  },
  payments_settlement_disruption: {
    label: "Payments and settlement disruption",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Payment and settlement events require explicit rail/counterparty evidence before machine decision use.",
    patterns: [
      /\bpayment (?:rail|system|network)\b/i,
      /\bcross[- ]border payment/i,
      /\bsettlement (?:system|delay|disruption)\b/i,
      /\bcorrespondent bank/i,
      /\bswift disruption\b/i,
      /\bpayment outage\b/i,
    ],
  },
  border_customs_transit_disruption: {
    label: "Border, customs and transit disruption",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Border events are evidence-bound and do not imply measured trade impact without separate trade-flow evidence.",
    patterns: [
      /\bborder closure\b/i,
      /\bborder crossing\b/i,
      /\bcustoms disruption\b/i,
      /\bcustoms restriction\b/i,
      /\btransit restriction\b/i,
      /\bborder congestion\b/i,
    ],
  },
  electricity_grid_disruption: {
    label: "Electricity and grid disruption",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE",
    notes: "Grid outages and attacks require location and infrastructure evidence before material impact is inferred.",
    patterns: [
      /\belectricity outage\b/i,
      /\bpower grid\b/i,
      /\bgrid outage\b/i,
      /\bpower station\b/i,
      /\bblackout\b/i,
    ],
  },
  climate_water_heat_stress: {
    label: "Climate, water and heat stress",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Climate and water signals are structural/event overlays and require source-specific geography and time windows.",
    patterns: [
      /\bheatwave\b/i,
      /\bheat stress\b/i,
      /\bwater stress\b/i,
      /\bwater scarcity\b/i,
      /\bclimate stress\b/i,
      /\bextreme heat\b/i,
      /\bdrought\b/i,
    ],
  },
  public_health_emergency: {
    label: "Public-health emergency",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Outbreak and health-system events require affected-jurisdiction and time-bounded evidence.",
    patterns: [
      /\bpublic health emergency\b/i,
      /\boutbreak\b/i,
      /\bepidemic\b/i,
      /\bpandemic\b/i,
      /\bhealth emergency\b/i,
      /\bhealth system collapse\b/i,
    ],
  },
  migration_displacement_shock: {
    label: "Migration and displacement shock",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Displacement and migration events require explicit source attribution and affected geography.",
    patterns: [
      /\bdisplacement\b/i,
      /\brefugee influx\b/i,
      /\brefugee flow/i,
      /\bmigration shock\b/i,
      /\binternally displaced\b/i,
    ],
  },
  labor_strike_workforce_disruption: {
    label: "Labor strikes and workforce disruption",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Labor events are current evidence; employment structure remains separately sourced.",
    patterns: [
      /\bstrike\b/i,
      /\bstriking workers\b/i,
      /\blabor disruption\b/i,
      /\blabour disruption\b/i,
      /\bworkforce shortage\b/i,
      /\bworker shortage\b/i,
    ],
  },
  cyber_systemic_attack: {
    label: "Systemic cyber attack",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE",
    notes: "Cyber event evidence does not by itself establish systemic financial or infrastructure impact.",
    patterns: [
      /\bcyberattack\b/i,
      /\bcyber attack\b/i,
      /\bransomware\b/i,
      /\bknown exploited vulnerabilit/i,
      /\bcritical infrastructure hack/i,
    ],
  },
  telecom_internet_shutdown: {
    label: "Telecom outage and internet shutdown",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE",
    notes: "Communications disruption requires affected geography and duration evidence.",
    patterns: [
      /\binternet shutdown\b/i,
      /\binternet outage\b/i,
      /\btelecom outage\b/i,
      /\bmobile network outage\b/i,
      /\bcommunications blackout\b/i,
    ],
  },
  submarine_cable_gnss_navigation_disruption: {
    label: "Subsea cable, GNSS and navigation disruption",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "DIRECT_SOURCE_SUPPLEMENT_AVAILABLE",
    notes: "Cable and navigation events are evidence-bound and must not be treated as route-wide outages by inference.",
    patterns: [
      /\bsubmarine cable\b/i,
      /\bsubsea cable\b/i,
      /\bgnss disruption\b/i,
      /\bgps disruption\b/i,
      /\bnavigation interference\b/i,
    ],
  },
  regulatory_legal_policy_shock: {
    label: "Regulatory and legal policy shock",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Legal/regulatory event detection must disclose jurisdiction, effective date and source provenance.",
    patterns: [
      /\bregulatory change\b/i,
      /\bnew regulation\b/i,
      /\blicensing restriction\b/i,
      /\bforeign investment restriction\b/i,
      /\bproduct ban\b/i,
      /\bdata localization\b/i,
    ],
  },
  information_influence_disinformation_shock: {
    label: "Information influence and disinformation shock",
    default_max_age_seconds: DAY,
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Information-integrity classifications remain evidence-bound and must not assert intent without source-backed evidence.",
    patterns: [
      /\bdisinformation\b/i,
      /\bmisinformation\b/i,
      /\bforeign influence\b/i,
      /\binformation operation\b/i,
      /\bfalse information\b/i,
    ],
  },
  insurance_market_withdrawal_war_risk: {
    label: "Insurance withdrawal and war-risk repricing",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "EVENT_EVIDENCE_ONLY",
    notes: "Insurance-capacity and war-risk pricing events require explicit market or carrier evidence.",
    patterns: [
      /\binsurance withdrawal\b/i,
      /\bwar risk premium\b/i,
      /\bwar-risk insurance\b/i,
      /\binsurance capacity\b/i,
      /\breinsurance retreat\b/i,
    ],
  },
  expropriation_nationalization_shock: {
    label: "Expropriation and nationalization shock",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Property-control events require affected asset/jurisdiction evidence and legal context.",
    patterns: [
      /\bexpropriat/i,
      /\bnationali[sz]ation\b/i,
      /\bstate takeover\b/i,
      /\basset seizure\b/i,
    ],
  },
  investment_screening_restriction: {
    label: "Investment screening and capital-entry restriction",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Investment-screening events require jurisdiction and effective-date evidence.",
    patterns: [
      /\binvestment screening\b/i,
      /\bforeign investment review\b/i,
      /\binbound investment restriction\b/i,
      /\bcapital entry restriction\b/i,
    ],
  },
  technology_semiconductor_export_control_shock: {
    label: "Technology and semiconductor export-control shock",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Technology restrictions require exact jurisdiction, controlled item and effective-date evidence.",
    patterns: [
      /\bsemiconductor export control/i,
      /\bchip export restriction/i,
      /\btechnology export control/i,
      /\badvanced chip ban\b/i,
    ],
  },
  capital_controls_convertibility_shock: {
    label: "Capital-control and convertibility shock",
    default_max_age_seconds: 2 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Capital-control events require explicit jurisdiction, instrument and effective-date evidence.",
    patterns: [
      /\bcapital control/i,
      /\bconvertibility restriction\b/i,
      /\bcurrency control\b/i,
      /\brepatriation restriction\b/i,
    ],
  },
  rare_material_long_tail_supply_shock: {
    label: "Rare-material long-tail supply shock",
    default_max_age_seconds: 3 * DAY,
    authoritative_confirmation: "STRUCTURAL_MODULE_WHEN_REQUESTED",
    notes: "Rare-material scarcity is a broad discovery family; materiality must be separately evidenced.",
    patterns: [
      /\brare material shortage\b/i,
      /\bstrategic material shortage\b/i,
      /\bmaterial supply shock\b/i,
      /\bminor metal shortage\b/i,
    ],
  },
};

export const HOT_TOPIC_FAMILY_DEFINITIONS: Readonly<
  Record<HotTopicFamily, HotTopicFamilyDefinition>
> = Object.freeze(
  Object.fromEntries(
    HOT_TOPIC_FAMILIES.map((family) => [
      family,
      {
        family,
        event_detection_source: "gdelt_structured_derived" as const,
        label: FAMILY_POLICY[family].label,
        default_max_age_seconds:
          FAMILY_POLICY[family].default_max_age_seconds,
        authoritative_confirmation:
          FAMILY_POLICY[family].authoritative_confirmation,
        notes: FAMILY_POLICY[family].notes,
      },
    ]),
  ) as Record<HotTopicFamily, HotTopicFamilyDefinition>,
);

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
    FAMILY_POLICY[family].patterns.some((pattern) => pattern.test(text)),
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
