import { requireRiskSupabase } from "./risk-supabase.server";

export type CommercialSourceEligibility = {
  eligible: boolean;
  source_id: string;
  commercial_usage_status: string | null;
  enabled_for_ingestion: boolean;
  enabled_for_commercial_signals: boolean;
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
      licence_name: null,
      reason: "SOURCE_ID_MISSING",
    };
  }

  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,licence_name")
    .eq("source_id", normalized)
    .maybeSingle();

  if (result.error) throw result.error;
  const row = result.data as {
    source_id?: string;
    commercial_usage_status?: string | null;
    enabled_for_ingestion?: boolean | null;
    enabled_for_commercial_signals?: boolean | null;
    licence_name?: string | null;
  } | null;

  if (!row) {
    return {
      eligible: false,
      source_id: normalized,
      commercial_usage_status: null,
      enabled_for_ingestion: false,
      enabled_for_commercial_signals: false,
      licence_name: null,
      reason: "SOURCE_NOT_REGISTERED",
    };
  }

  const status = row.commercial_usage_status ?? null;
  const ingestion = row.enabled_for_ingestion === true;
  // Direct paid structured-data delivery requires an explicit COMMERCIAL_OK
  // registration and an active governed ingestion path. The commercial-signals
  // flag is reported separately because some sources may be commercially
  // deliverable as evidence while intentionally not promoted into scoring.
  const eligible = status === "COMMERCIAL_OK" && ingestion;

  return {
    eligible,
    source_id: normalized,
    commercial_usage_status: status,
    enabled_for_ingestion: ingestion,
    enabled_for_commercial_signals: row.enabled_for_commercial_signals === true,
    licence_name: row.licence_name ?? null,
    reason: eligible
      ? null
      : status !== "COMMERCIAL_OK"
        ? `SOURCE_COMMERCIAL_STATUS_${status ?? "MISSING"}`
        : "SOURCE_INGESTION_DISABLED",
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
