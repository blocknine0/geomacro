import type { AgentQueryPlan } from "./agent-query-plan";
import { checkCommercialSourceEligibility } from "./commercial-source-eligibility.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { generateRiskGateV2PoliticalGovernanceModuleState } from "./risk-gate-v2-political-governance-module-state.server";

export const AGENT_POLITICAL_GOVERNANCE_SOURCE_ID =
  "world_bank_wgi_political_stability" as const;

export type AgentPoliticalGovernanceModule = {
  deliverable: boolean;
  code:
    | "AVAILABLE"
    | "NOT_COUNTRY_SUBJECT"
    | "SOURCE_NOT_ELIGIBLE"
    | "OBSERVATION_NOT_AVAILABLE"
    | "OBSERVATION_STALE"
    | "MODULE_NOT_VERIFIED";
  subject: AgentQueryPlan["subjects"][number];
  source_id: typeof AGENT_POLITICAL_GOVERNANCE_SOURCE_ID;
  source_observed_at: string | null;
  source_normalized_hash: string | null;
  source_contract: {
    commercial_usage_status: string | null;
    raw_redistribution_allowed: boolean;
    attribution_required: boolean;
    licence_name: string | null;
  } | null;
  state: null | {
    module: "political_governance";
    score: number;
    previous_score: number | null;
    delta: number | null;
    confidence: number;
    coverage: string;
    commercial_eligibility_status: string;
    generated_at: string;
    expires_at: string;
    methodology_version: string;
    drivers: Array<{
      driver: string;
      score_contribution: number;
      delta_contribution: number | null;
      confidence: number;
    }>;
  };
};

function unavailable(
  subject: AgentQueryPlan["subjects"][number],
  code: AgentPoliticalGovernanceModule["code"],
  sourceContract: AgentPoliticalGovernanceModule["source_contract"] = null,
  sourceObservedAt: string | null = null,
  sourceNormalizedHash: string | null = null,
): AgentPoliticalGovernanceModule {
  return {
    deliverable: false,
    code,
    subject,
    source_id: AGENT_POLITICAL_GOVERNANCE_SOURCE_ID,
    source_observed_at: sourceObservedAt,
    source_normalized_hash: sourceNormalizedHash,
    source_contract: sourceContract,
    state: null,
  };
}

export async function loadAgentPoliticalGovernanceModule(input: {
  subject: AgentQueryPlan["subjects"][number];
  as_of: string;
  max_age_seconds: number;
}): Promise<AgentPoliticalGovernanceModule> {
  if (input.subject.type !== "country") {
    return unavailable(input.subject, "NOT_COUNTRY_SUBJECT");
  }

  const source = await checkCommercialSourceEligibility(
    AGENT_POLITICAL_GOVERNANCE_SOURCE_ID,
  );
  const sourceContract = {
    commercial_usage_status: source.commercial_usage_status,
    raw_redistribution_allowed: source.raw_redistribution_allowed,
    attribution_required: source.attribution_required,
    licence_name: source.licence_name,
  };
  if (!source.eligible) {
    return unavailable(input.subject, "SOURCE_NOT_ELIGIBLE", sourceContract);
  }

  const db = requireRiskSupabase();
  const observation = await db
    .from("live_external_observations")
    .select("observed_at,normalized_hash,commercial_eligibility_status")
    .eq("source_id", AGENT_POLITICAL_GOVERNANCE_SOURCE_ID)
    .eq("metric", "political_stability_absolute_score")
    .eq("country_iso3", input.subject.country_iso3)
    .eq("quality_status", "VERIFIED")
    .lte("observed_at", input.as_of)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (observation.error) throw observation.error;
  const observedAt =
    typeof observation.data?.observed_at === "string"
      ? observation.data.observed_at
      : null;
  const normalizedHash =
    typeof observation.data?.normalized_hash === "string"
      ? observation.data.normalized_hash
      : null;

  if (!observedAt) {
    return unavailable(
      input.subject,
      "OBSERVATION_NOT_AVAILABLE",
      sourceContract,
      null,
      normalizedHash,
    );
  }

  const asOfMs = Date.parse(input.as_of);
  const observedMs = Date.parse(observedAt);
  if (
    !Number.isFinite(asOfMs) ||
    !Number.isFinite(observedMs) ||
    !Number.isFinite(input.max_age_seconds) ||
    input.max_age_seconds <= 0 ||
    asOfMs - observedMs > input.max_age_seconds * 1_000
  ) {
    return unavailable(
      input.subject,
      "OBSERVATION_STALE",
      sourceContract,
      observedAt,
      normalizedHash,
    );
  }

  if (observation.data?.commercial_eligibility_status !== "VERIFIED") {
    return unavailable(
      input.subject,
      "MODULE_NOT_VERIFIED",
      sourceContract,
      observedAt,
      normalizedHash,
    );
  }

  const state = await generateRiskGateV2PoliticalGovernanceModuleState({
    country_iso3: input.subject.country_iso3,
    as_of: input.as_of,
    generated_at: new Date().toISOString(),
  });
  if (!state || state.commercial_eligibility_status !== "VERIFIED") {
    return unavailable(
      input.subject,
      "MODULE_NOT_VERIFIED",
      sourceContract,
      observedAt,
      normalizedHash,
    );
  }

  return {
    deliverable: true,
    code: "AVAILABLE",
    subject: input.subject,
    source_id: AGENT_POLITICAL_GOVERNANCE_SOURCE_ID,
    source_observed_at: observedAt,
    source_normalized_hash: normalizedHash,
    source_contract: sourceContract,
    state: {
      module: "political_governance",
      score: state.score,
      previous_score: state.previous_score,
      delta: state.delta,
      confidence: state.confidence,
      coverage: state.coverage,
      commercial_eligibility_status: state.commercial_eligibility_status,
      generated_at: state.generated_at,
      expires_at: state.expires_at,
      methodology_version: state.methodology_version,
      drivers: state.drivers.map((driver) => ({
        driver: driver.driver,
        score_contribution: driver.score_contribution,
        delta_contribution: driver.delta_contribution,
        confidence: driver.confidence,
      })),
    },
  };
}
