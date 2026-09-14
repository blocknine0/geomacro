import { requireRiskSupabase } from "./risk-supabase.server";
import {
  buildRiskGateV2PoliticalGovernanceState,
  type WgiPoliticalGovernanceObservation,
} from "./risk-gate-v2-political-governance-state";

const SOURCE_ID = "world_bank_wgi_political_stability";
const METRIC = "political_stability_absolute_score";

function numberField(value: unknown, field: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`WGI provenance ${field} is missing or invalid`);
  }
  return numeric;
}

function rowToObservation(row: Record<string, unknown>): WgiPoliticalGovernanceObservation {
  const provenance =
    row.provenance && typeof row.provenance === "object"
      ? (row.provenance as Record<string, unknown>)
      : {};

  return {
    country_iso3: String(row.country_iso3 ?? ""),
    absolute_score: numberField(row.value_numeric, "absolute_score"),
    score_ci_lower: numberField(provenance.score_ci_lower, "score_ci_lower"),
    score_ci_upper: numberField(provenance.score_ci_upper, "score_ci_upper"),
    source_count: numberField(provenance.source_count, "source_count"),
    observed_at: String(row.observed_at ?? ""),
    normalized_hash: String(row.normalized_hash ?? ""),
  };
}

/**
 * Production WGI adapter for Risk Gate v2 political-governance context.
 * Only the exact reviewed WGI source contract can contribute. Missing, stale,
 * non-VERIFIED or non-commercial rows return null/fail closed upstream.
 */
export async function generateCountryRiskGateV2PoliticalGovernanceState(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
}) {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("country_iso3 must be ISO3");
  }
  const asOf = new Date(input.as_of);
  if (Number.isNaN(asOf.getTime())) throw new Error("Invalid as_of timestamp");

  const db = requireRiskSupabase();

  const source = await db
    .from("live_external_sources")
    .select("source_id")
    .eq("source_id", SOURCE_ID)
    .eq("enabled_for_ingestion", true)
    .eq("enabled_for_commercial_signals", true)
    .eq("commercial_usage_status", "COMMERCIAL_OK")
    .maybeSingle();

  if (source.error) throw source.error;
  if (!source.data) return null;

  const result = await db
    .from("live_external_observations")
    .select("country_iso3,value_numeric,observed_at,normalized_hash,provenance")
    .eq("source_id", SOURCE_ID)
    .eq("metric", METRIC)
    .eq("country_iso3", iso3)
    .eq("quality_status", "VERIFIED")
    .eq("commercial_eligibility_status", "VERIFIED")
    .lte("observed_at", asOf.toISOString())
    .order("observed_at", { ascending: false })
    .limit(2);

  if (result.error) throw result.error;
  const rows = (result.data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return null;

  return buildRiskGateV2PoliticalGovernanceState({
    observation: rowToObservation(rows[0]),
    previous_observation: rows[1] ? rowToObservation(rows[1]) : null,
    generated_at: input.generated_at ?? new Date().toISOString(),
  });
}
