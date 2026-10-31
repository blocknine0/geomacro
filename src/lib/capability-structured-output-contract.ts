import {
  GEOMACRO_CAPABILITY_PRICES,
  resolveGeomacroCapabilityPrice,
  type PricedCapability,
} from "./capability-pricing-catalog";

/**
 * Founder-approved commercial deliverables: exactly the 8 capabilities and
 * 14 variants in geomacro.capability-usdc.v2. The paths below describe the
 * module shape of a PREPARED, PROOF-QUALIFIED customer response, not a promise
 * that a module is available, a separate product engine, or raw-source access.
 *
 * Do not weaken schema, evidence, licensing, x402 or signed-GRO gates to meet
 * a catalogue description. Conditional items never become fabricated values.
 */
export const GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION =
  "geomacro.capability-structured-output.v1" as const;
export const GEOMACRO_STRUCTURED_ONLY_LICENSE_ID =
  "geomacro.structured-intelligence-commercial-license.v1" as const;

type VariantSpec=Readonly<{
  subject_scope:"country"|"directional_corridor"|"country_or_global"|"query_scope"|"country_or_corridor";
  response_kind:"adaptive_intelligence"|"signed_risk_object"|"risk_gate_evaluation";
  customer_receives:readonly string[];
  only_when_verified:readonly string[];
  description:string;
  prerequisites:readonly string[];
}>;
const digest=[
  "structural[*].subject",
  "structural[*].intelligence",
  "structural[*].evidence_summary.available_dimensions",
  "structural[*].evidence_summary.latest_observed_at",
] as const;
const answer=[
  "answer.status","answer.headline","answer.what_changed","answer.why_it_matters",
] as const;
const core=[
  "current_state[*].subject",
  "current_state[*].state_version",
  "current_state[*].live.checked_at",
] as const;
const signed=[
  "signed_risk_objects[*].subject",
  "signed_risk_objects[*].object.risk_object_id",
  "signed_risk_objects[*].object.schema_version",
  "signed_risk_objects[*].object.risk",
  "signed_risk_objects[*].object.confidence",
  "signed_risk_objects[*].object.attribution",
  "signed_risk_objects[*].object.verification",
  "signed_risk_objects[*].object.methodology_version",
  "signed_risk_objects[*].object.generated_at",
  "signed_risk_objects[*].object.expires_at",
  "signed_risk_objects[*].object.integrity",
] as const;
const marketWatch=[
  "decision_intelligence[*].market_watch.schema_version",
  "decision_intelligence[*].market_watch.status",
  "decision_intelligence[*].market_watch.items[*].reference_instruments",
  "decision_intelligence[*].market_watch.items[*].transmission_channel",
  "decision_intelligence[*].market_watch.items[*].scenario_if_disruption_intensifies",
  "decision_intelligence[*].market_watch.items[*].scenario_if_pressure_eases",
  "decision_intelligence[*].market_watch.trader_checklist",
  "decision_intelligence[*].market_watch.monitoring",
  "decision_intelligence[*].market_watch.limitations",
] as const;
const preconditions=[
  "EXACT_REQUEST_AND_VARIANT_ELIGIBLE",
  "LAWFUL_SOURCE_USE_AND_ORIGINAL_FRESHNESS_VERIFIED",
  "ALL_REQUIRED_MODULES_PREPARED_AND_HASH_BOUND",
  "CANONICAL_X402_SETTLEMENT_AND_IDEMPOTENT_DELIVERY",
] as const;

