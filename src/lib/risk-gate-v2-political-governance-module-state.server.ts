import { requireRiskSupabase } from "./risk-supabase.server";
import {
  buildRiskGateV2PoliticalGovernanceModuleState,
  type RiskGateV2WgiPoliticalStabilityInput,
} from "./risk-gate-v2-political-governance-module-state";

function parseProvenance(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCommercialStatus(
  value: unknown,
): RiskGateV2WgiPoliticalStabilityInput["commercial_eligibility_status"] {
  if (value === "VERIFIED") return "VERIFIED";
  if (value === "BLOCKED") return "INELIGIBLE";
  return "UNVERIFIED";
}

async function loadLatestWgiPoliticalStability(input: {
  country_iso3: string;
  as_of: string;
}): Promise<RiskGateV2WgiPoliticalStabilityInput | null> {
  const db = requireRiskSupabase();
  const iso3 = input.country_iso3.trim().toUpperCase();

  const result = await db
    .from("live_external_observations")
    .select(`
      country_iso3,
      value_numeric,
      observed_at,
      normalized_hash,
      provenance,
      commercial_eligibility_status
    `)
    .eq("source_id", "world_bank_wgi_political_stability")
    .eq("metric", "political_stability_absolute_score")
    .eq("country_iso3", iso3)
    .eq("quality_status", "VERIFIED")
    .lte("observed_at", input.as_of)
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  if (
    !result.data ||
    typeof result.data.value_numeric !== "number" ||
    !result.data.observed_at
  ) {
    return null;
  }

  const provenance = parseProvenance(result.data.provenance);

  return {
    country_iso3: iso3,
    stability_score: result.data.value_numeric,
    observed_at: result.data.observed_at,
    normalized_hash:
      typeof result.data.normalized_hash === "string"
        ? result.data.normalized_hash
        : null,
    score_ci_lower: optionalNumber(provenance.score_ci_lower),
    score_ci_upper: optionalNumber(provenance.score_ci_upper),
    source_count: optionalNumber(provenance.source_count),
    commercial_eligibility_status: normalizeCommercialStatus(
      result.data.commercial_eligibility_status,
    ),
  };
}

export async function generateRiskGateV2PoliticalGovernanceModuleState(input: {
  country_iso3: string;
  as_of: string;
  previous_as_of?: string | null;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const current = await loadLatestWgiPoliticalStability({
    country_iso3: input.country_iso3,
    as_of: input.as_of,
  });

  if (!current) return null;

  const previous = input.previous_as_of
    ? await loadLatestWgiPoliticalStability({
        country_iso3: input.country_iso3,
        as_of: input.previous_as_of,
      })
    : null;

  return buildRiskGateV2PoliticalGovernanceModuleState({
    current,
    previous,
    generated_at: input.generated_at ?? new Date().toISOString(),
    risk_object_ids: input.risk_object_ids,
  });
}
