import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION =
  "risk-gate-v2-political-governance-wgi-0.1.0" as const;

export const RISK_GATE_V2_POLITICAL_GOVERNANCE_TTL_MS =
  24 * 60 * 60 * 1000;

export type WgiPoliticalGovernanceObservation = {
  country_iso3: string;
  absolute_score: number;
  score_ci_lower: number;
  score_ci_upper: number;
  source_count: number;
  observed_at: string;
  normalized_hash: string;
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function assertScore(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${field} must be within 0..100`);
  }
}

function freshnessMultiplier(observedAt: Date, generatedAt: Date) {
  const ageDays = Math.max(
    0,
    (generatedAt.getTime() - observedAt.getTime()) / 86_400_000,
  );

  if (ageDays <= 400) return 1;
  if (ageDays <= 800) return 0.75;
  return 0;
}

function riskScore(observation: WgiPoliticalGovernanceObservation) {
  // WGI absolute score uses 100 as the best governance performance. Risk Gate
  // is risk-oriented, so invert the governed score rather than re-scaling it
  // through an opaque model.
  return round6(100 - observation.absolute_score);
}

/**
 * Build the first separately-versioned Risk Gate v2 political-governance state.
 *
 * Scope is intentionally LIMITED: WGI Political Stability is one governed
 * governance dimension, not the complete political/governance ontology.
 * Confidence preserves WGI uncertainty through the 0..100 confidence interval,
 * source-count breadth and source freshness. Stale observations return null.
 */
export function buildRiskGateV2PoliticalGovernanceState(input: {
  observation: WgiPoliticalGovernanceObservation;
  previous_observation?: WgiPoliticalGovernanceObservation | null;
  generated_at: string;
}): RiskGateV2ModuleStateInput | null {
  const current = input.observation;
  const iso3 = current.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("WGI political-governance module requires a valid ISO3 country");
  }

  assertScore(current.absolute_score, "absolute_score");
  assertScore(current.score_ci_lower, "score_ci_lower");
  assertScore(current.score_ci_upper, "score_ci_upper");
  if (current.score_ci_lower > current.absolute_score || current.absolute_score > current.score_ci_upper) {
    throw new Error("WGI score must fall inside its confidence interval");
  }
  if (!Number.isInteger(current.source_count) || current.source_count < 0) {
    throw new Error("WGI source_count must be a non-negative integer");
  }
  if (!/^[0-9a-f]{64}$/.test(current.normalized_hash)) {
    throw new Error("WGI normalized_hash must be sha256 hex");
  }

  const generatedAt = new Date(input.generated_at);
  const observedAt = new Date(current.observed_at);
  if (Number.isNaN(generatedAt.getTime()) || Number.isNaN(observedAt.getTime())) {
    throw new Error("WGI module timestamps must be valid");
  }

  const freshness = freshnessMultiplier(observedAt, generatedAt);
  if (freshness === 0) return null;

  const intervalWidth = current.score_ci_upper - current.score_ci_lower;
  const uncertaintyConfidence = Math.max(0, 1 - intervalWidth / 100);
  const sourceBreadthConfidence = Math.min(1, current.source_count / 10);
  const confidence = round6(
    uncertaintyConfidence * sourceBreadthConfidence * freshness,
  );

  const score = riskScore(current);
  let previousScore: number | null = null;
  if (input.previous_observation) {
    const previous = input.previous_observation;
    if (previous.country_iso3.trim().toUpperCase() !== iso3) {
      throw new Error("Previous WGI observation country does not match current country");
    }
    assertScore(previous.absolute_score, "previous absolute_score");
    previousScore = riskScore(previous);
  }

  const delta = previousScore === null ? null : round6(score - previousScore);
  const expiresAt = new Date(
    generatedAt.getTime() + RISK_GATE_V2_POLITICAL_GOVERNANCE_TTL_MS,
  );

  return {
    module_state_id: [
      "rgv2",
      iso3,
      "political_governance",
      current.normalized_hash.slice(0, 24),
      generatedAt.getTime().toString(36),
    ].join(":"),
    module: "political_governance",
    score,
    previous_score: previousScore,
    delta,
    confidence,
    coverage: "LIMITED",
    commercial_eligibility_status: "VERIFIED",
    generated_at: generatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    methodology_version: RISK_GATE_V2_POLITICAL_GOVERNANCE_METHOD_VERSION,
    risk_object_ids: [],
    drivers: [
      {
        driver: "government_stability",
        score_contribution: score,
        delta_contribution: delta,
        confidence,
      },
    ],
  };
}
