import {
  generatePopulationNormalizedGeopoliticalSignal,
} from "../src/lib/country-risk-v02-geopolitics.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


for (
  const country of [
    "IND",
    "USA",
    "CHN",
    "DEU",
    "BRA",
    "ZAF",
  ]
) {
  const signal =
    await generatePopulationNormalizedGeopoliticalSignal({
      country_iso3:
        country,

      metric:
        "forced_displacement_total",

      as_of:
        AS_OF,
    });


  console.log({
    country,
    signal,
  });


  if (
    signal &&
    (
      !Number.isFinite(
        signal.per_100k_population
      ) ||
      signal.per_100k_population <
        0
    )
  ) {
    throw new Error(
      `${country}: invalid per-100k geopolitical signal`
    );
  }
}


console.log(
  "PASS: REAL POPULATION-NORMALIZED GEOPOLITICS PILOT CLEAN"
);
