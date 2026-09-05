import {
  normalizeGeopoliticalMetricPerPopulation,
} from "../src/lib/country-risk-v02-geopolitics";


const clean =
  normalizeGeopoliticalMetricPerPopulation({
    country_iso3:
      "IND",

    metric:
      "forced_displacement_total",

    raw_value:
      223731,

    raw_observed_at:
      "2025-12-31T00:00:00.000Z",

    population:
      1400000000,

    population_observed_at:
      "2025-12-31T00:00:00.000Z",

    freshness_status:
      "CURRENT",

    denominator_freshness_status:
      "CURRENT",
  });


console.log({
  clean,
});


if (
  !clean.score_eligible
) {
  throw new Error(
    "Fresh population-normalized signal unexpectedly blocked",
  );
}


const stale =
  normalizeGeopoliticalMetricPerPopulation({
    country_iso3:
      "IND",

    metric:
      "forced_displacement_total",

    raw_value:
      223731,

    raw_observed_at:
      "2025-12-31T00:00:00.000Z",

    population:
      1400000000,

    population_observed_at:
      "2018-12-31T00:00:00.000Z",

    freshness_status:
      "CURRENT",

    denominator_freshness_status:
      "STALE",
  });


if (
  stale.score_eligible
) {
  throw new Error(
    "Stale population denominator incorrectly score-eligible",
  );
}


console.log(
  "PASS: GEOPOLITICS POPULATION NORMALIZATION FAIL-CLOSED",
);
