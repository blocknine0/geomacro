import {
  buildMacroNormalizationSnapshot,
  type MacroNormalizationInput,
} from "./country-risk-v02-normalization";
import {
  buildRiskGateV2WdiPpgSovereignFiscalModuleState,
  WDI_PPG_SOVEREIGN_FISCAL_METRIC,
} from "./risk-gate-v2-wdi-ppg-sovereign-fiscal";
import { requireRiskSupabase } from "./risk-supabase.server";

const SOURCE_ID = "world_bank_indicators" as const;
const MAX_SOURCE_AGE_DAYS = 800;

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
  if (ageDays <= MAX_SOURCE_AGE_DAYS) return "AGING" as const;
  return "STALE" as const;
}

async function requireOperationalSource() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_sources")
    .select(
      "source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals",
    )
    .eq("source_id", SOURCE_ID)
    .eq("commercial_usage_status", "COMMERCIAL_OK")
    .eq("enabled_for_ingestion", true)
    .eq("enabled_for_commercial_signals", true)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    throw new Error("World Bank WDI source is not operational for commercial signals");
  }
}

async function buildSnapshot(asOf: string) {
  const db = requireRiskSupabase();
  const rows = await db
    .from("live_world_bank_indicator_latest")
    .select("country_iso3,metric,value_numeric,unit,observed_at")
    .eq("metric", WDI_PPG_SOVEREIGN_FISCAL_METRIC)
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
      metric: WDI_PPG_SOVEREIGN_FISCAL_METRIC,
      value_numeric: Number(row.value_numeric),
      unit: row.unit == null ? null : String(row.unit),
      observed_at: row.observed_at == null ? null : String(row.observed_at),
      freshness_status: freshnessStatus(
        row.observed_at == null ? null : String(row.observed_at),
        asOf,
      ),
    }));

  return buildMacroNormalizationSnapshot({
    metric: WDI_PPG_SOVEREIGN_FISCAL_METRIC,
    direction: "HIGHER_IS_HIGHER_RISK",
    as_of: asOf,
    observations,
  });
}

export async function generateRiskGateV2WdiPpgSovereignFiscalModuleState(input: {
  country_iso3: string;
  as_of: string;
  generated_at?: string;
  risk_object_ids?: string[];
}) {
  await requireOperationalSource();
  const snapshot = await buildSnapshot(input.as_of);
  return buildRiskGateV2WdiPpgSovereignFiscalModuleState({
    country_iso3: input.country_iso3,
    generated_at: input.generated_at ?? new Date().toISOString(),
    snapshot,
    risk_object_ids: input.risk_object_ids,
  });
}
