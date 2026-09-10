import {
  GEOMACRO_ACCESS_TIERS,
  GEOMACRO_CREDIT_CONTRACT_VERSION,
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "./commercial-access-contract";

export const STRUCTURED_DATA_REGISTRY_VERSION =
  "structured-entitlements-v1.0.0" as const;

export type StructuredDataTierId = keyof typeof GEOMACRO_ACCESS_TIERS;
export type StructuredSubjectType = "country" | "corridor" | "global" | "query";
export type StructuredHistoryMode = "latest_only" | "bounded_history" | "contracted_history";
export type StructuredExportMode = "none" | "agreed" | "controlled_api" | "contracted";

export type StructuredProductPolicy = {
  capability: GeomacroCreditCapability;
  credit_cost: number;
  subject_types: readonly StructuredSubjectType[];
  machine_readable: boolean;
  signed_output: boolean;
  risk_gate_output: boolean;
  execution_authorized: false;
  raw_data_included: false;
  private_warehouse_access: false;
  structural_data_is_gri_v1_2_input: false;
};

export const STRUCTURED_PRODUCT_REGISTRY: Record<
  GeomacroCreditCapability,
  StructuredProductPolicy
> = {
  intelligence_query: {
    capability: "intelligence_query",
    credit_cost: GEOMACRO_CREDIT_COSTS.intelligence_query,
    subject_types: ["query", "country", "corridor", "global"],
    machine_readable: true,
    signed_output: false,
    risk_gate_output: false,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
  gri_read: {
    capability: "gri_read",
    credit_cost: GEOMACRO_CREDIT_COSTS.gri_read,
    subject_types: ["country", "global"],
    machine_readable: true,
    signed_output: false,
    risk_gate_output: false,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
  structural_country_digest: {
    capability: "structural_country_digest",
    credit_cost: GEOMACRO_CREDIT_COSTS.structural_country_digest,
    subject_types: ["country"],
    machine_readable: true,
    signed_output: false,
    risk_gate_output: false,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
  structural_corridor_digest: {
    capability: "structural_corridor_digest",
    credit_cost: GEOMACRO_CREDIT_COSTS.structural_corridor_digest,
    subject_types: ["corridor"],
    machine_readable: true,
    signed_output: false,
    risk_gate_output: false,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
  structural_country_profile: {
    capability: "structural_country_profile",
    credit_cost: GEOMACRO_CREDIT_COSTS.structural_country_profile,
    subject_types: ["country"],
    machine_readable: true,
    signed_output: false,
    risk_gate_output: false,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
  structural_corridor_profile: {
    capability: "structural_corridor_profile",
    credit_cost: GEOMACRO_CREDIT_COSTS.structural_corridor_profile,
    subject_types: ["corridor"],
    machine_readable: true,
    signed_output: false,
    risk_gate_output: false,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
  signed_risk_object: {
    capability: "signed_risk_object",
    credit_cost: GEOMACRO_CREDIT_COSTS.signed_risk_object,
    subject_types: ["country", "corridor"],
    machine_readable: true,
    signed_output: true,
    risk_gate_output: false,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
  risk_gate_bundle: {
    capability: "risk_gate_bundle",
    credit_cost: GEOMACRO_CREDIT_COSTS.risk_gate_bundle,
    subject_types: ["country", "corridor"],
    machine_readable: true,
    signed_output: true,
    risk_gate_output: true,
    execution_authorized: false,
    raw_data_included: false,
    private_warehouse_access: false,
    structural_data_is_gri_v1_2_input: false,
  },
};

export type StructuredTierPolicy = {
  tier: StructuredDataTierId;
  included_capabilities: readonly GeomacroCreditCapability[];
  history_mode: StructuredHistoryMode;
  max_subjects_per_request: number;
  max_structural_observations: number;
  max_evidence_references: number;
  export_mode: StructuredExportMode;
  signed_risk_objects: boolean;
  risk_gate: boolean;
  execution_authorized: false;
  raw_data_access: false;
  private_warehouse_access: false;
};

export const STRUCTURED_TIER_REGISTRY: Record<
  StructuredDataTierId,
  StructuredTierPolicy
> = {
  free: {
    tier: "free",
    included_capabilities: [
      "intelligence_query",
      "gri_read",
      "structural_country_digest",
      "structural_corridor_digest",
    ],
    history_mode: "latest_only",
    max_subjects_per_request: 1,
    max_structural_observations: 3,
    max_evidence_references: 5,
    export_mode: "none",
    signed_risk_objects: false,
    risk_gate: false,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
  analyst_pilot: {
    tier: "analyst_pilot",
    included_capabilities: [
      "intelligence_query",
      "gri_read",
      "structural_country_digest",
      "structural_corridor_digest",
      "structural_country_profile",
      "structural_corridor_profile",
    ],
    history_mode: "bounded_history",
    max_subjects_per_request: 2,
    max_structural_observations: 12,
    max_evidence_references: 20,
    export_mode: "agreed",
    signed_risk_objects: false,
    risk_gate: false,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
  api_pilot: {
    tier: "api_pilot",
    included_capabilities: [
      "intelligence_query",
      "gri_read",
      "structural_country_digest",
      "structural_corridor_digest",
      "structural_country_profile",
      "structural_corridor_profile",
      "signed_risk_object",
      "risk_gate_bundle",
    ],
    history_mode: "bounded_history",
    max_subjects_per_request: 2,
    max_structural_observations: 12,
    max_evidence_references: 30,
    export_mode: "controlled_api",
    signed_risk_objects: true,
    risk_gate: true,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
  institutional: {
    tier: "institutional",
    included_capabilities: [
      "intelligence_query",
      "gri_read",
      "structural_country_digest",
      "structural_corridor_digest",
      "structural_country_profile",
      "structural_corridor_profile",
      "signed_risk_object",
      "risk_gate_bundle",
    ],
    history_mode: "contracted_history",
    max_subjects_per_request: 10,
    max_structural_observations: 50,
    max_evidence_references: 100,
    export_mode: "contracted",
    signed_risk_objects: true,
    risk_gate: true,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
};

export const COMMERCIAL_OFFER_REGISTRY = {
  free: {
    offer_id: "free",
    tier: "free",
    payment_required: false,
  },
  analyst_pilot_30d: {
    offer_id: "analyst_pilot_30d",
    tier: "analyst_pilot",
    payment_required: true,
  },
  api_risk_gate_pilot_30d: {
    offer_id: "api_risk_gate_pilot_30d",
    tier: "api_pilot",
    payment_required: true,
  },
  institutional_contract: {
    offer_id: "institutional_contract",
    tier: "institutional",
    payment_required: true,
  },
  machine_risk_preflight: {
    offer_id: "machine_risk_preflight",
    tier: "api_pilot",
    payment_required: true,
    one_shot_capability: "risk_gate_bundle",
  },
} as const;

export type CommercialOfferId = keyof typeof COMMERCIAL_OFFER_REGISTRY;

export function tierAllowsStructuredCapability(
  tier: StructuredDataTierId,
  capability: GeomacroCreditCapability,
): boolean {
  return STRUCTURED_TIER_REGISTRY[tier].included_capabilities.includes(capability);
}

export function structuredDeliveryPolicy(
  tier: StructuredDataTierId,
  capability: GeomacroCreditCapability,
) {
  const tierPolicy = STRUCTURED_TIER_REGISTRY[tier];
  const productPolicy = STRUCTURED_PRODUCT_REGISTRY[capability];

  return {
    registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    credit_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
    allowed: tierAllowsStructuredCapability(tier, capability),
    tier: tierPolicy,
    product: productPolicy,
  } as const;
}

export function offerToCanonicalEntitlement(offerId: CommercialOfferId) {
  const offer = COMMERCIAL_OFFER_REGISTRY[offerId];
  return {
    registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
    offer_id: offer.offer_id,
    tier: offer.tier,
    payment_required: offer.payment_required,
    one_shot_capability:
      "one_shot_capability" in offer ? offer.one_shot_capability : null,
  } as const;
}
