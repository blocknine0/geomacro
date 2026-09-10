import {
  GEOMACRO_ACCESS_TIERS,
  GEOMACRO_CREDIT_CONTRACT_VERSION,
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "./commercial-access-contract";

export const STRUCTURED_DATA_REGISTRY_VERSION =
  "structured-entitlements-v1.1.0" as const;

export type StructuredDataTierId = keyof typeof GEOMACRO_ACCESS_TIERS;
export type StructuredSubjectType = "country" | "corridor" | "global" | "query";
export type StructuredHistoryMode = "none" | "bounded_history" | "contracted_history";
export type StructuredExportMode = "none" | "agreed" | "controlled_api" | "contracted";
export type StructuredAccessSurface =
  | "public_web"
  | "free_api"
  | "paid_dashboard"
  | "commercial_api"
  | "agent_payment"
  | "institutional_integration";

export type StructuredProductPolicy = {
  capability: GeomacroCreditCapability;
  credit_cost: number;
  subject_types: readonly StructuredSubjectType[];
  machine_readable: boolean;
  signed_output: boolean;
  risk_gate_output: boolean;
  source_identity_disclosed: false;
  source_url_disclosed: false;
  execution_authorized: false;
  raw_data_included: false;
  private_warehouse_access: false;
  structural_data_is_gri_v1_2_input: false;
};

const product = (
  capability: GeomacroCreditCapability,
  subject_types: readonly StructuredSubjectType[],
  signed_output = false,
  risk_gate_output = false,
): StructuredProductPolicy => ({
  capability,
  credit_cost: GEOMACRO_CREDIT_COSTS[capability],
  subject_types,
  machine_readable: true,
  signed_output,
  risk_gate_output,
  source_identity_disclosed: false,
  source_url_disclosed: false,
  execution_authorized: false,
  raw_data_included: false,
  private_warehouse_access: false,
  structural_data_is_gri_v1_2_input: false,
});

export const STRUCTURED_PRODUCT_REGISTRY: Record<
  GeomacroCreditCapability,
  StructuredProductPolicy
> = {
  intelligence_query: product("intelligence_query", ["query", "country", "corridor", "global"]),
  gri_read: product("gri_read", ["country", "global"]),
  structural_country_digest: product("structural_country_digest", ["country"]),
  structural_corridor_digest: product("structural_corridor_digest", ["corridor"]),
  structural_country_profile: product("structural_country_profile", ["country"]),
  structural_corridor_profile: product("structural_corridor_profile", ["corridor"]),
  signed_risk_object: product("signed_risk_object", ["country", "corridor"], true, false),
  risk_gate_bundle: product("risk_gate_bundle", ["country", "corridor"], true, true),
};

export type StructuredTierPolicy = {
  tier: StructuredDataTierId;
  access_surfaces: readonly StructuredAccessSurface[];
  included_capabilities: readonly GeomacroCreditCapability[];
  api_access: boolean;
  history_mode: StructuredHistoryMode;
  max_subjects_per_request: number;
  max_structural_observations: number;
  max_evidence_references: number;
  export_mode: StructuredExportMode;
  signed_risk_objects: boolean;
  risk_gate: boolean;
  recharge_after_included_credits: boolean;
  share_metadata_enabled: boolean;
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
    access_surfaces: ["public_web", "free_api"],
    included_capabilities: [
      "intelligence_query",
      "gri_read",
      "structural_country_digest",
      "structural_corridor_digest",
    ],
    api_access: true,
    history_mode: "none",
    max_subjects_per_request: 1,
    max_structural_observations: 3,
    max_evidence_references: 0,
    export_mode: "none",
    signed_risk_objects: false,
    risk_gate: false,
    recharge_after_included_credits: true,
    share_metadata_enabled: true,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
  analyst_pilot: {
    tier: "analyst_pilot",
    access_surfaces: ["paid_dashboard"],
    included_capabilities: [
      "intelligence_query",
      "gri_read",
      "structural_country_digest",
      "structural_corridor_digest",
      "structural_country_profile",
      "structural_corridor_profile",
    ],
    api_access: false,
    history_mode: "bounded_history",
    max_subjects_per_request: 2,
    max_structural_observations: 12,
    max_evidence_references: 20,
    export_mode: "agreed",
    signed_risk_objects: false,
    risk_gate: false,
    recharge_after_included_credits: false,
    share_metadata_enabled: false,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
  api_pilot: {
    tier: "api_pilot",
    access_surfaces: ["paid_dashboard", "commercial_api", "agent_payment"],
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
    api_access: true,
    history_mode: "bounded_history",
    max_subjects_per_request: 2,
    max_structural_observations: 12,
    max_evidence_references: 30,
    export_mode: "controlled_api",
    signed_risk_objects: true,
    risk_gate: true,
    recharge_after_included_credits: true,
    share_metadata_enabled: false,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
  institutional: {
    tier: "institutional",
    access_surfaces: [
      "paid_dashboard",
      "commercial_api",
      "agent_payment",
      "institutional_integration",
    ],
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
    api_access: true,
    history_mode: "contracted_history",
    max_subjects_per_request: 10,
    max_structural_observations: 50,
    max_evidence_references: 100,
    export_mode: "contracted",
    signed_risk_objects: true,
    risk_gate: true,
    recharge_after_included_credits: true,
    share_metadata_enabled: false,
    execution_authorized: false,
    raw_data_access: false,
    private_warehouse_access: false,
  },
};

export const COMMERCIAL_OFFER_REGISTRY = {
  free_public_web: {
    offer_id: "free_public_web",
    tier: "free",
    payment_required: false,
    entitlement_kind: "public_web",
  },
  free_api_30d: {
    offer_id: "free_api_30d",
    tier: "free",
    payment_required: false,
    entitlement_kind: "allowance",
  },
  analyst_pilot_30d: {
    offer_id: "analyst_pilot_30d",
    tier: "analyst_pilot",
    payment_required: true,
    entitlement_kind: "subscription",
  },
  api_risk_gate_pilot_30d: {
    offer_id: "api_risk_gate_pilot_30d",
    tier: "api_pilot",
    payment_required: true,
    entitlement_kind: "subscription",
  },
  institutional_contract: {
    offer_id: "institutional_contract",
    tier: "institutional",
    payment_required: true,
    entitlement_kind: "contract",
  },
  machine_risk_preflight: {
    offer_id: "machine_risk_preflight",
    tier: "api_pilot",
    payment_required: true,
    entitlement_kind: "one_shot",
    one_shot_capability: "risk_gate_bundle",
  },
} as const;

export type CommercialOfferId = keyof typeof COMMERCIAL_OFFER_REGISTRY;

export function tierAllowsStructuredCapability(
  tier: StructuredDataTierId,
  capability: GeomacroCreditCapability,
): boolean {
  const policy = STRUCTURED_TIER_REGISTRY[tier];
  return policy.api_access && policy.included_capabilities.includes(capability);
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
    entitlement_kind: offer.entitlement_kind,
    one_shot_capability:
      "one_shot_capability" in offer ? offer.one_shot_capability : null,
  } as const;
}