// New paid quotes always include this suite (enforced by the pre-quote
// assembler). Historical frozen settlements can still replay unchanged.
export const GEOMACRO_VARIANT_STRUCTURED_OUTPUTS={
  gri_read:{
    verified_cached:{
      subject_scope:"country_or_global",response_kind:"adaptive_intelligence",
      customer_receives:["gri_context.scope","gri_context.snapshot_id","gri_context.as_of",
        "gri_context.score","gri_context.coverage","gri_context.methodology_version",
        "gri_context.verification_status","gri_context.proof_hash","as_of","methodology","delivered_product_hash"],
      only_when_verified:["gri_context.proof_version","gri_context.verification_status",
        "gri_context.coverage"],
      description:"Cached genuine verified GRI v1.2 state, index scope, freshness and methodology; no change attribution purchased.",
      prerequisites:["CURRENT_SIGNED_GRI_V1_2_AND_EXACT_READBACK"],
    },
    verified_change_attribution:{
      subject_scope:"country_or_global",response_kind:"adaptive_intelligence",
      customer_receives:["gri_context.scope","gri_context.snapshot_id","gri_context.as_of",
        "gri_context.score","gri_context.previous_score",
        "gri_context.coverage","gri_context.change_attribution",
        "gri_context.verification_status","gri_context.proof_hash",
        "gri_context.methodology_version","as_of","methodology","delivered_product_hash"],
      only_when_verified:["change_intelligence[*].previous_verified_state",
        "change_intelligence[*].drivers"],
      description:"Verified current and prior GRI snapshot scores plus source-qualified index change attribution; do not substitute unrelated country-GRO deltas.",
      prerequisites:["CURRENT_SIGNED_GRI_V1_2_AND_EXACT_READBACK","SIGNED_PREVIOUS_STATE_AND_CHANGE_ATTRIBUTION_PROVEN"],
    },
  },
  structural_country_digest:{
    standard:{
      subject_scope:"country",response_kind:"adaptive_intelligence",
      customer_receives:[...digest,"as_of","methodology","limitations","delivered_product_hash"],
      only_when_verified:[...marketWatch,"structural[*].evidence_summary.observation_count"],
      description:"One ISO3 country's compact governed structural dimensions, derived metrics, observation coverage and source-native date; not a current risk score.",
      prerequisites:["ONE_COUNTRY_STRUCTURAL_MODULE_VERIFIED"],
    },
  },
  structural_corridor_digest:{
    standard:{
      subject_scope:"directional_corridor",response_kind:"adaptive_intelligence",
      customer_receives:[...digest,"structural[*].serving.composition_method","as_of","methodology",
        "limitations","delivered_product_hash"],
      only_when_verified:[...marketWatch,"structural[*].serving.route_modeling_status"],
      description:"One ordered origin→destination corridor's verified structural relationship and direct/composed evidence status; never invents physical routing.",
      prerequisites:["DIRECTIONAL_CORRIDOR_EVIDENCE_AND_COMPOSITION_VERIFIED"],
    },
  },
  structural_country_profile:{
    standard:{
      subject_scope:"country",response_kind:"adaptive_intelligence",
      customer_receives:[...digest,"structural[*].serving",
        "current_state[*].structural","as_of","methodology","limitations","delivered_product_hash"],
      only_when_verified:[...marketWatch,"current_state[*].historical_context",
        "current_state[*].developments"],
      description:"One country's fuller cross-dimension structural profile, methodology, coverage, source-native recency and bounded existing context; no forced signed GRO.",
      prerequisites:["ONE_COUNTRY_MULTIDIMENSION_STRUCTURAL_PROFILE_VERIFIED"],
    },
  },
  structural_corridor_profile:{
    standard:{
      subject_scope:"directional_corridor",response_kind:"adaptive_intelligence",
      customer_receives:[...digest,"structural[*].serving",
        "current_state[*].subject","as_of","methodology","limitations","delivered_product_hash"],
      only_when_verified:[...marketWatch,"current_state[*].historical_context",
        "current_state[*].developments","change_intelligence[*].corridor_effects"],
      description:"Directional corridor profile with qualified cross-border dimensions, composition method, bounded existing context and explicit evidence gaps.",
      prerequisites:["DIRECTIONAL_CORRIDOR_MULTIDIMENSION_PROFILE_VERIFIED"],
    },
  },
  intelligence_query:{
    focused:{
      subject_scope:"query_scope",response_kind:"adaptive_intelligence",
      customer_receives:[...answer,...core,"query_plan_hash","as_of","limitations","delivered_product_hash"],
      only_when_verified:[...marketWatch,"current_state[*].risk","current_state[*].live",
        "structural[*].intelligence"],
      description:"One focused subject/topic: direct derived answer, versioned governed state and freshness; only actually qualified requested modules.",
      prerequisites:["ONE_SUBJECT_ONE_TOPIC_FOCUSED_PLAN_VERIFIED"],
    },
    standard:{
      subject_scope:"query_scope",response_kind:"adaptive_intelligence",
      customer_receives:[...answer,...core,"analysis","query_plan_hash","as_of",
        "methodology","limitations","delivered_product_hash"],
      only_when_verified:[...marketWatch,"structural[*].intelligence",
        "current_state[*].developments","change_intelligence[*].drivers"],
      description:"One subject with up to three approved topics: synthesized derived answer, state, coverage, modules and material developments when independently verified.",
      prerequisites:["STANDARD_PLAN_AND_REQUIRED_MODULES_VERIFIED"],
    },
    complex_multi_source:{
      subject_scope:"query_scope",response_kind:"adaptive_intelligence",
      customer_receives:[...answer,...core,"analysis","question_interpretation",
        "query_plan_hash","as_of","methodology","limitations","delivered_product_hash"],
      only_when_verified:[...marketWatch,"current_state[*].developments",
        "change_intelligence[*].cross_domain_effects",
        "structural[*].intelligence","analysis"],
      description:"Verified multi-topic/multi-subject or cross-domain derived synthesis, comparable versioned states and uncertainty; does NOT bundle a separately priced Risk Gate.",
      prerequisites:["COMPLEX_PLAN_MULTI_SOURCE_EVIDENCE_AND_ALL_REQUIRED_MODULES_VERIFIED"],
    },
  },
  signed_risk_object:{
    existing_valid_signed:{
      subject_scope:"country_or_corridor",response_kind:"signed_risk_object",
      customer_receives:[...signed],
      only_when_verified:[...marketWatch,"signed_risk_objects[*].object.risk.previous_score",
        "signed_risk_objects[*].object.risk.delta"],
      description:"Previously issued, still-valid signed country/corridor GRO attestation with risk, confidence, source-free attribution, expiry and integrity metadata; exact signature verification remains a separate proof gate.",
      prerequisites:["EXISTING_VERIFIED_UNEXPIRED_SIGNED_GRO"],
    },
    newly_qualified_signed:{
      subject_scope:"country_or_corridor",response_kind:"signed_risk_object",
      customer_receives:[...signed],
      only_when_verified:[...marketWatch,"signed_risk_objects[*].object.risk.previous_score",
        "signed_risk_objects[*].object.risk.delta"],
      description:"Newly qualified signed GRO attestation with canonical risk/integrity metadata; genuine new evidence, authorized signature and exact readback must be proved separately.",
      prerequisites:["NEWLY_QUALIFIED_CURRENT_SIGNED_GRO_AND_READBACK"],
    },
  },
  risk_gate_bundle:{
    existing_proof_preflight:{
      subject_scope:"country_or_corridor",response_kind:"risk_gate_evaluation",
      customer_receives:["risk_gate[*].subject","risk_gate[*].result",
        "signed_risk_objects[*].object.integrity",
  // Available in all NEW signed deliveries; not added to historical receipt
  // mandatory fields so old already-settled frozen JSON replays byte-identically.
"methodology","limitations","delivered_product_hash"],
      only_when_verified:["signed_risk_objects[*].object.risk"],
      description:"Decision-readiness/preflight for one qualified country/corridor using an existing valid signed proof; no transaction execution.",
      prerequisites:["EXISTING_SIGNED_GRO_AND_POLICY_PREFLIGHT_VERIFIED"],
    },
    standard:{
      subject_scope:"country_or_corridor",response_kind:"risk_gate_evaluation",
      customer_receives:["risk_gate[*].subject","risk_gate[*].result",
        ...signed,"methodology","limitations","delivered_product_hash"],
      only_when_verified:["change_intelligence[*].drivers"],
      description:"One governed risk policy evaluation plus its verified signed GRO, disposition and reasons; signed object included, never a second GRO fee.",
      prerequisites:["SIGNED_GRO_AND_STANDARD_POLICY_EVALUATION_VERIFIED"],
    },
    complex_multi_source:{
      subject_scope:"country_or_corridor",response_kind:"risk_gate_evaluation",
      customer_receives:["risk_gate[*].subject","risk_gate[*].result",
        ...signed,"methodology","limitations","delivered_product_hash"],
      only_when_verified:["structural[*].intelligence",
        "change_intelligence[*].drivers",
        "change_intelligence[*].cross_domain_effects"],
      description:"Deeper multi-source policy evaluation and supporting signed GRO with applicable drivers/qualified cross-domain evidence; never executes payments.",
      prerequisites:["SIGNED_GRO_AND_COMPLEX_MULTISOURCE_POLICY_EVALUATION_VERIFIED"],
    },
  },
} as const satisfies Record<PricedCapability,Record<string,VariantSpec>>;

