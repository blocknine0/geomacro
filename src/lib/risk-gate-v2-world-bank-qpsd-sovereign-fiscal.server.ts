import {
  buildMacroNormalizationSnapshot,
  type MacroNormalizationInput,
} from "./country-risk-v02-normalization";
import {
  buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState,
  WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC,
  WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC,
  WORLD_BANK_QPSD_PARSER_VERSION,
  type WorldBankQpsdMetric,
  type WorldBankQpsdSourceProof,
} from "./risk-gate-v2-world-bank-qpsd-sovereign-fiscal";
import { requireRiskSupabase } from "./risk-supabase.server";

const SOURCE_ID = "world_bank_qpsd" as const;
const MANIFEST_KIND = "WORLD_BANK_QPSD_SOVEREIGN_FISCAL_V1";
const FIXED_PEER_MINIMUM = 20;

const SERIES = Object.freeze({
  [WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC]: {
    series_id: "DP.DOD.DECT.CR.GG.Z1" as const,
    exact_label:
      "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP" as const,
    government_sector: "GENERAL_GOVERNMENT" as const,
  },
  [WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC]: {
    series_id: "DP.DOD.DECT.CR.CG.Z1" as const,
    exact_label:
      "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP" as const,
    government_sector: "CENTRAL_GOVERNMENT" as const,
  },
});

const PREFERRED_METRICS: readonly WorldBankQpsdMetric[] = [
  WORLD_BANK_QPSD_GENERAL_GOVERNMENT_METRIC,
  WORLD_BANK_QPSD_CENTRAL_GOVERNMENT_METRIC,
];

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function freshnessStatus(observedAt: string | null, asOf: string) {
  if (!observedAt) return "UNKNOWN" as const;
  const observed = new Date(observedAt);
  const evaluation = new Date(asOf);
  if (Number.isNaN(observed.getTime()) || Number.isNaN(evaluation.getTime())) {
    return "UNKNOWN" as const;
  }
  const ageDays = Math.max(0, (evaluation.getTime() - observed.getTime()) / 86_400_000);
  if (ageDays <= 275) return "CURRENT" as const;
  if (ageDays <= 550) return "AGING" as const;
  return "STALE" as const;
}

async function sourceIsEnabledForCommercialScoring() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,licence_name")
    .eq("source_id", SOURCE_ID)
    .maybeSingle();
  if (result.error) throw result.error;
  const source = result.data;
  if (!source) throw new Error("World Bank QPSD source is not registered");

  // Rights, ingestion and licence mismatches are integrity failures and remain
  // fail-closed. Commercial scoring=false is different: the QPSD promotion
  // workflow deliberately uses that state before promotion and after rollback,
  // so it means "optional fallback unavailable" rather than "source corrupt".
  if (
    source.commercial_usage_status !== "COMMERCIAL_OK" ||
    source.enabled_for_ingestion !== true ||
    source.licence_name !== "CC BY 4.0"
  ) {
    throw new Error("World Bank QPSD source-state mismatch for production scoring");
  }

  return source.enabled_for_commercial_signals === true;
}

type CleanManifest = {
  manifest_hash: string;
  release_id: string;
  bulk_file_sha256: string;
  coverage: Record<string, {
    series_id?: unknown;
    government_sector?: unknown;
    fresh_country_count?: unknown;
    peer_universe_eligible?: unknown;
  }>;
};

