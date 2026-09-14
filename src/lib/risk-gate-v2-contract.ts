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
  role: "origin" | "destination" | "settlement" | "counterparty" | "intermediary" | "route" | "sector" | "commodity" | "market" | "portfolio" | "other";
  weight_hint?: number;
  metadata?: Record<string, unknown>;
};

export type RiskGateV2ActionContext = {
  action_type: RiskGateV2ActionType;
  amount?: number;
  currency?: string;
  origin_country_iso3?: string;
  destination_country_iso3?: string;
  sector?: string;
  time_horizon?: "immediate" | "intraday" | "days" | "weeks" | "months" | "long_term";
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

export type RiskGateV2ModuleResult = {
  module: RiskGateV2Module;
  score: number;
  previous_score: number | null;
  delta: number | null;
  confidence: number;
  coverage: RiskGateV2CoverageState;
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

export type RiskGateV2Response = {
  schema_version: typeof RISK_GATE_V2_SCHEMA_VERSION;
  request_id: string;
  decision: RiskGateDecision;
  display_label: RiskGateV2DisplayLabel;
  recommended_action: RiskGateRecommendedAction;
  execution_authorized: false;
  subject: RiskGateV2Subject;
  action_risk: {
    score: number;
    previous_score: number | null;
    delta: number | null;
    confidence: number;
    coverage: RiskGateV2CoverageState;
    direction: RiskDirection;
  };
  active_modules: RiskGateV2ModuleResult[];
  top_drivers: RiskGateV2DriverResult[];
  integrity: {
    methodology_version: string;
    calculation_hash: string;
    risk_object_ids: string[];
  };
  policy: RiskGateV2PolicyReference;
};

export function riskGateV2DisplayLabel(decision: RiskGateDecision): RiskGateV2DisplayLabel {
  if (decision === "CONTINUE") return "CLEAR";
  if (decision === "REDUCE_LIMIT") return "CAUTION";
  if (decision === "REQUIRE_APPROVAL") return "REVIEW";
  return "HOLD";
}
