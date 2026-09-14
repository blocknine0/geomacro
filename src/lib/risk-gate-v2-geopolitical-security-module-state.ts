import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";

export const RISK_GATE_V2_CONFLICT_METHOD_VERSION =
  "risk-gate-v2-ucdp-organized-violence-0.1.0" as const;

export const RISK_GATE_V2_CONFLICT_LOOKBACK_DAYS = 365;
export const RISK_GATE_V2_CONFLICT_SOURCE_MAX_AGE_DAYS = 62;
export const RISK_GATE_V2_CONFLICT_MIN_PEERS = 100;

export type RiskGateV2ConflictCountryInput = {
  country_iso3: string;
  population: number;
  population_observed_at: string;
  verified_event_count: number;
  excluded_event_count: number;
  best_estimate_deaths: number;
};

export type RiskGateV2ConflictSnapshotInput = {
  as_of: string;
  source_retrieved_at: string;
  countries: RiskGateV2ConflictCountryInput[];
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseTimestamp(value: string, label: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return parsed;
}

function ageDays(older: Date, newer: Date) {
  return Math.max(0, (newer.getTime() - older.getTime()) / 86_400_000);
}

function structuralFreshness(observedAt: Date, asOf: Date) {
  const age = ageDays(observedAt, asOf);
  if (age <= 550) return 1;
  if (age <= 900) return 0.8;
  if (age <= 1_200) return 0.6;
  return 0.4;
}

function percentileAmongPositive(values: number[], target: number) {
  if (target <= 0) return 0;
  const positive = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (positive.length === 0) return 0;
  const atOrBelow = positive.filter((value) => value <= target).length;
  return round6((atOrBelow / positive.length) * 100);
}

function validateCountry(input: RiskGateV2ConflictCountryInput) {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("Conflict module country must use ISO3");
  }
  if (!Number.isFinite(input.population) || input.population <= 0) {
    throw new Error(`Conflict module population is invalid for ${iso3}`);
  }
  for (const [label, value] of [
    ["verified_event_count", input.verified_event_count],
    ["excluded_event_count", input.excluded_event_count],
    ["best_estimate_deaths", input.best_estimate_deaths],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Conflict module ${label} is invalid for ${iso3}`);
    }
  }
  return iso3;
}

function scoreSnapshot(snapshot: RiskGateV2ConflictSnapshotInput) {
  const asOf = parseTimestamp(snapshot.as_of, "as_of");
  const sourceRetrievedAt = parseTimestamp(
    snapshot.source_retrieved_at,
    "source_retrieved_at",
  );

  const seen = new Set<string>();
  const normalized = snapshot.countries.map((country) => {
    const iso3 = validateCountry(country);
    if (seen.has(iso3)) {
      throw new Error(`Duplicate conflict country ${iso3}`);
    }
    seen.add(iso3);

    const populationObservedAt = parseTimestamp(
      country.population_observed_at,
      `population_observed_at:${iso3}`,
    );
    const fatalityRate =
      (country.best_estimate_deaths / country.population) * 100_000;
    const eventRate =
      (country.verified_event_count / country.population) * 1_000_000;

    return {
      ...country,
      country_iso3: iso3,
      population_observed_at: populationObservedAt,
      fatality_rate_per_100k: fatalityRate,
      event_rate_per_million: eventRate,
    };
  });

  if (normalized.length < RISK_GATE_V2_CONFLICT_MIN_PEERS) {
    return null;
  }

  const fatalityRates = normalized.map((item) => item.fatality_rate_per_100k);
  const eventRates = normalized.map((item) => item.event_rate_per_million);

  const byCountry = new Map(
    normalized.map((item) => {
      const fatalityPercentile = percentileAmongPositive(
        fatalityRates,
        item.fatality_rate_per_100k,
      );
      const eventPercentile = percentileAmongPositive(
        eventRates,
        item.event_rate_per_million,
      );
      const score = round6(
        fatalityPercentile * 0.75 + eventPercentile * 0.25,
      );

      const totalRows = item.verified_event_count + item.excluded_event_count;
      const qualityConfidence =
        totalRows === 0 ? 1 : item.verified_event_count / totalRows;
      const populationConfidence = structuralFreshness(
        item.population_observed_at,
        asOf,
      );
      const sourceAge = ageDays(sourceRetrievedAt, asOf);
      const sourceConfidence =
        sourceAge <= 35 ? 1 : sourceAge <= 62 ? 0.8 : 0;
      const peerConfidence = clamp(
        normalized.length / RISK_GATE_V2_CONFLICT_MIN_PEERS,
        0,
        1,
      );

      return [
        item.country_iso3,
        {
          score,
          confidence: round6(
            qualityConfidence *
              populationConfidence *
              sourceConfidence *
              peerConfidence,
          ),
          fatality_percentile: fatalityPercentile,
          event_percentile: eventPercentile,
          verified_event_count: item.verified_event_count,
          excluded_event_count: item.excluded_event_count,
        },
      ] as const;
    }),
  );

  return {
    as_of: asOf,
    source_retrieved_at: sourceRetrievedAt,
    by_country: byCountry,
  };
}

export function buildRiskGateV2GeopoliticalSecurityModuleState(input: {
  country_iso3: string;
  current: RiskGateV2ConflictSnapshotInput;
  previous?: RiskGateV2ConflictSnapshotInput | null;
  generated_at: string;
  risk_object_ids?: string[];
}): RiskGateV2ModuleStateInput | null {
  const iso3 = input.country_iso3.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error("Risk Gate v2 conflict module requires a valid country ISO3");
  }

  const current = scoreSnapshot(input.current);
  if (!current) return null;
  const currentCountry = current.by_country.get(iso3);
  if (!currentCountry) return null;

  const generatedAt = parseTimestamp(input.generated_at, "generated_at");
  const sourceValidUntil = new Date(
    current.source_retrieved_at.getTime() +
      RISK_GATE_V2_CONFLICT_SOURCE_MAX_AGE_DAYS * 86_400_000,
  );
  if (sourceValidUntil.getTime() <= generatedAt.getTime()) {
    return null;
  }

  const previous = input.previous ? scoreSnapshot(input.previous) : null;
  const previousScore = previous?.by_country.get(iso3)?.score ?? null;
  const delta =
    previousScore === null ? null : round6(currentCountry.score - previousScore);

  return {
    module_state_id: [
      "rgv2",
      iso3,
      "geopolitical_security",
      current.source_retrieved_at.getTime().toString(36),
      generatedAt.getTime().toString(36),
    ].join(":"),
    module: "geopolitical_security",
    score: currentCountry.score,
    previous_score: previousScore,
    delta,
    confidence: currentCountry.confidence,
    // This first production method covers organized-violence exposure only.
    // Coups, protests, elections, territorial disputes and diplomatic signals
    // remain separate promotion work, so broad geopolitical coverage is LIMITED.
    coverage: "LIMITED",
    commercial_eligibility_status: "VERIFIED",
    generated_at: generatedAt.toISOString(),
    expires_at: sourceValidUntil.toISOString(),
    methodology_version: RISK_GATE_V2_CONFLICT_METHOD_VERSION,
    risk_object_ids: [...new Set(input.risk_object_ids ?? [])].sort(),
    drivers: [
      {
        driver: "military_escalation",
        score_contribution: currentCountry.score,
        delta_contribution: delta,
        confidence: currentCountry.confidence,
      },
    ],
  };
}
