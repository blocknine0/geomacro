import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  normalizeGeopoliticalMetricPerPopulation,
} from "./country-risk-v02-geopolitics";

import type {
  GeopoliticalMetricKey,
} from "./country-risk-v02-geopolitics-contract";


function freshnessStatus(
  observedAt:
    string | null,
  asOf:
    string,
) {
  if (!observedAt) {
    return "UNKNOWN" as const;
  }

  const observed =
    new Date(
      observedAt
    );

  const evaluation =
    new Date(
      asOf
    );

  if (
    Number.isNaN(
      observed.getTime()
    ) ||
    Number.isNaN(
      evaluation.getTime()
    )
  ) {
    return "UNKNOWN" as const;
  }

  const ageDays =
    Math.max(
      0,
      (
        evaluation.getTime() -
        observed.getTime()
      ) /
        86_400_000
    );

  if (
    ageDays <= 400
  ) {
    return "CURRENT" as const;
  }

  if (
    ageDays <= 800
  ) {
    return "AGING" as const;
  }

  return "STALE" as const;
}


export async function
generatePopulationNormalizedGeopoliticalSignal(
  input: {
    country_iso3:
      string;

    metric:
      GeopoliticalMetricKey;

    as_of:
      string;
  },
) {
  const db =
    requireRiskSupabase();

  const iso3 =
    input.country_iso3
      .trim()
      .toUpperCase();


  const numerator =
    await db
      .from(
        "live_external_observations"
      )
      .select(`
        value_numeric,
        observed_at
      `)
      .eq(
        "country_iso3",
        iso3
      )
      .eq(
        "category",
        "GEOPOLITICS"
      )
      .eq(
        "metric",
        input.metric
      )
      .eq(
        "quality_status",
        "VERIFIED"
      )
      .eq(
        "commercial_eligibility_status",
        "VERIFIED"
      )
      .lte(
        "observed_at",
        input.as_of
      )
      .order(
        "observed_at",
        {
          ascending: false,
        }
      )
      .limit(
        1
      )
      .maybeSingle();


  if (
    numerator.error
  ) {
    throw numerator.error;
  }


  const denominator =
    await db
      .from(
        "live_external_observations"
      )
      .select(`
        value_numeric,
        observed_at
      `)
      .eq(
        "country_iso3",
        iso3
      )
      .eq(
        "source_id",
        "world_bank_indicators"
      )
      .eq(
        "metric",
        "population_total"
      )
      .eq(
        "quality_status",
        "VERIFIED"
      )
      .eq(
        "commercial_eligibility_status",
        "VERIFIED"
      )
      .lte(
        "observed_at",
        input.as_of
      )
      .order(
        "observed_at",
        {
          ascending: false,
        }
      )
      .limit(
        1
      )
      .maybeSingle();


  if (
    denominator.error
  ) {
    throw denominator.error;
  }


  if (
    !numerator.data ||
    typeof numerator.data
      .value_numeric !==
      "number"
  ) {
    return null;
  }


  if (
    !denominator.data ||
    typeof denominator.data
      .value_numeric !==
      "number" ||
    !denominator.data
      .observed_at
  ) {
    return null;
  }


  return normalizeGeopoliticalMetricPerPopulation({
    country_iso3:
      iso3,

    metric:
      input.metric,

    raw_value:
      numerator.data
        .value_numeric,

    raw_observed_at:
      numerator.data
        .observed_at,

    population:
      denominator.data
        .value_numeric,

    population_observed_at:
      denominator.data
        .observed_at,

    freshness_status:
      freshnessStatus(
        numerator.data
          .observed_at,
        input.as_of
      ),

    denominator_freshness_status:
      freshnessStatus(
        denominator.data
          .observed_at,
        input.as_of
      ),
  });
}
