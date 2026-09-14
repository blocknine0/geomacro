import { requireRiskSupabase } from "./risk-supabase.server";
import {
  buildRiskGateV2EnergyCommoditiesModuleState,
  type RiskGateV2CriticalMineralManifest,
  type RiskGateV2CriticalMineralObservation,
} from "./risk-gate-v2-energy-commodities-module-state";

async function loadLatestCleanManifest(asOfIso: string) {
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
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) return null;

  return {
    release_id: String(result.data.release_id),
    dataset_version:
      typeof result.data.dataset_version === "string"
        ? result.data.dataset_version
        : null,
    retrieved_at: String(result.data.retrieved_at),
    coverage_end:
      typeof result.data.coverage_end === "string"
        ? result.data.coverage_end
        : null,
    write_completed: result.data.write_completed === true,
    metadata:
      result.data.metadata && typeof result.data.metadata === "object"
        ? (result.data.metadata as Record<string, unknown>)
        : {},
  } satisfies RiskGateV2CriticalMineralManifest;
}

async function loadCommodityObservations(input: {
  commodity: string;
  as_of: string;
}) {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_external_observations")
    .select(
      "country_iso3,commodity,metric,value_numeric,unit,observed_at,provenance",
    )
    .eq("source_id", "usgs_mcs")
    .eq("quality_status", "VERIFIED")
    .eq("commercial_eligibility_status", "VERIFIED")
    .lte("observed_at", input.as_of)
    .not("commodity", "is", null)
    .limit(20_000);

  if (result.error) throw result.error;

  const wanted = input.commodity.trim().toLowerCase();
  const observations: RiskGateV2CriticalMineralObservation[] = [];

  for (const row of result.data ?? []) {
    const commodity = typeof row.commodity === "string" ? row.commodity : "";
    if (commodity.trim().toLowerCase() !== wanted) continue;

    const iso3 =
      typeof row.country_iso3 === "string"
        ? row.country_iso3.trim().toUpperCase()
        : "";
    const metric = typeof row.metric === "string" ? row.metric : "";
    const numeric = Number(row.value_numeric);
    const observedAt =
      typeof row.observed_at === "string" ? row.observed_at : "";
    const provenance =
      row.provenance && typeof row.provenance === "object"
        ? (row.provenance as Record<string, unknown>)
        : {};

    if (
      !/^[A-Z]{3}$/.test(iso3) ||
      !metric ||
      !Number.isFinite(numeric) ||
      numeric < 0 ||
      Number.isNaN(new Date(observedAt).getTime())
    ) {
      continue;
    }

    observations.push({
      country_iso3: iso3,
      commodity,
      metric,
      value_numeric: numeric,
      unit: typeof row.unit === "string" ? row.unit : null,
      observed_at: observedAt,
      statistic:
        typeof provenance.statistic === "string" ? provenance.statistic : null,
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

  const manifest = await loadLatestCleanManifest(asOf.toISOString());
  if (!manifest) return null;

  const observations = await loadCommodityObservations({
    commodity: input.commodity,
    as_of: asOf.toISOString(),
  });

  return buildRiskGateV2EnergyCommoditiesModuleState({
    commodity: input.commodity,
    observations,
    manifest,
    generated_at: input.generated_at ?? new Date().toISOString(),
    commercial_eligibility_status: "VERIFIED",
    risk_object_ids: input.risk_object_ids,
  });
}
