import {
  requireRiskSupabase,
} from "./risk-supabase.server";

import {
  normalizeGeopoliticalMetricPerPopulation,
} from "./country-risk-v02-geopolitics";

import {
  buildGeopoliticalNormalizationSnapshot,
} from "./country-risk-v02-geopolitics-normalization";

import type {
  GeopoliticalMetricKey,
  PopulationNormalizedGeopoliticalSignal,
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
      observedAt,
    );

  const evaluation =
    new Date(
      asOf,
    );

  if (
    Number.isNaN(
      observed.getTime(),
    ) ||
    Number.isNaN(
      evaluation.getTime(),
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
        86_400_000,
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
generateGlobalGeopoliticalNormalization(
  input: {
    metric:
      GeopoliticalMetricKey;

    as_of:
      string;
  },
) {
  const db =
    requireRiskSupabase();


  const numeratorResult =
    await db
      .from(
        "live_external_observations",
      )
      .select(`
        country_iso3,
        value_numeric,
        observed_at
      `)
      .eq(
        "category",
        "GEOPOLITICS",
      )
      .eq(
        "metric",
        input.metric,
      )
      .eq(
        "quality_status",
        "VERIFIED",
      )
      .eq(
        "commercial_eligibility_status",
        "VERIFIED",
      )
      .lte(
        "observed_at",
        input.as_of,
      )
      .limit(
        10000,
      );


  if (
    numeratorResult.error
  ) {
    throw numeratorResult.error;
  }


  const populationResult =
    await db
      .from(
        "live_external_observations",
      )
      .select(`
        country_iso3,
        value_numeric,
        observed_at
      `)
      .eq(
        "source_id",
        "world_bank_indicators",
      )
      .eq(
        "metric",
        "population_total",
      )
      .eq(
        "quality_status",
        "VERIFIED",
      )
      .eq(
        "commercial_eligibility_status",
        "VERIFIED",
      )
      .lte(
        "observed_at",
        input.as_of,
      )
      .limit(
        10000,
      );


  if (
    populationResult.error
  ) {
    throw populationResult.error;
  }


  const latestNumerator =
    new Map<
      string,
      {
        value_numeric:
          number;

        observed_at:
          string | null;
      }
    >();


  for (
    const row of
      numeratorResult.data ??
      []
  ) {
    if (
      typeof row.country_iso3 !==
        "string" ||
      typeof row.value_numeric !==
        "number"
    ) {
      continue;
    }

    const current =
      latestNumerator.get(
        row.country_iso3,
      );

    const currentTime =
      current?.observed_at
        ? new Date(
            current.observed_at,
          ).getTime()
        : 0;

    const nextTime =
      row.observed_at
        ? new Date(
            row.observed_at,
          ).getTime()
        : 0;

    if (
      !current ||
      nextTime >
        currentTime
    ) {
      latestNumerator.set(
        row.country_iso3,
        {
          value_numeric:
            row.value_numeric,

          observed_at:
            row.observed_at,
        },
      );
    }
  }


  const latestPopulation =
    new Map<
      string,
      {
        value_numeric:
          number;

        observed_at:
          string;
      }
    >();


  for (
    const row of
      populationResult.data ??
      []
  ) {
    if (
      typeof row.country_iso3 !==
        "string" ||
      typeof row.value_numeric !==
        "number" ||
      !row.observed_at
    ) {
      continue;
    }

    const current =
      latestPopulation.get(
        row.country_iso3,
      );

    const currentTime =
      current
        ? new Date(
            current.observed_at,
          ).getTime()
        : 0;

    const nextTime =
      new Date(
        row.observed_at,
      ).getTime();

    if (
      !current ||
      nextTime >
        currentTime
    ) {
      latestPopulation.set(
        row.country_iso3,
        {
          value_numeric:
            row.value_numeric,

          observed_at:
            row.observed_at,
        },
      );
    }
  }


  const signals:
    PopulationNormalizedGeopoliticalSignal[] =
    [];


  for (
    const [
      countryIso3,
      numerator,
    ] of latestNumerator
      .entries()
  ) {
    const population =
      latestPopulation.get(
        countryIso3,
      );

    if (!population) {
      continue;
    }

    signals.push(
      normalizeGeopoliticalMetricPerPopulation({
        country_iso3:
          countryIso3,

        metric:
          input.metric,

        raw_value:
          numerator
            .value_numeric,

        raw_observed_at:
          numerator
            .observed_at,

        population:
          population
            .value_numeric,

        population_observed_at:
          population
            .observed_at,

        freshness_status:
          freshnessStatus(
            numerator
              .observed_at,
            input.as_of,
          ),

        denominator_freshness_status:
          freshnessStatus(
            population
              .observed_at,
            input.as_of,
          ),
      }),
    );
  }


  return buildGeopoliticalNormalizationSnapshot({
    metric:
      input.metric,

    as_of:
      input.as_of,

    signals,
  });
}
