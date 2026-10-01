import { readB2CommercialSourceRights, type B2CommercialSourceRight } from "./b2-live.server";
import { requireRiskSupabase } from "./risk-supabase.server";

export type CommercialSourceEligibility = {
  eligible: boolean;
  source_id: string;
  commercial_usage_status: string | null;
  enabled_for_ingestion: boolean;
  enabled_for_commercial_signals: boolean;
  raw_redistribution_allowed: boolean;
  attribution_required: boolean;
  licence_name: string | null;
  reason: string | null;
};

export type SourceRightsRow = B2CommercialSourceRight;

function unavailableSource(sourceId: string, reason: string): CommercialSourceEligibility {
  return {
    eligible: false,
    source_id: sourceId,
    commercial_usage_status: null,
    enabled_for_ingestion: false,
    enabled_for_commercial_signals: false,
    raw_redistribution_allowed: false,
    attribution_required: false,
    licence_name: null,
    reason,
  };
}

export function commercialSourceEligibilityFromRow(
  sourceId: string,
  row: SourceRightsRow | null,
): CommercialSourceEligibility {
  if (!row) return unavailableSource(sourceId, "SOURCE_NOT_REGISTERED");

  const status = row.commercial_usage_status ?? null;
  const ingestion = row.enabled_for_ingestion === true;
  const rawRedistribution = row.raw_redistribution_allowed === true;
  // This adaptive product exposes structured evidence rows, not merely an
  // internal derived score. Paid delivery therefore requires explicit raw
  // redistribution permission in addition to commercial-use approval and an
  // active governed ingest. Sources approved only for derived intelligence stay
  // usable inside governed scoring/Risk Objects but are not exposed here.
  const eligible = status === "COMMERCIAL_OK" && ingestion && rawRedistribution;

  return {
    eligible,
    source_id: sourceId,
    commercial_usage_status: status,
    enabled_for_ingestion: ingestion,
    enabled_for_commercial_signals: row.enabled_for_commercial_signals === true,
    raw_redistribution_allowed: rawRedistribution,
    attribution_required: row.attribution_required === true,
    licence_name: row.licence_name ?? null,
    reason: eligible
      ? null
      : status !== "COMMERCIAL_OK"
        ? `SOURCE_COMMERCIAL_STATUS_${status ?? "MISSING"}`
        : !ingestion
          ? "SOURCE_INGESTION_DISABLED"
          : "SOURCE_RAW_REDISTRIBUTION_NOT_ALLOWED",
  };
}

export async function readCommercialSourceRightsRow(
  sourceId: string,
): Promise<SourceRightsRow | null> {
  const normalized = sourceId.trim();
  if (!normalized) return null;
  try {
    const db = requireRiskSupabase();
    const result = await db
      .from("live_external_sources")
      .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name")
      .eq("source_id", normalized)
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;
    return {
      source_id: String(result.data.source_id ?? normalized),
      commercial_usage_status: result.data.commercial_usage_status ?? null,
      enabled_for_ingestion: result.data.enabled_for_ingestion === true,
      enabled_for_commercial_signals: result.data.enabled_for_commercial_signals === true,
      raw_redistribution_allowed: result.data.raw_redistribution_allowed === true,
      attribution_required: result.data.attribution_required === true,
      licence_name: result.data.licence_name ?? null,
    };
  } catch (primaryError) {
    const fallback = await readB2CommercialSourceRights();
    if (!fallback) {
      const error = new Error("COMMERCIAL_SOURCE_RIGHTS_UNAVAILABLE");
      (error as Error & { cause?: unknown }).cause = primaryError;
      throw error;
    }
    console.warn("[commercial-source-rights] primary registry unavailable; using fresh verified B2 snapshot");
    return fallback.find((row) => row.source_id === normalized) ?? null;
  }
}

export async function checkCommercialSourceEligibility(sourceId: string): Promise<CommercialSourceEligibility> {
  const normalized = sourceId.trim();
  if (!normalized) return unavailableSource(sourceId, "SOURCE_ID_MISSING");
  const row = await readCommercialSourceRightsRow(normalized);
  return commercialSourceEligibilityFromRow(normalized, row);
}

export async function assertCommercialSourcesEligible(sourceIds: Iterable<string>) {
  const unique = [...new Set([...sourceIds].map((value) => value.trim()).filter(Boolean))].sort();
  const results = await Promise.all(unique.map((sourceId) => checkCommercialSourceEligibility(sourceId)));
  return {
    eligible: results.every((result) => result.eligible),
    results,
    ineligible_source_ids: results.filter((result) => !result.eligible).map((result) => result.source_id),
  };
}
