import { requireRiskSupabase } from "./risk-supabase.server";
import {
  buildRiskGateV2EnergyCommoditiesModuleState,
  canonicalRiskGateV2Commodity,
  findRiskGateV2UsqsExtractionSeries,
  RISK_GATE_V2_USGS_EXTRACTION_SCOPE,
  RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256,
  type RiskGateV2UsqsExtractionManifest,
  type RiskGateV2UsqsExtractionObservation,
} from "./risk-gate-v2-energy-commodities-module-state";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function loadLatestExtractionManifest(asOfIso: string) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_source_release_manifests")
    .select(
      "release_id,dataset_version,retrieved_at,coverage_end,write_completed,metadata",
    )
    .eq("source_id", "usgs_mcs")
    .eq("write_completed", true)
    .lte("coverage_end", asOfIso)
    .order("coverage_end", { ascending: false })
    .order("retrieved_at", { ascending: false })
    .limit(10);

  if (result.error) throw result.error;

  for (const row of result.data ?? []) {
    const metadata = asRecord(row.metadata);
    if (
      metadata.methodology_scope !== RISK_GATE_V2_USGS_EXTRACTION_SCOPE ||
      metadata.source_file_sha256 !== RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256
    ) {
      continue;
    }

    return {
      release_id: String(row.release_id),
      dataset_version:
        typeof row.dataset_version === "string" ? row.dataset_version : null,
      retrieved_at: String(row.retrieved_at),
      coverage_end:
        typeof row.coverage_end === "string" ? row.coverage_end : null,
      write_completed: row.write_completed === true,
      metadata,
    } satisfies RiskGateV2UsqsExtractionManifest;
  }

  return null;
}

async function loadSeriesObservations(input: {
  manifest: RiskGateV2UsqsExtractionManifest;
  commodity: string;
}) {
  const series = findRiskGateV2UsqsExtractionSeries(
    input.manifest,
    input.commodity,
  );
  if (!series) return null;

  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_observations")
    .select(
      "country_iso3,commodity,value_numeric,unit,observed_at,quality_status,commercial_eligibility_status,provenance",
    )
    .eq("source_id", "usgs_mcs")
    .eq("quality_status", "VERIFIED")
    .eq("commercial_eligibility_status", "VERIFIED")
    .eq("commodity", series.commodity)
    .eq("observed_at", series.observed_at)
    .limit(1_000);

  if (result.error) throw result.error;

  const expectedHashes = new Set(series.source_row_hashes);
  const observations: RiskGateV2UsqsExtractionObservation[] = [];

  for (const row of result.data ?? []) {
    const provenance = asRecord(row.provenance);
    const sourceFileHash =
      typeof provenance.source_file_sha256 === "string"
        ? provenance.source_file_sha256
        : null;
    const sourceRowHash =
      typeof provenance.source_row_sha256 === "string"
        ? provenance.source_row_sha256
        : null;

    // This is the hard legacy-data boundary. Old MCS rows did not carry the
    // pinned file hash/source-row hash and therefore cannot enter v2 scoring.
    if (
      sourceFileHash !== RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256 ||
      !sourceRowHash ||
      !expectedHashes.has(sourceRowHash)
    ) {
      continue;
    }

    const value = Number(row.value_numeric);
    const observedAt =
      typeof row.observed_at === "string" ? row.observed_at : "";
    const commodity = typeof row.commodity === "string" ? row.commodity : "";
    if (
      !commodity ||
      canonicalRiskGateV2Commodity(commodity) !==
        canonicalRiskGateV2Commodity(series.commodity) ||
      !Number.isFinite(value) ||
      value < 0 ||
      Number.isNaN(new Date(observedAt).getTime())
    ) {
      continue;
    }

    const iso3 =
      typeof row.country_iso3 === "string"
        ? row.country_iso3.trim().toUpperCase()
        : null;
    if (iso3 !== null && !/^[A-Z]{3}$/.test(iso3)) continue;

    observations.push({
      country_iso3: iso3,
      commodity,
      value_numeric: value,
      unit: typeof row.unit === "string" ? row.unit : null,
      observed_at: observedAt,
      section:
        typeof provenance.section === "string" ? provenance.section : null,
      statistic:
        typeof provenance.statistic === "string" ? provenance.statistic : null,
      detail:
        typeof provenance.statistic_detail === "string"
          ? provenance.statistic_detail
          : null,
      source_file_sha256: sourceFileHash,
      source_row_sha256: sourceRowHash,
      aggregate_bucket:
        typeof provenance.aggregate_bucket === "string"
          ? provenance.aggregate_bucket
          : null,
    });
  }

  return observations;
}

export async function generateRiskGateV2EnergyCommoditiesModuleState(input: {
  commodity: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const asOf = new Date(input.as_of);
  if (Number.isNaN(asOf.getTime())) {
    throw new Error("Risk Gate v2 energy/commodities as_of must be valid");
  }

  const manifest = await loadLatestExtractionManifest(asOf.toISOString());
  if (!manifest) return null;
  const observations = await loadSeriesObservations({
    manifest,
    commodity: input.commodity,
  });
  if (!observations) return null;

  return buildRiskGateV2EnergyCommoditiesModuleState({
    commodity: input.commodity,
    observations,
    manifest,
    generated_at: input.generated_at ?? new Date().toISOString(),
    commercial_eligibility_status: "VERIFIED",
    risk_object_ids: input.risk_object_ids,
  });
}
