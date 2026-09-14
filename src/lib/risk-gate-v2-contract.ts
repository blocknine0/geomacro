import type { RiskGateDecision } from "./risk-gate-contract";
import type { RiskGateRecommendedAction } from "./risk-gate-explainability";
import type { RiskDirection } from "./risk-object-contract";
import type {
  RiskGateV2ActionType,
  RiskGateV2CoverageState,
  RiskGateV2DisplayLabel,
  RiskGateV2Driver,
  RiskGateV2Module,
  RiskGateV2SubjectType,
} from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_SCHEMA_VERSION = "risk-gate-2.0" as const;
export const RISK_GATE_V2_REQUEST_SCHEMA_VERSION = "risk-gate-request-2.0" as const;

export type RiskGateV2Subject = {
  type: RiskGateV2SubjectType;
  id: string;
  name?: string | null;
};

export type RiskGateV2Exposure = {
  type: RiskGateV2SubjectType | "currency";
  id: string;
  role:
    | "origin"
    | "destination"
    | "settlement"
    | "counterparty"
    | "intermediary"
    | "route"
    | "sector"
    | "commodity"
    | "market"
    | "portfolio"
    | "other";
  weight_hint?: number;
  metadata?: Record<string, unknown>;
};

export type RiskGateV2ActionContext = {
  action_type: RiskGateV2ActionType;
  amount?: number;
  currency?: string;
  origin_country_iso3?: string;
  destination_country_iso3?: string;
  settlement_currency?: string;
  sector?: string;
  counterparty_country_iso3?: string;
  intermediary_country_iso3?: string[];
  route_subject_ids?: string[];
  commodity_subject_ids?: string[];
  time_horizon?:
    | "immediate"
    | "intraday"
    | "days"
    | "weeks"
    | "months"
    | "long_term";
  urgency?: "normal" | "elevated" | "urgent";
  metadata?: Record<string, unknown>;
};

export type RiskGateV2PolicyReference = {
  policy_id: string;
  policy_version: string;
};

export type RiskGateV2Request = {
  schema_version: typeof RISK_GATE_V2_REQUEST_SCHEMA_VERSION;
  request_id: string;
  primary_subject: RiskGateV2Subject;
  exposures?: RiskGateV2Exposure[];
  action_context: RiskGateV2ActionContext;
  policy: RiskGateV2PolicyReference;
};

export type RiskGateV2CommercialEligibilityStatus =
  | "VERIFIED"
  | "UNVERIFIED"
  | "INELIGIBLE";

export type RiskGateV2ModuleResult = {
  module: RiskGateV2Module;
  score: number;
  previous_score: number | null;
  delta: number | null;
  confidence: number;
  coverage: RiskGateV2CoverageState;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  contribution: number;
  generated_at: string;
  expires_at: string;
  methodology_version: string;
};

export type RiskGateV2DriverResult = {
  module: RiskGateV2Module;
  driver: RiskGateV2Driver;
  score_contribution: number;
  delta_contribution: number | null;
  confidence: number;
};

export type RiskGateV2ReasonCode =
  | "risk_score_continue"
  | "risk_score_reduce_limit"
  | "risk_score_require_approval"
  | "risk_score_pause"
  | "active_module_missing"
  | "active_module_expired"
  | "coverage_below_auto_continue_threshold"
  | "coverage_insufficient"
  | "confidence_below_auto_continue_threshold"
  | "commercial_verification_required"
  | "commercially_ineligible_module"
  | "positive_delta_requires_review"
  | "hard_stop_module_triggered"
  | "hard_stop_driver_triggered";

export type RiskGateV2ThresholdTrigger = {
  code: string;
  severity: "review" | "hard_stop";
  module?: RiskGateV2Module;
  driver?: RiskGateV2Driver;
  current_value: number | string | null;
  threshold_value: number | string | null;
};

export type RiskGateV2WatchItem = {
  module: RiskGateV2Module;
  reason: string;
};

export type RiskGateV2Alternative = {
  type: "REROUTE" | "REDUCE_EXPOSURE" | "DEFER" | "MANUAL_REVIEW";
  label: string;
  rationale: string;
  subject?: RiskGateV2Subject;
};

export type RiskGateV2Response = {
  schema_version: typeof RISK_GATE_V2_SCHEMA_VERSION;
  request_id: string;
  decision: RiskGateDecision;
  display_label: RiskGateV2DisplayLabel;
  recommended_action: RiskGateRecommendedAction;
  execution_authorized: false;
  subject: RiskGateV2Subject;
  reason_codes: RiskGateV2ReasonCode[];
  action_risk: {
    /**
     * Null means the configured active-module set could not be evaluated
     * without inventing precision from missing/expired required inputs.
     */
    score: number | null;
    previous_score: number | null;
    delta: number | null;
    confidence: number;
    coverage: RiskGateV2CoverageState;
    direction: RiskDirection;
  };
  active_modules: RiskGateV2ModuleResult[];
  missing_modules: RiskGateV2Module[];
  top_drivers: RiskGateV2DriverResult[];
  thresholds_triggered: RiskGateV2ThresholdTrigger[];
  watchlist: RiskGateV2WatchItem[];
  alternatives: RiskGateV2Alternative[];
  integrity: {
    methodology_version: string;
    calculation_hash: string;
    risk_object_ids: string[];
  };
  policy: RiskGateV2PolicyReference;
};

export function riskGateV2DisplayLabel(
  decision: RiskGateDecision,
): RiskGateV2DisplayLabel {
  if (decision === "CONTINUE") return "CLEAR";
  if (decision === "REDUCE_LIMIT") return "CAUTION";
  if (decision === "REQUIRE_APPROVAL") return "REVIEW";
  return "HOLD";
}
