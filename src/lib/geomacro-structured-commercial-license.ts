/**
 * Public, customer-facing terms for GEOMACRO-OWNED structured intelligence.
 * This does not license third-party originals, eliminate lawful attribution,
 * prove buyer assent or authorize x402 funds when a product is unavailable.
 */
export const GEOMACRO_STRUCTURED_LICENSE_ID=
  "geomacro.structured-intelligence-commercial-license.v1" as const;
export const GEOMACRO_STRUCTURED_LICENSE_PATH=
  "/api/intelligence/capabilities?view=license" as const;
export const GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH=
  GEOMACRO_STRUCTURED_LICENSE_PATH;
export const GEOMACRO_STRUCTURED_LICENSE_EFFECTIVE_AT=
  "2026-10-18" as const;

/** Readable JSON contract published by the existing unlocked API route.
 * No static website or HTML changes are required (Website Lock respected).
 */
export const GEOMACRO_STRUCTURED_LICENSE_TERMS=Object.freeze({
  schema:GEOMACRO_STRUCTURED_LICENSE_ID,
  id:GEOMACRO_STRUCTURED_LICENSE_ID,
  version:"1.0.0",
  effective_at:GEOMACRO_STRUCTURED_LICENSE_EFFECTIVE_AT,
  licensor:"Geomacro",
  licensed_asset:"ONLY_ORIGINAL_DERIVED_EXPRESSION_AND_OUTPUT_RIGHTS_LEGALLY_CONTROLLED_BY_GEOMACRO",
  raw_data_delivery:"NEVER_RAW_UPSTREAM_SOURCE_MATERIAL",
  grant:Object.freeze({
    nature:"nonexclusive_worldwide_nontransferable_limited_commercial_use",
    permitted:Object.freeze([
      "Use eligible contracted Geomacro derived structured output in internal analysis and decision support",
      "Integrate bounded derived findings into authorized applications, dashboards and autonomous agent workflows",
      "Display bounded Geomacro-derived conclusions within contracted reports and products",
    ]),
    conditions:Object.freeze([
      "Valid authenticated or expressly contracted entitlement",
      "Use within the applicable purchase, subscription or written agreement scope",
      "Comply with legally applicable upstream attribution and usage restrictions",
    ]),
    exclusions:Object.freeze([
      "Raw publisher text, source articles, headlines, feeds, HTML, photographs, links, API datasets or source archives",
      "Redistribution or resale of entire Geomacro feeds or bulk access credentials without separate written terms",
      "Sublicensing the Geomacro platform, its signing keys, source code, software or trademarks",
      "Third-party intellectual property or database rights not held by Geomacro",
    ]),
  }),
  legal_boundaries:Object.freeze({
    ownership_of_uncopyrightable_facts_claimed:false,
    upstream_publisher_permission_self_granted:false,
    raw_upstream_delivery_authorized:false,
    raw_upstream_redistribution_authorized:false,
    third_party_rights_transferred:false,
    source_specific_attribution_waived:false,
    requires_lawful_source_use:true,
    required_source_eligibility_remains_fail_closed:true,
    independent_evidence_or_scoring_certified:false,
    current_gri_or_risk_indices_certified:false,
    payment_or_settlement_authorized:false,
    execution_or_investment_decision_authorized:false,
    customer_acceptance_established_by_discovery:false,
    live_product_availability_established_by_discovery:false,
  }),
  product_delivery:"STRUCTURED_GEOMACRO_DERIVED_INTELLIGENCE_ONLY",
  buyer_assent:"Subject to the applicable checkout authorization, accepted API order or separately executed customer agreement; viewing discovery or this license does not imply assent.",
  policy_documents:Object.freeze([
    "docs/COMMERCIAL_DERIVED_OUTPUT_OWNER_LICENSE.md",
    "docs/COMMERCIAL_SOURCE_RIGHTS.md",
    "docs/USER_FACING_DATA_BOUNDARY.md",
  ]),
  permitted_revisions:"Versioned; current policy changes never silently rewrite historical delivery rights.",
  public_license_path:GEOMACRO_STRUCTURED_LICENSE_PATH,
} as const);

export const GEOMACRO_STRUCTURED_LICENSE_DISCOVERY=Object.freeze({
  id:GEOMACRO_STRUCTURED_LICENSE_ID,
  version:"1.0.0",
  licensor:"Geomacro",
  human_readable:GEOMACRO_STRUCTURED_LICENSE_PATH,
  machine_readable:GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH,
  applies_to:"ELIGIBLE_GEOMACRO_ORIGINAL_DERIVED_STRUCTURED_OUTPUT_ONLY",
  permitted_use:"CONTRACTED_INTERNAL_AND_EMBEDDED_APPLICATION_USE",
  excluded:"RAW_UPSTREAM_OR_THIRD_PARTY_MATERIAL_AND_BULK_DATA_RESALE",
  raw_source_material_delivered:false,
  raw_upstream_redistribution_granted:false,
  upstream_source_rights_granted:false,
  existing_attribution_obligations_unchanged:true,
  source_eligibility_still_required:true,
  customer_license_acceptance_implied_by_discovery:false,
  customer_payment_authorized_by_license:false,
  commercial_product_availability_proven_by_license:false,
  execution_authorized:false,
} as const);

/** Safe, discoverable license references on 402 offers and real delivered 200s.
 * They do not change signed product JSON, content hashes or payment readiness.
 */
export const GEOMACRO_STRUCTURED_LICENSE_HEADERS=Object.freeze({
  "X-Geomacro-Output-License":GEOMACRO_STRUCTURED_LICENSE_ID,
  "Link":'<https://geomacro.live'+GEOMACRO_STRUCTURED_LICENSE_PATH+'>; rel="license"',
  "X-Geomacro-Raw-Data-Delivered":"false",
} as const);
