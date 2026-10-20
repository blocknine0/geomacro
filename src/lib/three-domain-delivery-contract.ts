/**
 * Customer-visible source-free delivery promise, shared across human desk,
 * Ask, unified paid query, official agent and private partner integration.
 * This is a DISCOVERY contract, not a current source or paid eligibility claim.
 */
export const GEOMACRO_THREE_DOMAIN_DELIVERY_VERSION =
  "geomacro.three-domain-delivery.v1" as const;

export type GeomacroDomain="geopolitics"|"macro"|"rare_earth";
export type EvidenceKind=
  "native_official_development"|"annual_statistical_reference"|
  "daily_reference_quote"|"official_regulatory_release"|
  "mineral_production_reference"|"corridor_traffic_reference"|
  "maritime_advisory_lead"|"discovery_signal";
type DomainSpec=Readonly<{
  label:string;
  user_receives:readonly string[];
  machine_receives:readonly string[];
  supported_evidence_kinds:readonly EvidenceKind[];
  required_current_product_proof:readonly string[];
  plain_language_limitation:string;
}>;
export const GEOMACRO_THREE_DOMAIN_OUTPUTS={
  geopolitics:{
    label:"Geopolitics",
    user_receives:[
      "What changed and why it matters, without copied source articles",
      "Verified country or regional attribution and affected corridors when known",
      "Original development date, qualified impact, uncertainty and what to watch",
      "Current signed index score only when valid signed index proof exists",
    ],
    machine_receives:[
      "domain","event_id","event_version","country_iso3",
      "corridor_id_when_verified","event_type","change_direction",
      "severity_when_qualified","evidence_count","independent_corrob_count",
      "source_native_published_at","freshness_state","limitations",
      "proof_hash_when_verified",
    ],
    supported_evidence_kinds:[
      "native_official_development","official_regulatory_release",
      "maritime_advisory_lead","corridor_traffic_reference","discovery_signal",
    ],
    required_current_product_proof:[
      "COUNTRY_OR_CORRIDOR_IDENTITY_VERIFIED","PUBLISHER_ORIGINAL_FRESHNESS_VERIFIED",
      "EVENT_TOPIC_QUALIFIED","RIGHTS_FOR_INTENDED_DELIVERY_VERIFIED",
      "SIGNED_PROOF_WHEN_SCORING_REQUESTED",
    ],
    plain_language_limitation:"A transport-readable headline, advisory, earthquake, older transit count or historical score is not a verified current geopolitical risk index.",
  },
  macro:{
    label:"Macro / FX",
    user_receives:[
      "Country-specific official inflation, GDP and policy-release context",
      "FX reference-rate date, pair and quotation convention when available",
      "Observation period separately from the actual release or reference date",
      "What changed and potential economic effects with explicit gaps",
    ],
    machine_receives:[
      "domain","country_iso3","indicator_code_when_verified","period_frequency",
      "observation_period","release_date_when_verified","currency_pair_when_applicable",
      "numeric_value_when_licensed_and_verified","unit_when_verified",
      "rate_reference_not_spot","change_direction_when_supported",
      "freshness_state","limitations","proof_hash_when_verified",
    ],
    supported_evidence_kinds:[
      "annual_statistical_reference","daily_reference_quote",
      "official_regulatory_release","native_official_development","discovery_signal",
    ],
    required_current_product_proof:[
      "EXACT_COUNTRY_INDICATOR_MATCH","NATIVE_OBSERVATION_PERIOD_VERIFIED",
      "CURRENCY_REFERENCE_DISTINCT_FROM_SPOT",
      "RIGHTS_FOR_INTENDED_DELIVERY_VERIFIED","SIGNED_PROOF_WHEN_SCORING_REQUESTED",
    ],
    plain_language_limitation:"Annual CPI/GDP observations are not breaking news; a central-bank daily reference FX quote is not an intraday or guaranteed tradable spot rate.",
  },
  rare_earth:{
    label:"Critical Minerals",
    user_receives:[
      "Mineral-specific mining, refining, export, investment and trade developments",
      "Producing and affected countries, supply-chain stage and corridor where proven",
      "Official production-statistic period separately from a new mine incident",
      "Potential supply implications, limitations and what to watch",
    ],
    machine_receives:[
      "domain","event_id_when_qualified","country_iso3","mineral_id",
      "supply_chain_stage_when_verified","event_type","observation_period_when_statistical",
      "original_release_at_when_verified","corridor_id_when_proven",
      "supply_direction_when_supported","confidence_when_qualified",
      "freshness_state","limitations","proof_hash_when_verified",
    ],
    supported_evidence_kinds:[
      "mineral_production_reference","native_official_development",
      "official_regulatory_release","corridor_traffic_reference",
      "discovery_signal",
    ],
    required_current_product_proof:[
      "MINERAL_AND_COUNTRY_MATCH_VERIFIED","SOURCE_NATIVE_DATE_OR_PERIOD_VERIFIED",
      "PRODUCTION_PERIOD_NOT_INCIDENT_TIME",
      "RIGHTS_FOR_INTENDED_DELIVERY_VERIFIED","SIGNED_PROOF_WHEN_SCORING_REQUESTED",
    ],
    plain_language_limitation:"A national geological survey directory or monthly copper statistic alone does not prove a live mine closure, mineral shortfall, trade embargo or risk score.",
  },
} as const satisfies Record<GeomacroDomain,DomainSpec>;

