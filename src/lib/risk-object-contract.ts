/**
 * Geomacro Risk Object (GRO)
 *
 * Canonical machine-readable risk primitive for the agentic economy.
 *
 * Product boundary:
 * - Geomacro provides external-world risk context.
 * - Customer / agent policy controls the final action.
 * - This contract does not imply custody, execution or trade submission.
 */

export const GRO_SCHEMA_VERSION = "gro-1.0" as const;

export const COUNTRY_RISK_METHOD_VERSION =
  "country-risk-v0.1.0-pilot" as const;

export const COUNTRY_RISK_LOOKBACK_HOURS = 72;
export const COUNTRY_RISK_HALF_LIFE_HOURS = 24;
export const COUNTRY_RISK_OBJECT_TTL_HOURS = 3;

export type RiskSubjectType =
  | "country"
  | "corridor"
  | "event";

export type RiskVerificationStatus =
  | "VERIFIED"
  | "STALE"
  | "EXPIRED"
  | "INCOMPLETE"
  | "UNVERIFIABLE";

export type CommercialEligibilityStatus =
  | "VERIFIED"
  | "UNVERIFIED"
  | "INELIGIBLE";

export type RiskLabel =
  | "CALM"
  | "STABLE"
  | "WATCH"
  | "ELEVATED"
  | "CRITICAL";

export type RiskDirection =
  | "escalating"
  | "cooling"
  | "steady"
  | "unknown";

export type RiskDriver =
  | "conflict"
  | "sanctions"
  | "political_instability"
  | "trade_policy"
  | "monetary_policy"
  | "inflation"
  | "labor_market"
  | "currency_fx"
  | "macro_stress"
  | "rare_earth_supply"
  | "critical_minerals"
  | "shipping_logistics"
  | "other";

export type RiskAttribution = {
  driver: RiskDriver;

  /**
   * Contribution of this driver to the current
   * country score. All score contributions should
   * reconcile to the current score subject to
   * documented rounding.
   */
  score_contribution: number;

  /**
   * Change in this driver's contribution relative
   * to the previous trusted Risk Object.
   *
   * Null when no compatible previous object exists.
   */
  delta_contribution: number | null;

  event_count: number;
  weight: number;
};

export type RiskEvidenceReference = {
  event_id: string;
  title: string;
  event_type: string | null;

  severity: number;
  confidence: number;

  direction: RiskDirection;

  last_seen_at: string;

  evidence_count: number;
  independent_source_count: number;

  evidence_refs: string[];
  source_families: string[];
};

export type RiskIntegrity = {
  input_hash: string;
  data_hash: string;
  calculation_hash: string;

  /**
   * Cryptographic issuer signing is intentionally
   * not represented as implemented yet.
   */
  signature: null;
  signature_scheme: null;
};

export type GeomacroRiskObject = {
  schema_version: typeof GRO_SCHEMA_VERSION;

  object_id: string;

  subject: {
    type: RiskSubjectType;
    id: string;
    name: string | null;
  };

  risk: {
    score: number;
    label: RiskLabel;

    previous_score: number | null;
    delta: number | null;

    direction: RiskDirection;
  };

  attribution: RiskAttribution[];

  /**
   * 0..1 aggregate confidence of the calculated
   * country risk state.
   */
  confidence: number;

  evidence: RiskEvidenceReference[];

  /**
   * Deliberately nullable until a validated
   * production coverage methodology is locked.
   */
  evidence_coverage: number | null;

  evidence_summary: {
    event_count: number;
    evidence_count: number;
    independent_source_count: number;
  };

  methodology_version:
    typeof COUNTRY_RISK_METHOD_VERSION;

  generated_at: string;
  expires_at: string;

  issuer: "Geomacro";

  commercial_eligibility: {
    status: CommercialEligibilityStatus;
    reason_codes: string[];
  };

  verification: {
    status: RiskVerificationStatus;
    reason_codes: string[];
    last_verified_at: string | null;
  };

  integrity: RiskIntegrity;

  provenance: {
    structure_versions: string[];
    scoring_versions: string[];
    relevance_versions: string[];
    country_versions: string[];
    story_versions: string[];
  };
};

export function riskLabel(
  score: number,
): RiskLabel {
  const value =
    Math.min(
      100,
      Math.max(0, score),
    );

  if (value < 20) return "CALM";
  if (value < 40) return "STABLE";
  if (value < 60) return "WATCH";
  if (value < 80) return "ELEVATED";

  return "CRITICAL";
}
