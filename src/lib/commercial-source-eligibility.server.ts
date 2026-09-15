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

export async function checkCommercialSourceEligibility(sourceId: string): Promise<CommercialSourceEligibility> {
  const normalized = sourceId.trim();
  if (!normalized) {
    return {
      eligible: false,
      source_id: sourceId,
      commercial_usage_status: null,
      enabled_for_ingestion: false,
      enabled_for_commercial_signals: false,
      raw_redistribution_allowed: false,
      attribution_required: false,
      licence_name: null,
      reason: "SOURCE_ID_MISSING",
    };
  }

  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name")
    .eq("source_id", normalized)
    .maybeSingle();

  if (result.error) throw result.error;
  const row = result.data as {
    source_id?: string;
    commercial_usage_status?: string | null;
    enabled_for_ingestion?: boolean | null;
    enabled_for_commercial_signals?: boolean | null;
    raw_redistribution_allowed?: boolean | null;
    attribution_required?: boolean | null;
    licence_name?: string | null;
  } | null;

  if (!row) {
    return {
      eligible: false,
      source_id: normalized,
      commercial_usage_status: null,
      enabled_for_ingestion: false,
      enabled_for_commercial_signals: false,
      raw_redistribution_allowed: false,
      attribution_required: false,
      licence_name: null,
      reason: "SOURCE_NOT_REGISTERED",
    };
  }

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
    source_id: normalized,
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

export async function assertCommercialSourcesEligible(sourceIds: Iterable<string>) {
  const unique = [...new Set([...sourceIds].map((value) => value.trim()).filter(Boolean))].sort();
  const results = await Promise.all(unique.map((sourceId) => checkCommercialSourceEligibility(sourceId)));
  return {
    eligible: results.every((result) => result.eligible),
    results,
    ineligible_source_ids: results.filter((result) => !result.eligible).map((result) => result.source_id),
  };
}
