import {
  buildMacroNormalizationSnapshot,
  type MacroNormalizationInput,
} from "./country-risk-v02-normalization";
import {
  buildRiskGateV2WorldBankPpgSovereignFiscalModuleState,
  WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
  type WorldBankPpgSourceProof,
} from "./risk-gate-v2-world-bank-ppg-sovereign-fiscal";
import { requireRiskSupabase } from "./risk-supabase.server";

const SOURCE_ID = "world_bank_indicators" as const;
const MANIFEST_KIND = "WORLD_BANK_PPG_GNI_DERIVED_V1";
const SEMANTIC_BOUNDARY =
  "PUBLIC_AND_PUBLICLY_GUARANTEED_EXTERNAL_DEBT_STOCK_PRESSURE_NOT_TOTAL_GOVERNMENT_DEBT";

function freshnessStatus(observedAt: string | null, asOf: string) {
  if (!observedAt) return "UNKNOWN" as const;
  const observed = new Date(observedAt);
  const evaluation = new Date(asOf);
  if (Number.isNaN(observed.getTime()) || Number.isNaN(evaluation.getTime())) {
    return "UNKNOWN" as const;
  }
  const ageDays = Math.max(
    0,
    (evaluation.getTime() - observed.getTime()) / 86_400_000,
  );
  if (ageDays <= 400) return "CURRENT" as const;
  if (ageDays <= 800) return "AGING" as const;
  return "STALE" as const;
}

async function assertSourceRegistration() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select(
      "source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,licence_name",
    )
    .eq("source_id", SOURCE_ID)
    .maybeSingle();
  if (result.error) throw result.error;
  const source = result.data;
  if (!source) throw new Error("World Bank source is not registered");
  if (
    source.commercial_usage_status !== "COMMERCIAL_OK" ||
    source.enabled_for_ingestion !== true ||
    source.enabled_for_commercial_signals !== true
  ) {
    throw new Error("World Bank source is not enabled for governed commercial signals");
  }
  return source;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

async function loadCleanPpgManifest(asOf: string) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_source_release_manifests")
    .select(
      "release_id,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,coverage_end,retrieved_at,metadata",
    )
    .eq("source_id", SOURCE_ID)
    .eq("write_completed", true)
    .lte("coverage_end", asOf)
    // World Bank has many governed release manifests. Filter for this exact
    // derived PPG/GNI contract in PostgREST before limiting rows; otherwise a
    // valid older-coverage PPG manifest can be pushed out by newer unrelated
    // World Bank releases and the production fallback silently remains absent.
    .contains("metadata", {
      kind: MANIFEST_KIND,
      metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
      semantic_boundary: SEMANTIC_BOUNDARY,
    })
    .order("coverage_end", { ascending: false })
    .order("retrieved_at", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;

  for (const row of result.data ?? []) {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    if (metadata.kind !== MANIFEST_KIND) continue;
    if (metadata.metric !== WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC) continue;
    if (metadata.semantic_boundary !== SEMANTIC_BOUNDARY) continue;
    if (metadata.same_country_same_year_join_required !== true) continue;
    if (metadata.raw_cross_source_value_pooling_allowed !== false) continue;
    if (metadata.ppg_external_debt_relabelled_as_total_government_debt !== false) continue;
    if (Number(metadata.fixed_peer_minimum ?? 0) !== 20) continue;
    if (
      Number(row.verified_rows ?? 0) < 20 ||
      Number(row.partial_rows ?? 0) !== 0 ||
      Number(row.rejected_rows ?? 0) !== 0 ||
      Number(row.unmapped_rows ?? 0) !== 0 ||
      row.write_completed !== true ||
      !isSha256(row.manifest_hash) ||
      metadata.numerator_indicator !== "DT.DOD.DPPG.CD" ||
      metadata.denominator_indicator !== "NY.GNP.MKTP.CD" ||
      !isSha256(metadata.numerator_response_sha256) ||
      !isSha256(metadata.denominator_response_sha256)
    ) {
      continue;
    }

    const proof: WorldBankPpgSourceProof = {
      numerator_indicator: "DT.DOD.DPPG.CD",
      denominator_indicator: "NY.GNP.MKTP.CD",
      numerator_license: "CC BY-4.0",
      denominator_license: "CC BY-4.0",
      numerator_response_sha256: metadata.numerator_response_sha256,
      denominator_response_sha256: metadata.denominator_response_sha256,
      same_country_same_year_join: true,
      semantic_boundary: SEMANTIC_BOUNDARY,
    };
    return {
      proof,
      release_id: String(row.release_id ?? ""),
      manifest_hash: String(row.manifest_hash),
      verified_rows: Number(row.verified_rows),
    };
  }
  return null;
}

async function buildSnapshot(asOf: string) {
  const db = requireRiskSupabase();
  const rows = await db
    .from("live_world_bank_indicator_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at,provenance")
    .eq("metric", WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC)
    .lte("observed_at", asOf)
    .limit(1000);
  if (rows.error) throw rows.error;

  const observations: MacroNormalizationInput[] = (rows.data ?? [])
    .filter((row) => {
      if (
        typeof row.country_iso3 !== "string" ||
        typeof row.value_numeric !== "number" ||
        !Number.isFinite(row.value_numeric)
      ) {
        return false;
      }
      const provenance =
        row.provenance && typeof row.provenance === "object"
          ? (row.provenance as Record<string, unknown>)
          : {};
      return (
        provenance.derived_metric === WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC &&
        provenance.numerator_indicator === "DT.DOD.DPPG.CD" &&
        provenance.denominator_indicator === "NY.GNP.MKTP.CD" &&
        provenance.same_country_same_year_join_required === true &&
        provenance.semantic_boundary === SEMANTIC_BOUNDARY &&
        isSha256(provenance.numerator_response_sha256) &&
        isSha256(provenance.denominator_response_sha256)
      );
    })
    .map((row) => ({
      country_iso3: String(row.country_iso3).trim().toUpperCase(),
      metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
      value_numeric: Number(row.value_numeric),
      unit: row.unit == null ? null : String(row.unit),
      observed_at: row.observed_at == null ? null : String(row.observed_at),
      freshness_status: freshnessStatus(
        row.observed_at == null ? null : String(row.observed_at),
        asOf,
      ),
    }));

  return buildMacroNormalizationSnapshot({
    metric: WORLD_BANK_PPG_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: asOf,
    observations,
  });
}

/**
 * Production adapter for the source-specific World Bank PPG external-debt
 * pressure sovereign-fiscal fallback. This never mixes PPG values with WDI
 * central-government or Eurostat general-government debt. It is available only
 * after a clean production ingest manifest proves exact inputs, hashes,
 * same-country/same-year joining and the fixed >=20 peer universe.
 */
export async function generateRiskGateV2WorldBankPpgSovereignFiscalModuleState(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  await assertSourceRegistration();
  const manifest = await loadCleanPpgManifest(input.as_of);
  if (!manifest) return null;
  const snapshot = await buildSnapshot(input.as_of);
  return buildRiskGateV2WorldBankPpgSovereignFiscalModuleState({
    country_iso3: input.country_iso3,
    generated_at: input.generated_at ?? new Date().toISOString(),
    snapshot,
    source_proof: manifest.proof,
    risk_object_ids: input.risk_object_ids,
  });
}