export type GeomacroEvidenceState=Readonly<{
  domain:GeomacroDomain;
  evidence_kind:EvidenceKind;
  native_period_verified:boolean;
  country_or_corridor_match_verified:boolean;
  topic_or_indicator_match_verified:boolean;
  current_release_qualified:boolean;
  independent_corroboration_verified:boolean;
  intended_commercial_rights_verified:boolean;
  signed_current_product_verified:boolean;
}>;

/** Classification is derived ONLY from explicit verified facts.
 * Never infer acceptance from transport 200, registry presence or source count.
 */
export function assessGeomacroEvidenceDelivery(evidence:GeomacroEvidenceState){
  const domain=GEOMACRO_THREE_DOMAIN_OUTPUTS[evidence.domain];
  const supports=(domain.supported_evidence_kinds as readonly string[])
    .includes(evidence.evidence_kind);
  const referenceOnly=[
    "annual_statistical_reference","daily_reference_quote",
    "mineral_production_reference","corridor_traffic_reference",
  ].includes(evidence.evidence_kind);
  const isLead=evidence.evidence_kind==="discovery_signal"||
    evidence.evidence_kind==="maritime_advisory_lead";
  const sourceQualified=supports&&evidence.native_period_verified&&
    evidence.country_or_corridor_match_verified&&
    evidence.topic_or_indicator_match_verified;
  const currentEvent=sourceQualified&&!referenceOnly&&!isLead&&
    evidence.current_release_qualified&&evidence.independent_corroboration_verified;
  const commercialEligible=currentEvent&&evidence.intended_commercial_rights_verified;
  const signedIndexEligible=commercialEligible&&evidence.signed_current_product_verified;
  return {
    schema:"geomacro.evidence-delivery-decision.v1" as const,
    domain:evidence.domain,
    evidence_kind:evidence.evidence_kind,
    evidence_state:!supports?"UNSUPPORTED_DOMAIN_EVIDENCE" as const:
      !sourceQualified?"SOURCE_OR_IDENTITY_UNVERIFIED" as const:
      referenceOnly?"PERIODIC_REFERENCE_ONLY" as const:
      isLead?"DISCOVERY_LEAD_ONLY" as const:
      currentEvent?"QUALIFIED_CURRENT_DEVELOPMENT" as const:
      "CURRENT_EVENT_NOT_QUALIFIED" as const,
    private_source_research_usable:sourceQualified,
    current_event_verified:currentEvent,
    commercial_derived_delivery_eligible:commercialEligible,
    current_signed_index_eligible:signedIndexEligible,
    score_available:signedIndexEligible,
    charge_authorized:false as const,
    provider_payload_redistribution_allowed:false as const,
  };
}

export function geomacroThreeDomainDeliveryContract(){
  return {
    ok:true as const,
    schema:GEOMACRO_THREE_DOMAIN_DELIVERY_VERSION,
    country_routing_registry_count:195,
    named_corridor_reference_registry_count:58,
    country_or_corridor_registry_is_data_coverage:false as const,
    source_activation_implied:false as const,
    data_delivery_surfaces:{
      human:["Geomacro Finds","Intelligence desk","Ask Geomacro"],
      machine:["POST /api/v1/intelligence/query","Three category endpoints",
        "Official agent","Authorized Predge research delivery"],
    },
    categories:GEOMACRO_THREE_DOMAIN_OUTPUTS,
    shared_event_identity:"ONE_QUALIFIED_EVENT_REUSED_ACROSS_RELEVANT_DOMAINS",
    distinct_observation_period_and_publication_time:true as const,
    source_classification_order:[
      "REGISTERED_REFERENCE","TRANSPORT_READABLE","NATIVE_PERIOD_CONFIRMED",
      "COUNTRY_TOPIC_QUALIFIED","RIGHTS_AND_CORROBORATION_VERIFIED",
      "CURRENT_SIGNED_PRODUCT_VERIFIED",
    ],
    available_features_are_runtime_evidence_dependent:true as const,
    annual_data_is_live_event:false as const,
    derived_structured_only:true as const,
    source_urls_and_original_article_bytes_delivered:false as const,
    all_195_country_domain_cells_verified:false as const,
    all_58_corridors_currently_verified:false as const,
    rights_and_signing_required_before_paid_delivery:true as const,
    pricing_source:"GET /api/v1/pricing",
    quoted_price_or_customer_payment_authorized:false as const,
  };
}
