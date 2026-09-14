import { createHash } from "node:crypto";

import type { RiskGateV2CommercialEligibilityStatus } from "./risk-gate-v2-contract";
import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const RISK_GATE_V2_USGS_EXTRACTION_METHOD_VERSION =
  "risk-gate-v2-critical-mineral-extraction-concentration-0.2.0" as const;

export const RISK_GATE_V2_USGS_EXTRACTION_SCOPE =
  "critical_mineral_extraction_concentration_v1" as const;

export const RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256 =
  "582a0aa231aea53d8a97dc8d1cd3dfa5f885cf3760353e3d029d7f0ae4fbaaf5" as const;

export const RISK_GATE_V2_USGS_EXTRACTION_TTL_MS =
  24 * 60 * 60 * 1000;

export type RiskGateV2UsqsExtractionSeriesManifest = {
  commodity_key: string;
  commodity: string;
  series_key: string;
  section: string;
  statistic: string;
  detail: string;
  unit: string;
  observed_at: string;
  source_row_count: number;
  actual_country_count: number;
  positive_actual_producer_count: number;
  residual_bucket_present: boolean;
  source_row_hashes: string[];
  series_hash: string;
};

export type RiskGateV2UsqsExtractionManifest = {
  release_id: string;
  dataset_version: string | null;
  retrieved_at: string;
  coverage_end: string | null;
  write_completed: boolean;
  metadata: {
    methodology_scope?: unknown;
    source_file_sha256?: unknown;
    verified_series?: unknown;
    [key: string]: unknown;
  };
};

export type RiskGateV2UsqsExtractionObservation = {
  country_iso3: string | null;
  commodity: string;
  value_numeric: number;
  unit: string | null;
  observed_at: string;
  section: string | null;
  statistic: string | null;
  detail: string | null;
  source_file_sha256: string | null;
  source_row_sha256: string | null;
  aggregate_bucket: string | null;
};

