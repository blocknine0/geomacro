import type {
  GeomacroRiskObject,
  RiskDriver,
} from "./risk-object-contract";

import type {
  RiskGateCounterfactual,
  RiskGateRecommendedAction,
} from "./risk-gate-explainability";

export const RISK_GATE_SCHEMA_VERSION =
  "risk-gate-1.0" as const;

export type ProgressiveRiskGateTier =
  | "BASIC_0_10"
  | "STANDARD_0_15"
  | "COMPLEX_0_25";

export type RiskGateTierActivationMatrix = {
  basic: { active: boolean; status: "ACTIVE" };
  standard: {
    active: boolean;
    status: "ACTIVE" | "PENDING";
    corroboration_sources_count: number;
    missing?: string[];
  };
  complex: {
    active: boolean;
    status: "ACTIVE" | "LOCKED";
    signed_gro_ready: boolean;
    seven_day_rollup_ready: boolean;
    missing?: string[];
  };
};

export type SignedProgressiveRiskGateEnvelope = {
  ok: true;
  schema: "geomacro.progressive-risk-gate-decision.v1";
  request_hash: string;
  tier: ProgressiveRiskGateTier;
  tier_activation_matrix: RiskGateTierActivationMatrix;
  price_per_call_usd: 0.10 | 0.15 | 0.25;
  risk_gate: RiskGateResponse;
  context: {
    subject: RiskGateRequest["subject"];
    source: string;
    verified_signed_gro: boolean;
    commercial_eligible: boolean;
    payment_authorized: false;
    risk_metric_semantics: string;
    observation_count: number;
    latest_observation_clock: string | null;
  };
  execution_authorized: false;
  decision_signed_payload: Record<string,unknown>;
  decision_signature_scheme: "Ed25519";
  decision_signature_key_id: string;
  decision_signature_scope: "geomacro.progressive-risk-gate-decision.v1";
  decision_payload_sha256: string;
  decision_signature_b64: string;
};

export type RiskGateDecision =
  | "CONTINUE"
  | "REDUCE_LIMIT"
  | "REQUIRE_APPROVAL"
  | "PAUSE";

export type RiskGatePolicy = {
  policy_id: string;
  policy_version: string;
  continue_max_score: number;
  reduce_limit_max_score: number;
  require_approval_max_score: number;
  minimum_confidence_for_auto_continue:
    number;
  require_commercial_verification_for_continue:
    boolean;
  hard_stop_driver_contributions?:
    Partial<
      Record<
        RiskDriver,
        number
      >
    >;
  max_positive_delta_for_auto_continue?:
    number;
};

export type RiskGateRequest = {
  request_id: string;
  subject: {
    type:
      | "country"
      | "corridor";
    id: string;
  };
  action_context?: {
    action_type?: string;
    amount?: number;
    currency?: string;
    destination?: string;
    metadata?: Record<
      string,
      unknown
    >;
  };
  policy:
    RiskGatePolicy;
};

export type RiskGateReasonCode =
  | "risk_score_continue"
  | "risk_score_reduce_limit"
  | "risk_score_require_approval"
  | "risk_score_pause"
  | "confidence_below_auto_continue_threshold"
  | "commercial_verification_required"
  | "positive_delta_requires_review"
  | "hard_stop_driver_triggered"
  | "risk_object_stale"
  | "risk_object_incomplete"
  | "risk_object_expired"
  | "risk_object_unverifiable"
  | "intraday_material_flash_override"
  | "flash_check_unavailable"
  | "discovery_only_provisional"
  | "no_current_evidence";

export type RiskGateResponse = {
  schema_version:
    typeof RISK_GATE_SCHEMA_VERSION;
  request_id: string;
  decision:
    RiskGateDecision;
  /**
   * Compatibility semantic label for the advisory Risk Gate result.
   *
   * `ALLOW` means only that the supplied Risk Gate policy profile produced no
   * configured escalation. It is never transaction permission, customer-side
   * policy enforcement, compliance clearance or execution authorization.
   * Consumers must treat `execution_authorized=false` as the authoritative
   * execution boundary for every current Risk Gate response.
   *
   * See docs/RISK_GATE_ADVISORY_ACTIONS.md.
   */
  recommended_action:
    RiskGateRecommendedAction;
  reason_codes:
    RiskGateReasonCode[];
  counterfactual:
    RiskGateCounterfactual;
  subject:
    GeomacroRiskObject["subject"];
  risk: {
    object_id: string;
    score: number;
    label:
      GeomacroRiskObject["risk"]["label"];
    previous_score:
      number | null;
    delta:
      number | null;
    confidence:
      number;
    verification_status:
      GeomacroRiskObject["verification"]["status"];
    commercial_eligibility_status:
      GeomacroRiskObject[
        "commercial_eligibility"
      ]["status"];
    generated_at: string;
    expires_at: string;
    methodology_version:
      string;
  };
  top_drivers: Array<{
    driver: RiskDriver;
    score_contribution: number;
    delta_contribution:
      number | null;
  }>;
  policy: {
    policy_id: string;
    policy_version: string;
  };
  primary_driver: string;
  affected_domain: "geopolitics" | "macro_fx" | "critical_minerals";
  severity_score: number;
  intraday_override?: boolean;
  flash_check_available?: boolean;
  suggested_mitigation: {
    exposure_cap_ratio: number;
    settlement_delay_hours: number;
  };
  tier_activation_matrix?: RiskGateTierActivationMatrix;
  risk_metric_semantics?: "OBSERVATION_DENSITY_PROXY" | "CORROBORATED_OBSERVATION_PROXY" | "NO_DATA_POLICY_SENTINEL";
  observation_count?: number;
  corroboration_sources_count?: number;
  execution_authorized: false;
};
