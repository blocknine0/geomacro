import {
  buildMacroNormalizationSnapshot,
  type MacroNormalizationInput,
} from "./country-risk-v02-normalization";
import {
  buildRiskGateV2EurostatSovereignFiscalModuleState,
  EUROSTAT_SOVEREIGN_FISCAL_METRIC,
  type EurostatSovereignFiscalManifestEvidence,
} from "./risk-gate-v2-eurostat-sovereign-fiscal";
import { requireRiskSupabase } from "./risk-supabase.server";

const SOURCE_ID = "eurostat_government_finance" as const;

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

async function loadSourceRegistration(expectedSignalActivation: boolean) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select(
      "source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals",
    )
    .eq("source_id", SOURCE_ID)
    .maybeSingle();

  if (result.error) throw result.error;
  const source = result.data;
  if (!source) throw new Error("Eurostat government-finance source is not registered");
  if (
    source.commercial_usage_status !== "COMMERCIAL_OK" ||
    source.enabled_for_ingestion !== true ||
    source.enabled_for_commercial_signals !== expectedSignalActivation
  ) {
    throw new Error(
      `Eurostat source-state mismatch for ${expectedSignalActivation ? "production scoring" : "shadow validation"}`,
    );
  }
  return source;
}

async function loadCleanManifest(asOf: string) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_source_release_manifests")
    .select(
      "release_id,manifest_hash,verified_rows,partial_rows,rejected_rows,unmapped_rows,write_completed,coverage_end,retrieved_at",
    )
    .eq("source_id", SOURCE_ID)
    .eq("write_completed", true)
    .lte("coverage_end", asOf)
    .order("coverage_end", { ascending: false })
    .order("retrieved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) return null;

  const row = result.data;
  const manifest: EurostatSovereignFiscalManifestEvidence = {
    release_id: String(row.release_id ?? ""),
    manifest_hash: String(row.manifest_hash ?? "").trim().toLowerCase(),
    verified_rows: Number(row.verified_rows ?? 0),
    partial_rows: Number(row.partial_rows ?? 0),
    rejected_rows: Number(row.rejected_rows ?? 0),
    unmapped_rows: Number(row.unmapped_rows ?? 0),
    write_completed: row.write_completed === true,
  };
  return manifest;
}

async function buildSnapshot(asOf: string) {
  const db = requireRiskSupabase();
  const rows = await db
    .from("live_eurostat_government_debt_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at")
    .eq("metric", EUROSTAT_SOVEREIGN_FISCAL_METRIC)
    .lte("observed_at", asOf)
    .limit(1000);

  if (rows.error) throw rows.error;

  const observations: MacroNormalizationInput[] = (rows.data ?? [])
    .filter(
      (row) =>
        typeof row.country_iso3 === "string" &&
        typeof row.value_numeric === "number" &&
        Number.isFinite(row.value_numeric),
    )
    .map((row) => ({
      country_iso3: String(row.country_iso3).trim().toUpperCase(),
      metric: EUROSTAT_SOVEREIGN_FISCAL_METRIC,
      value_numeric: Number(row.value_numeric),
      unit: row.unit == null ? null : String(row.unit),
      observed_at: row.observed_at == null ? null : String(row.observed_at),
      freshness_status: freshnessStatus(
        row.observed_at == null ? null : String(row.observed_at),
        asOf,
      ),
    }));

  return buildMacroNormalizationSnapshot({
    metric: EUROSTAT_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: asOf,
    observations,
  });
}

async function generate(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
  expected_signal_activation: boolean;
}) {
  await loadSourceRegistration(input.expected_signal_activation);
  const manifest = await loadCleanManifest(input.as_of);
  if (!manifest) return null;
  const snapshot = await buildSnapshot(input.as_of);

  return buildRiskGateV2EurostatSovereignFiscalModuleState({
    country_iso3: input.country_iso3,
    generated_at: input.generated_at ?? new Date().toISOString(),
    snapshot,
    manifest,
    risk_object_ids: input.risk_object_ids,
  });
}

/** Production path. This is intentionally unusable until the source registry
 * has been promoted to enabled_for_commercial_signals=true by a later,
 * evidence-backed migration. */
export async function generateRiskGateV2EurostatSovereignFiscalModuleState(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  return generate({
    ...input,
    expected_signal_activation: true,
  });
}

/** Shadow-validation path used only before production signal activation. */
export async function auditRiskGateV2EurostatSovereignFiscalCandidate(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
}) {
  return generate({
    ...input,
    expected_signal_activation: false,
  });
}