const COMMODITY_ALIASES: Record<string, string> = {
  graphite: "graphite natural",
  "natural graphite": "graphite natural",
  "rare earth": "rare earths",
  "rare earth elements": "rare earths",
  phosphate: "phosphate rock",
  niobium: "niobium columbium",
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function canonical(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalRiskGateV2Commodity(value: string) {
  const normalized = canonical(value);
  return COMMODITY_ALIASES[normalized] ?? normalized;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function finiteNonNegative(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function sameInstant(left: string, right: string) {
  const a = new Date(left).getTime();
  const b = new Date(right).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function freshnessConfidence(observedAt: string, generatedAt: Date) {
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return 0;
  if (observed.getTime() > generatedAt.getTime()) return 0;
  const ageDays =
    (generatedAt.getTime() - observed.getTime()) / 86_400_000;
  if (ageDays <= 550) return 1;
  if (ageDays <= 900) return 0.7;
  return 0;
}

function isExtractionSeriesManifest(
  value: unknown,
): value is RiskGateV2UsqsExtractionSeriesManifest {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.commodity_key === "string" &&
    typeof row.commodity === "string" &&
    validSha256(row.series_key) &&
    typeof row.section === "string" &&
    typeof row.statistic === "string" &&
    typeof row.detail === "string" &&
    typeof row.unit === "string" &&
    typeof row.observed_at === "string" &&
    Number.isInteger(row.source_row_count) &&
    Number(row.source_row_count) >= 2 &&
    Number.isInteger(row.actual_country_count) &&
    Number(row.actual_country_count) >= 2 &&
    Number.isInteger(row.positive_actual_producer_count) &&
    Number(row.positive_actual_producer_count) >= 2 &&
    typeof row.residual_bucket_present === "boolean" &&
    Array.isArray(row.source_row_hashes) &&
    row.source_row_hashes.length === row.source_row_count &&
    row.source_row_hashes.every(validSha256) &&
    new Set(row.source_row_hashes).size === row.source_row_hashes.length &&
    validSha256(row.series_hash)
  );
}

export function findRiskGateV2UsqsExtractionSeries(
  manifest: RiskGateV2UsqsExtractionManifest,
  commodity: string,
): RiskGateV2UsqsExtractionSeriesManifest | null {
  if (!manifest.write_completed) return null;
  if (
    manifest.metadata.methodology_scope !== RISK_GATE_V2_USGS_EXTRACTION_SCOPE ||
    manifest.metadata.source_file_sha256 !==
      RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256
  ) {
    return null;
  }

  const wanted = canonicalRiskGateV2Commodity(commodity);
  if (!wanted) return null;
  const raw = manifest.metadata.verified_series;
  if (!Array.isArray(raw)) return null;

  const matching = raw
    .filter(isExtractionSeriesManifest)
    .filter(
      (series) => canonicalRiskGateV2Commodity(series.commodity_key) === wanted,
    );
  return matching.length === 1 ? matching[0] : null;
}

function scoreSeries(input: {
  commodity: string;
  observations: RiskGateV2UsqsExtractionObservation[];
  manifest: RiskGateV2UsqsExtractionManifest;
  generated_at: Date;
}) {
  const series = findRiskGateV2UsqsExtractionSeries(
    input.manifest,
    input.commodity,
  );
  if (!series) return null;

  const freshness = freshnessConfidence(series.observed_at, input.generated_at);
  if (freshness === 0) return null;

  const expectedHashes = [...series.source_row_hashes].sort();
  const eligible = input.observations.filter(
    (row) =>
      canonicalRiskGateV2Commodity(row.commodity) ===
      canonicalRiskGateV2Commodity(series.commodity),
  );
  if (eligible.length !== expectedHashes.length) return null;

  const seenHashes = new Set<string>();
  const seenCountries = new Set<string>();
  const actual: Array<{ country_iso3: string; value: number }> = [];
  let residualValue = 0;
  let residualCount = 0;

  for (const row of eligible) {
    if (
      row.source_file_sha256 !== RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256 ||
      !validSha256(row.source_row_sha256) ||
      !expectedHashes.includes(row.source_row_sha256) ||
      seenHashes.has(row.source_row_sha256) ||
      !sameInstant(row.observed_at, series.observed_at) ||
      canonical(row.section) !== canonical(series.section) ||
      canonical(row.statistic) !== canonical(series.statistic) ||
      canonical(row.detail) !== canonical(series.detail) ||
      canonical(row.unit) !== canonical(series.unit)
    ) {
      return null;
    }
    seenHashes.add(row.source_row_sha256);

    const value = finiteNonNegative(row.value_numeric);
    if (value === null) return null;

    if (row.country_iso3 === null) {
      if (row.aggregate_bucket !== "OTHER_COUNTRIES") return null;
      residualCount += 1;
      residualValue += value;
      continue;
    }

    const iso3 = row.country_iso3.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso3) || seenCountries.has(iso3)) return null;
    if (row.aggregate_bucket !== null) return null;
    seenCountries.add(iso3);
    actual.push({ country_iso3: iso3, value });
  }

  if (
    seenHashes.size !== expectedHashes.length ||
    [...seenHashes].sort().some((hash, index) => hash !== expectedHashes[index]) ||
    actual.length !== series.actual_country_count ||
    actual.filter((row) => row.value > 0).length !==
      series.positive_actual_producer_count ||
    residualCount > 1 ||
    series.residual_bucket_present !== (residualCount === 1)
  ) {
    return null;
  }

  const total = actual.reduce((sum, row) => sum + row.value, residualValue);
  if (!(total > 0)) return null;
  const positiveActual = actual.filter((row) => row.value > 0);
  if (positiveActual.length < 2) return null;

  const actualShares = actual.map((row) => ({
    country_iso3: row.country_iso3,
    share: row.value / total,
    value: row.value,
  }));
  const residualShare = residualValue / total;
  const topActualShare = Math.max(...actualShares.map((row) => row.share));

  // The published "Other countries" residual is deliberately retained as one
  // bucket for HHI. That makes the HHI contribution a conservative upper bound
  // because the source does not disclose the residual's internal country split.
  const hhiUpperBound =
    actualShares.reduce((sum, row) => sum + row.share ** 2, 0) +
    residualShare ** 2;
  const score = round6(
    clamp((0.6 * topActualShare + 0.4 * hhiUpperBound) * 100, 0, 100),
  );

  const producerBreadth = clamp(positiveActual.length / 10, 0, 1);
  const residualCertainty = clamp(1 - residualShare, 0.5, 1);
  const confidence = round6(freshness * producerBreadth * residualCertainty);
  if (!(confidence > 0)) return null;

  const calculationIdentity = {
    methodology_version: RISK_GATE_V2_USGS_EXTRACTION_METHOD_VERSION,
    release_id: input.manifest.release_id,
    series_hash: series.series_hash,
    source_file_sha256: RISK_GATE_V2_USGS_MCS_SOURCE_FILE_SHA256,
    observed_at: series.observed_at,
    actual: actualShares.sort((a, b) =>
      a.country_iso3.localeCompare(b.country_iso3),
    ),
    residual_value: residualValue,
    residual_share: round6(residualShare),
    top_actual_share: round6(topActualShare),
    hhi_upper_bound: round6(hhiUpperBound),
    score,
  };

  return {
    score,
    confidence,
    series,
    calculationHash: hashJson(calculationIdentity),
    topActualShare: round6(topActualShare),
    hhiUpperBound: round6(hhiUpperBound),
    residualShare: round6(residualShare),
  };
}

export function buildRiskGateV2EnergyCommoditiesModuleState(input: {
  commodity: string;
  observations: RiskGateV2UsqsExtractionObservation[];
  manifest: RiskGateV2UsqsExtractionManifest;
  generated_at: string;
  commercial_eligibility_status: RiskGateV2CommercialEligibilityStatus;
  previous_observations?: RiskGateV2UsqsExtractionObservation[] | null;
  previous_manifest?: RiskGateV2UsqsExtractionManifest | null;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const generatedAt = new Date(input.generated_at);
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("generated_at must be a valid timestamp");
  }

  const current = scoreSeries({
    commodity: input.commodity,
    observations: input.observations,
    manifest: input.manifest,
    generated_at: generatedAt,
  });
  if (!current) return null;

  const previous =
    input.previous_observations && input.previous_manifest
      ? scoreSeries({
          commodity: input.commodity,
          observations: input.previous_observations,
          manifest: input.previous_manifest,
          generated_at: generatedAt,
        })
      : null;
  const previousScore = previous?.score ?? null;
  const delta =
    previousScore === null ? null : round6(current.score - previousScore);

  const commodityKey = canonicalRiskGateV2Commodity(input.commodity).replace(
    /\s+/g,
    "_",
  );

  return {
    module_state_id: [
      "rgv2",
      "commodity",
      commodityKey,
      "energy_commodities",
      current.calculationHash.slice(0, 24),
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
      generatedAt.getTime() + RISK_GATE_V2_USGS_EXTRACTION_TTL_MS,
    ).toISOString(),
    methodology_version: RISK_GATE_V2_USGS_EXTRACTION_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers: [
      {
        driver: "strategic_commodity_dependency",
        score_contribution: current.score,
        delta_contribution: delta,
        confidence: current.confidence,
      },
    ],
  };
}