async function loadCleanManifest(asOf: string): Promise<CleanManifest | null> {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_source_release_manifests")
    .select("release_id,manifest_hash,verified_rows,write_completed,coverage_end,retrieved_at,metadata")
    .eq("source_id", SOURCE_ID)
    .eq("write_completed", true)
    .lte("coverage_end", asOf)
    .contains("metadata", { kind: MANIFEST_KIND, parser_version: WORLD_BANK_QPSD_PARSER_VERSION })
    .order("coverage_end", { ascending: false })
    .order("retrieved_at", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;

  for (const row of result.data ?? []) {
    const metadata = row.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown>
      : {};
    const coverage = metadata.coverage && typeof metadata.coverage === "object"
      ? metadata.coverage as Record<string, {
          series_id?: unknown;
          government_sector?: unknown;
          fresh_country_count?: unknown;
          peer_universe_eligible?: unknown;
        }>
      : {};
    if (metadata.kind !== MANIFEST_KIND) continue;
    if (metadata.source_id !== SOURCE_ID) continue;
    if (metadata.parser_version !== WORLD_BANK_QPSD_PARSER_VERSION) continue;
    if (!isSha256(metadata.bulk_file_sha256) || !isSha256(row.manifest_hash)) continue;
    if (metadata.raw_cross_source_value_pooling_allowed !== false) continue;
    if (metadata.cross_concept_peer_pooling_allowed !== false) continue;
    if (Number(metadata.fixed_peer_minimum ?? 0) !== FIXED_PEER_MINIMUM) continue;
    if (Number(row.verified_rows ?? 0) < FIXED_PEER_MINIMUM) continue;

    return {
      manifest_hash: String(row.manifest_hash),
      release_id: String(row.release_id ?? ""),
      bulk_file_sha256: metadata.bulk_file_sha256,
      coverage,
    };
  }
  return null;
}

async function buildSnapshot(metric: WorldBankQpsdMetric, asOf: string) {
  const db = requireRiskSupabase();
  const expected = SERIES[metric];
  const rows = await db
    .from("live_world_bank_qpsd_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at,provenance")
    .eq("metric", metric)
    .lte("observed_at", asOf)
    .limit(1000);
  if (rows.error) throw rows.error;

  const observations: MacroNormalizationInput[] = (rows.data ?? [])
    .filter((row) => {
      if (
        typeof row.country_iso3 !== "string" ||
        typeof row.value_numeric !== "number" ||
        !Number.isFinite(row.value_numeric)
      ) return false;
      const provenance = row.provenance && typeof row.provenance === "object"
        ? row.provenance as Record<string, unknown>
        : {};
      return (
        provenance.dataset === "Quarterly Public Sector Debt" &&
        provenance.databank_source_id === "3009" &&
        provenance.dataset_catalog_id === "0037906" &&
        provenance.series_id === expected.series_id &&
        provenance.exact_label === expected.exact_label &&
        provenance.government_sector === expected.government_sector &&
        provenance.parser_version === WORLD_BANK_QPSD_PARSER_VERSION &&
        provenance.licence === "CC BY 4.0" &&
        provenance.cross_concept_pooling_allowed === false &&
        provenance.raw_cross_source_pooling_allowed === false &&
        isSha256(provenance.bulk_file_sha256)
      );
    })
    .map((row) => ({
      country_iso3: String(row.country_iso3).trim().toUpperCase(),
      metric,
      value_numeric: Number(row.value_numeric),
      unit: row.unit == null ? null : String(row.unit),
      observed_at: row.observed_at == null ? null : String(row.observed_at),
      freshness_status: freshnessStatus(
        row.observed_at == null ? null : String(row.observed_at),
        asOf,
      ),
    }));

  return buildMacroNormalizationSnapshot({
    metric,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: asOf,
    observations,
  });
}

function sourceProof(metric: WorldBankQpsdMetric, manifest: CleanManifest): WorldBankQpsdSourceProof | null {
  const expected = SERIES[metric];
  const metricCoverage = manifest.coverage[metric];
  if (!metricCoverage) return null;
  if (metricCoverage.series_id !== expected.series_id) return null;
  if (metricCoverage.government_sector !== expected.government_sector) return null;
  if (metricCoverage.peer_universe_eligible !== true) return null;
  if (Number(metricCoverage.fresh_country_count ?? 0) < FIXED_PEER_MINIMUM) return null;
  return {
    source_transport: "official_databank_bulk_csv",
    dataset_classification: "Public",
    dataset_license: "CC BY 4.0",
    parser_version: WORLD_BANK_QPSD_PARSER_VERSION,
    bulk_file_sha256: manifest.bulk_file_sha256,
    series_id: expected.series_id,
    exact_label: expected.exact_label,
    government_sector: expected.government_sector,
    unit: "% of GDP",
    cross_concept_pooling_allowed: false,
    raw_cross_source_pooling_allowed: false,
  };
}

/**
 * Production QPSD fallback. It tries general-government then central-government
 * as independent source-specific peer universes. A missing country in one
 * concept may fall through to the other; raw values and peer distributions are
 * never combined. The function returns at most one sovereign_fiscal state.
 * An intentionally non-promoted or rolled-back QPSD source returns null so the
 * next governed fallback can be evaluated, while rights/integrity mismatches
 * still throw and fail closed.
 */
export async function generateRiskGateV2WorldBankQpsdSovereignFiscalModuleState(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  const sourceEnabled = await sourceIsEnabledForCommercialScoring();
  if (!sourceEnabled) return null;

  const manifest = await loadCleanManifest(input.as_of);
  if (!manifest) return null;

  for (const metric of PREFERRED_METRICS) {
    const proof = sourceProof(metric, manifest);
    if (!proof) continue;
    let snapshot;
    try {
      snapshot = await buildSnapshot(metric, input.as_of);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Insufficient peer coverage for")
      ) continue;
      throw error;
    }
    const state = buildRiskGateV2WorldBankQpsdSovereignFiscalModuleState({
      country_iso3: input.country_iso3,
      generated_at: input.generated_at ?? new Date().toISOString(),
      snapshot,
      source_proof: proof,
      risk_object_ids: input.risk_object_ids,
    });
    if (state) return state;
  }

  return null;
}
