import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


for (
  const [
    iso3,
    name,
  ] of [
    ["IND", "India"],
    ["USA", "United States"],
    ["CHN", "China"],
    ["DEU", "Germany"],
  ] as const
) {
  const result =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  const object =
    result.object;


  const reconstructed =
    (
      object
        .score
        .event_contribution ??
      0
    ) +
    (
      object
        .score
        .macro_contribution ??
      0
    ) +
    (
      object
        .score
        .geopolitics_contribution ??
      0
    );


  const rounded =
    Math.round(
      reconstructed *
      1000,
    ) /
    1000;


  console.log({
    country:
      iso3,

    reconstructed:
      rounded,

    final:
      object
        .score
        .final_score,
  });


  if (
    rounded !==
    object
      .score
      .final_score
  ) {
    throw new Error(
      `${iso3}: attribution reconciliation failed`,
    );
  }
}


console.log(
  "PASS: THREE-COMPONENT ATTRIBUTION RECONCILES",
);
