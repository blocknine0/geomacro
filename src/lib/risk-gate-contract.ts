import type {
  GeomacroRiskObject,
  RiskDriver,
} from "./risk-object-contract";


export const RISK_GATE_SCHEMA_VERSION =
  "risk-gate-1.0" as const;


export type RiskGateDecision =
  | "CONTINUE"
  | "REDUCE_LIMIT"
  | "REQUIRE_APPROVAL"
  | "PAUSE";


export type RiskGatePolicy = {
  policy_id: string;
  policy_version: string;

  /**
   * Country GRO score thresholds.
   */
  continue_max_score: number;
  reduce_limit_max_score: number;
  require_approval_max_score: number;

  /**
   * Optional minimum confidence required before
   * automated CONTINUE is allowed.
   */
  minimum_confidence_for_auto_continue:
    number;

  /**
   * When true, any GRO that is not commercially
   * VERIFIED cannot receive CONTINUE.
   */
  require_commercial_verification_for_continue:
    boolean;

  /**
   * Optional hard-stop drivers.
   *
   * If any current driver contribution is >=
   * its configured threshold, PAUSE.
   */
  hard_stop_driver_contributions?:
    Partial<
      Record<
        RiskDriver,
        number
      >
    >;

  /**
   * Optional maximum acceptable upward delta.
   * If exceeded, REQUIRE_APPROVAL at minimum.
   */
  max_positive_delta_for_auto_continue?:
    number;
};


export type RiskGateRequest = {
  request_id: string;

  subject: {
    type: "country";
    id: string;
  };

  /**
   * Customer-defined action context.
   * This is descriptive only.
   */
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
  | "risk_object_expired"
  | "risk_object_unverifiable";


export type RiskGateResponse = {
  schema_version:
    typeof RISK_GATE_SCHEMA_VERSION;

  request_id: string;

  decision:
    RiskGateDecision;

  reason_codes:
    RiskGateReasonCode[];

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

  /**
   * Critical commercial boundary:
   * this is context/policy output only.
   */
  execution_authorized: false;
};