export function geomacroPricedStructuredOutput(capability:string,variant:string){
  const price=resolveGeomacroCapabilityPrice(capability,variant);
  const byCapability=GEOMACRO_VARIANT_STRUCTURED_OUTPUTS[price.capability] as
    Record<string,VariantSpec>;
  if(!Object.hasOwn(byCapability,price.variant))
    throw Error("CAPABILITY_OUTPUT_VARIANT_NOT_DEFINED");
  const spec=byCapability[price.variant];
  return Object.freeze({
    schema:GEOMACRO_STRUCTURED_OUTPUT_CONTRACT_VERSION,
    capability:price.capability,
    variant:price.variant,
    amount_usdc:price.amount_usdc,
    subject_scope:spec.subject_scope,
    response_kind:spec.response_kind,
    customer_receives:[...spec.customer_receives],
    only_when_verified:[...spec.only_when_verified],
    description:spec.description,
    extra_preconditions:[...spec.prerequisites],
    common_preconditions:[...preconditions],
    license_id:GEOMACRO_STRUCTURED_ONLY_LICENSE_ID,
    customer_data_policy:"DERIVED_STRUCTURED_OUTPUT_ONLY" as const,
    raw_source_payload:false as const,
    upstream_article_text:false as const,
    source_publisher_urls:false as const,
    raw_database_export:false as const,
    unverified_score_or_change:false as const,
    execution_authorized:false as const,
    included_signed_gro_fee:price.included_signed_object_charge,
    // Catalog and field specification never authorize issuing a 402 or
    // charging an x402 customer when current governed proof is absent.
    customer_delivery_status:"CONTRACT_ONLY_REQUIRES_LIVE_PROOF" as const,
    charge_authorized_by_catalog:false as const,
  });
}

export function geomacroStructuredOutputCatalog(){
  const capabilities=Object.entries(GEOMACRO_CAPABILITY_PRICES) as
    [PricedCapability,Record<string,string>][];
  for(const [capability,variants] of capabilities){
    const specs=GEOMACRO_VARIANT_STRUCTURED_OUTPUTS[capability] as
      Record<string,VariantSpec>;
    const names=Object.keys(variants);
    if(names.length!==Object.keys(specs).length ||
       names.some(name=>!Object.hasOwn(specs,name)))
      throw Error("STRUCTURED_OUTPUT_PRICE_CATALOG_MISMATCH");
  }
  return capabilities.flatMap(([capability,variants])=>
    Object.keys(variants).map(variant=>
      geomacroPricedStructuredOutput(capability,variant)));
}

/** Active public structured-output catalog excludes retired GRI sale variants. */
export function publicGeomacroStructuredOutputCatalog(){
  return geomacroStructuredOutputCatalog().filter(row=>row.capability!=="gri_read");
}
