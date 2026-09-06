import type {
  GeopoliticalMetricKey,
  PopulationNormalizedGeopoliticalSignal,
} from "./country-risk-v02-geopolitics-contract";


function round(
  value: number,
  places = 6,
) {
  const factor =
    10 ** places;

  return Math.round(
    (value + Number.EPSILON) *
      factor,
  ) / factor;
}


export function
normalizeGeopoliticalMetricPerPopulation(
  input: {
    country_iso3:
      string;

    metric:
      GeopoliticalMetricKey;

    raw_value:
      number;

    raw_observed_at:
      string | null;

    population:
      number;

    population_observed_at:
      string;

    freshness_status:
      PopulationNormalizedGeopoliticalSignal[
        "freshness_status"
      ];

    denominator_freshness_status:
      PopulationNormalizedGeopoliticalSignal[
        "denominator_freshness_status"
      ];
  },
): PopulationNormalizedGeopoliticalSignal {
  if (
    !Number.isFinite(
      input.raw_value,
    ) ||
    input.raw_value < 0
  ) {
    throw new Error(
      "Invalid geopolitical raw value",
    );
  }

  if (
    !Number.isFinite(
      input.population,
    ) ||
    input.population <= 0
  ) {
    throw new Error(
      "Invalid population denominator",
    );
  }

  const numeratorFresh =
    input.freshness_status ===
      "CURRENT" ||
    input.freshness_status ===
      "AGING";

  const denominatorFresh =
    input
      .denominator_freshness_status ===
      "CURRENT" ||
    input
      .denominator_freshness_status ===
      "AGING";

  const scoreEligible =
    numeratorFresh &&
    denominatorFresh;

  return {
    country_iso3:
      input.country_iso3,

    metric:
      input.metric,

    raw_value:
      input.raw_value,

    population:
      input.population,

    population_observed_at:
      input.population_observed_at,

    raw_observed_at:
      input.raw_observed_at,

    per_100k_population:
      round(
        (
          input.raw_value /
          input.population
        ) *
          100000,
      ),

    freshness_status:
      input.freshness_status,

    denominator_freshness_status:
      input
        .denominator_freshness_status,

    score_eligible:
      scoreEligible,

    exclusion_reason:
      scoreEligible
        ? null
        : "stale_or_missing_population_normalization",
  };
}
