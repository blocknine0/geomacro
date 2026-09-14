import type { RiskGateV2CommercialEligibilityStatus } from "./risk-gate-v2-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION =
  "risk-gate-v2-political-governance-wgi-0.1.0" as const;

export const RISK_GATE_V2_POLITICAL_GOVERNANCE_TTL_MS =
  24 * 60 * 60 * 1000;

export type RiskGateV2WgiPoliticalStabilityInput = {
  country_iso3: string;
  stability_score: number;
  observed_at: string;
  normalized_hash?: string | null;
  score_ci_lower?: number | null;
  score_ci_upper?: number | null;
  source_count?: number | null;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseTimestamp(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function validateStabilityScore(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("WGI political stability score must be within 0..100");
  }
}

function structuralFreshnessConfidence(observedAt: Date, generatedAt: Date) {
  const ageDays = Math.max(
    0,
    (generatedAt.getTime() - observedAt.getTime()) / 86_400_000,
  );

  // WGI is a structural annual dataset. A release can legitimately lag the
  // evaluation clock, so freshness decays more slowly than event intelligence.
  if (ageDays <= 550) return 1;
  if (ageDays <= 900) return 0.8;
  if (ageDays <= 1_200) return 0.6;
  return 0.4;
}

function measurementConfidence(input: RiskGateV2WgiPoliticalStabilityInput) {
  const lower = input.score_ci_lower;
  const upper = input.score_ci_upper;
  const intervalConfidence =
    typeof lower === "number" &&
    Number.isFinite(lower) &&
    typeof upper === "number" &&
    Number.isFinite(upper) &&
    lower >= 0 &&
    upper <= 100 &&
    lower <= upper
      ? clamp(1 - (upper - lower) / 100, 0.35, 1)
      : 0.7;

  const count = input.source_count;
  const sourceConfidence =
    typeof count === "number" && Number.isFinite(count) && count >= 0
      ? clamp(count / 10, 0.4, 1)
      : 0.7;

  return round6((intervalConfidence + sourceConfidence) / 2);
}

function riskScoreFromStability(score: number) {
  validateStabilityScore(score);
  return round6(100 - score);
}

export function buildRiskGateV2PoliticalGovernanceModuleState(input: {
  current: RiskGateV2WgiPoliticalStabilityInput;
  previous?: RiskGateV2WgiPoliticalStabilityInput | null;
  generated_at: string;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput {
  const generatedAt = parseTimestamp(input.generated_at, "generated_at");
  const observedAt = parseTimestamp(input.current.observed_at, "observed_at");

  const iso3 = input.current.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("Risk Gate v2 political-governance module requires a valid country ISO3");
  }

  const score = riskScoreFromStability(input.current.stability_score);
  const previousScore = input.previous
    ? riskScoreFromStability(input.previous.stability_score)
    : null;

  if (
    input.previous &&
    input.previous.country_iso3.trim().toUpperCase() !== iso3
  ) {
    throw new Error("Previous WGI country does not match current WGI country");
  }

  const confidence = round6(
    measurementConfidence(input.current) *
      structuralFreshnessConfidence(observedAt, generatedAt),
  );

  const identity =
    input.current.normalized_hash?.trim().toLowerCase().slice(0, 24) ||
    `${iso3}-${observedAt.getUTCFullYear()}`;

  return {
    module_state_id: `rgv2:${iso3}:political_governance:${identity}:${generatedAt.getTime().toString(36)}`,
    module: "political_governance",
    score,
    previous_score: previousScore,
    delta: previousScore === null ? null : round6(score - previousScore),
    confidence,
    // WGI political stability is a governed structural signal, but it does not
    // cover rule of law, policy continuity or the full governance ontology.
    coverage: "LIMITED",
    commercial_eligibility_status:
      input.current.commercial_eligibility_status,
    generated_at: generatedAt.toISOString(),
    expires_at: new Date(
      generatedAt.getTime() + RISK_GATE_V2_POLITICAL_GOVERNANCE_TTL_MS,
    ).toISOString(),
    methodology_version: RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers: [
      {
        driver: "government_stability",
        score_contribution: score,
        delta_contribution:
          previousScore === null ? null : round6(score - previousScore),
        confidence,
      },
    ],
  };
}
