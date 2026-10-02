import { readB2CommercialSourceRights, type B2CommercialSourceRight } from "./b2-live.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { supabaseReadFallbackAllowed } from "./supabase-runtime-mode.server";

export type CommercialSourceEligibility = {
  eligible: boolean;
  source_id: string;
  certification_state: string | null;
  commercial_usage_status: string | null;
  enabled_for_ingestion: boolean;
  enabled_for_commercial_signals: boolean;
  raw_redistribution_allowed: boolean;
  attribution_required: boolean;
  licence_name: string | null;
  delivery_boundary: "DERIVED_ONLY";
  raw_payload_allowed: false;
  reason: string | null;
};

export type SourceRightsRow = B2CommercialSourceRight;

const DERIVED_COMMERCIAL_STATUSES = new Set(["COMMERCIAL_OK", "DERIVED_ONLY"]);

function unavailableSource(sourceId: string, reason: string): CommercialSourceEligibility {
  return {
    eligible: false,
    source_id: sourceId,
    certification_state: null,
    commercial_usage_status: null,
    enabled_for_ingestion: false,
    enabled_for_commercial_signals: false,
    raw_redistribution_allowed: false,
    attribution_required: false,
    licence_name: null,
    delivery_boundary: "DERIVED_ONLY",
    raw_payload_allowed: false,
    reason,
  };
}

/**
 * Eligibility for Geomacro paid structured intelligence.
 *
 * Geomacro does not sell or return an upstream source feed. A source may
 * influence a paid response only when it is explicitly approved for commercial
 * derived signals, active for governed ingestion, and technically CERTIFIED.
 * Raw redistribution permission is retained as internal rights metadata but is
 * deliberately NOT a prerequisite for this product boundary.
 */
export function commercialSourceEligibilityFromRow(
  sourceId: string,
  row: SourceRightsRow | null,
): CommercialSourceEligibility {
  if (!row) return unavailableSource(sourceId, "SOURCE_NOT_REGISTERED");

  const status = row.commercial_usage_status ?? null;
  const certificationState = row.certification_state ?? null;
  const ingestion = row.enabled_for_ingestion === true;
  const commercialSignals = row.enabled_for_commercial_signals === true;
  const rawRedistribution = row.raw_redistribution_allowed === true;
  const derivedUseAllowed = DERIVED_COMMERCIAL_STATUSES.has(String(status ?? ""));
  const certified = certificationState === "CERTIFIED";
  const eligible = derivedUseAllowed && ingestion && commercialSignals && certified;

  return {
    eligible,
    source_id: sourceId,
    certification_state: certificationState,
    commercial_usage_status: status,
    enabled_for_ingestion: ingestion,
    enabled_for_commercial_signals: commercialSignals,
    raw_redistribution_allowed: rawRedistribution,
    attribution_required: row.attribution_required === true,
    licence_name: row.licence_name ?? null,
    delivery_boundary: "DERIVED_ONLY",
    raw_payload_allowed: false,
    reason: eligible
      ? null
      : !derivedUseAllowed
        ? `SOURCE_COMMERCIAL_STATUS_${status ?? "MISSING"}`
        : !ingestion
          ? "SOURCE_INGESTION_DISABLED"
          : !commercialSignals
            ? "SOURCE_COMMERCIAL_SIGNALS_DISABLED"
            : `SOURCE_CERTIFICATION_${certificationState ?? "MISSING"}`,
  };
}

async function readSupabaseSourceRightsRow(
  sourceId: string,
): Promise<SourceRightsRow | null> {
  const db = requireRiskSupabase();
  const [sourceResult, certificationResult] = await Promise.all([
    db
      .from("live_external_sources")
      .select("source_id,category,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name")
      .eq("source_id", sourceId)
      .maybeSingle(),
    db
      .from("live_source_certification_records")
      .select("source_id,certification_state")
      .eq("source_id", sourceId)
      .maybeSingle(),
  ]);
  if (sourceResult.error) throw sourceResult.error;
  if (certificationResult.error) throw certificationResult.error;
  if (!sourceResult.data) return null;
  return {
    source_id: String(sourceResult.data.source_id ?? sourceId),
    category: typeof sourceResult.data.category === "string" ? sourceResult.data.category : null,
    certification_state:
      typeof certificationResult.data?.certification_state === "string"
        ? certificationResult.data.certification_state
        : null,
    commercial_usage_status: sourceResult.data.commercial_usage_status ?? null,
    enabled_for_ingestion: sourceResult.data.enabled_for_ingestion === true,
    enabled_for_commercial_signals: sourceResult.data.enabled_for_commercial_signals === true,
    raw_redistribution_allowed: sourceResult.data.raw_redistribution_allowed === true,
    attribution_required: sourceResult.data.attribution_required === true,
    licence_name: sourceResult.data.licence_name ?? null,
  };
}

export async function readCommercialSourceRightsRow(
  sourceId: string,
): Promise<SourceRightsRow | null> {
  const normalized = sourceId.trim();
  if (!normalized) return null;

  const b2 = await readB2CommercialSourceRights();
  if (b2) {
    return b2.find((row) => row.source_id === normalized) ?? null;
  }

  if (!supabaseReadFallbackAllowed()) {
    throw new Error("COMMERCIAL_SOURCE_RIGHTS_B2_UNAVAILABLE_SUPABASE_STANDBY");
  }

  try {
    return await readSupabaseSourceRightsRow(normalized);
  } catch (primaryError) {
    const error = new Error("COMMERCIAL_SOURCE_RIGHTS_UNAVAILABLE");
    (error as Error & { cause?: unknown }).cause = primaryError;
    throw error;
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
    eligible: results.length > 0 && results.every((result) => result.eligible),
    results,
    ineligible_source_ids: results.filter((result) => !result.eligible).map((result) => result.source_id),
  };
}
