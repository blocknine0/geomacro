import { createHash } from "node:crypto";

import type { RiskGateV2CommercialEligibilityStatus } from "./risk-gate-v2-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const RISK_GATE_V2_CRITICAL_MINERAL_SUPPLY_METHOD_VERSION =
  "risk-gate-v2-critical-mineral-supply-0.1.0" as const;

export const RISK_GATE_V2_CRITICAL_MINERAL_SUPPLY_TTL_MS =
  14 * 24 * 60 * 60 * 1000;

export type RiskGateV2CriticalMineralObservation = {
  country_iso3: string;
  commodity: string;
  metric: string;
  value_numeric: number;
  unit: string | null;
  observed_at: string;
  statistic: string | null;
};

export type RiskGateV2CriticalMineralManifest = {
  release_id: string;
  dataset_version: string | null;
  retrieved_at: string;
  coverage_end: string | null;
  write_completed: boolean;
  metadata: Record<string, unknown>;
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function canonicalCommodity(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashJson(value: unknown) {
  function canonicalize(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    }
    return item;
  }

  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function finiteNonNegative(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function manifestNumber(manifest: RiskGateV2CriticalMineralManifest, key: string) {
  return finiteNonNegative(manifest.metadata[key]);
}

function assertCleanGlobalProductionManifest(
  manifest: RiskGateV2CriticalMineralManifest,
) {
  if (!manifest.write_completed) return false;

  const globalRelease = manifest.metadata.global_release;
  const productionRows = manifestNumber(manifest, "production_source_rows");
  const productionNormalized = manifestNumber(
    manifest,
    "production_normalized_rows",
  );
  const productionUnmapped = manifestNumber(
    manifest,
    "production_unmapped_rows",
  );
  const productionNonNumeric = manifestNumber(
    manifest,
    "production_non_numeric_rows",
  );

  return (
    globalRelease === true &&
    productionRows !== null &&
    productionRows > 0 &&
    productionNormalized !== null &&
    productionNormalized > 0 &&
    productionUnmapped === 0 &&
    productionNonNumeric === 0
  );
}

function productionObservation(row: RiskGateV2CriticalMineralObservation) {
  const statistic = String(row.statistic ?? "").trim().toLowerCase();
  const metric = row.metric.trim().toLowerCase();
  if (statistic) {
    return statistic.includes("production") && !statistic.includes("capacity");
  }
  return metric.includes("production") && !metric.includes("capacity");
}

function freshnessConfidence(observedAt: string, generatedAt: Date) {
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return 0;
  const ageDays = Math.max(
    0,
    (generatedAt.getTime() - observed.getTime()) / 86_400_000,
  );
  if (ageDays <= 550) return 1;
  if (ageDays <= 900) return 0.7;
  return 0;
}

function scoreCommodity(input: {
  commodity: string;
  observations: RiskGateV2CriticalMineralObservation[];
  manifest: RiskGateV2CriticalMineralManifest;
  generated_at: Date;
}) {
  if (!assertCleanGlobalProductionManifest(input.manifest)) return null;

  const commodity = canonicalCommodity(input.commodity);
  if (!commodity) throw new Error("Critical-mineral commodity is required");

  const eligible = input.observations
    .filter((row) => canonicalCommodity(row.commodity) === commodity)
    .filter(productionObservation)
    .filter((row) => /^[A-Z]{3}$/.test(row.country_iso3.trim().toUpperCase()))
    .filter((row) => Number.isFinite(row.value_numeric) && row.value_numeric >= 0)
    .filter((row) => !Number.isNaN(new Date(row.observed_at).getTime()));

  if (eligible.length === 0) return null;

  const latestObservedMs = Math.max(
    ...eligible.map((row) => new Date(row.observed_at).getTime()),
  );
  const latestObservedAt = new Date(latestObservedMs).toISOString();
  const releaseRows = eligible.filter(
    (row) => new Date(row.observed_at).getTime() === latestObservedMs,
  );

  const units = new Set(
    releaseRows.map((row) => (row.unit ?? "").trim().toLowerCase()),
  );
  if (units.size !== 1 || units.has("")) return null;

  const byCountry = new Map<string, number>();
  for (const row of releaseRows) {
    const iso3 = row.country_iso3.trim().toUpperCase();
    byCountry.set(iso3, (byCountry.get(iso3) ?? 0) + row.value_numeric);
  }

  const producers = [...byCountry.entries()]
    .filter(([, value]) => value > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  if (producers.length === 0) return null;

  const total = producers.reduce((sum, [, value]) => sum + value, 0);
  if (!(total > 0)) return null;

  const shares = producers.map(([country_iso3, value]) => ({
    country_iso3,
    value,
    share: value / total,
  }));
  const topShare = Math.max(...shares.map((item) => item.share));
  const hhi = shares.reduce((sum, item) => sum + item.share ** 2, 0);

  // Concentration is the only promoted scope in v0.1.0. Top-producer share
  // captures single-country dependency, while HHI captures broader producer
  // concentration. This is deliberately not a commodity price forecast.
  const score = round6(clamp((0.6 * topShare + 0.4 * hhi) * 100, 0, 100));
  const freshness = freshnessConfidence(latestObservedAt, input.generated_at);
  if (freshness === 0) return null;

  const producerBreadthConfidence = clamp(producers.length / 10, 0.5, 1);
  const confidence = round6(freshness * producerBreadthConfidence);

  const identity = {
    methodology_version: RISK_GATE_V2_CRITICAL_MINERAL_SUPPLY_METHOD_VERSION,
    commodity,
    manifest_release_id: input.manifest.release_id,
    manifest_dataset_version: input.manifest.dataset_version,
    observed_at: latestObservedAt,
    unit: [...units][0],
    producers: shares,
    top_share: round6(topShare),
    hhi: round6(hhi),
    score,
  };

  return {
    score,
    confidence,
    latestObservedAt,
    producerCount: producers.length,
    identityHash: hashJson(identity),
    driverContribution: score,
  };
}

export function buildRiskGateV2EnergyCommoditiesModuleState(input: {
  commodity: string;
  observations: RiskGateV2CriticalMineralObservation[];
  manifest: RiskGateV2CriticalMineralManifest;
  generated_at: string;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  previous_observations?: RiskGateV2CriticalMineralObservation[] | null;
  previous_manifest?: RiskGateV2CriticalMineralManifest | null;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const generatedAt = new Date(input.generated_at);
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("generated_at must be a valid timestamp");
  }

  const current = scoreCommodity({
    commodity: input.commodity,
    observations: input.observations,
    manifest: input.manifest,
    generated_at: generatedAt,
  });
  if (!current) return null;

  const previous =
    input.previous_observations && input.previous_manifest
      ? scoreCommodity({
          commodity: input.commodity,
          observations: input.previous_observations,
          manifest: input.previous_manifest,
          generated_at: generatedAt,
        })
      : null;

  const previousScore = previous?.score ?? null;
  const delta =
    previousScore === null ? null : round6(current.score - previousScore);
  const commodity = canonicalCommodity(input.commodity).replace(/\s+/g, "_");

  return {
    module_state_id: [
      "rgv2",
      "commodity",
      commodity,
      "energy_commodities",
      current.identityHash.slice(0, 24),
      generatedAt.getTime().toString(36),
    ].join(":"),
    module: "energy_commodities",
    score: current.score,
    previous_score: previousScore,
    delta,
    confidence: current.confidence,
    coverage: "LIMITED",
    commercial_eligibility_status: input.commercial_eligibility_status,
    generated_at: generatedAt.toISOString(),
    expires_at: new Date(
      generatedAt.getTime() + RISK_GATE_V2_CRITICAL_MINERAL_SUPPLY_TTL_MS,
    ).toISOString(),
    methodology_version: RISK_GATE_V2_CRITICAL_MINERAL_SUPPLY_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers: [
      {
        driver: "critical_mineral_disruption",
        score_contribution: current.driverContribution,
        delta_contribution: delta,
        confidence: current.confidence,
      },
    ],
  };
}
