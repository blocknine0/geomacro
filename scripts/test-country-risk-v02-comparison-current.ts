import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  compareCountryRiskV01V02,
} from "../src/lib/country-risk-v02-comparison";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const countries = [
  ["IND", "India"],
  ["USA", "United States"],
  ["CHN", "China"],
  ["DEU", "Germany"],
  ["BRA", "Brazil"],
  ["ZAF", "South Africa"],
] as const;


const rows = [];


for (
  const [
    country_iso3,
    country_name,
  ] of countries
) {
  const run =
    await dryRunCountryRiskV02({
      country_iso3,
      country_name,
      as_of:
        AS_OF,
    });


  const comparison =
    compareCountryRiskV01V02(
      run.object,
    );


  rows.push({
    country:
      country_iso3,

    available:
      comparison
        .comparison_available,

    v01:
      comparison
        .v01_score,

    v02:
      comparison
        .v02_score,

    delta:
      comparison
        .total_delta,

    event_effect:
      comparison
        .attribution
        .event_reweighting_effect,

    macro_effect:
      comparison
        .attribution
        .macro_effect,

    geo_effect:
      comparison
        .attribution
        .geopolitics_effect,

    reconcile:
      comparison
        .attribution
        .reconciliation_delta,

    exclusion:
      comparison
        .exclusion_reason,

    hash:
      comparison
        .calculation_hash
        .slice(
          0,
          16,
        ),
  });
}


console.log(
  "===== CURRENT GRO v0.1 vs v0.2 COMPARISON =====",
);

console.table(
  rows,
);


for (
  const row of rows
) {
  if (
    [
      "IND",
      "USA",
      "CHN",
      "DEU",
    ].includes(
      row.country,
    )
  ) {
    if (
      !row.available
    ) {
      throw new Error(
        `${row.country}: comparison unexpectedly unavailable`,
      );
    }


    if (
      row.v01 === null ||
      row.v02 === null ||
      row.delta === null
    ) {
      throw new Error(
        `${row.country}: available comparison contains null score`,
      );
    }


    if (
      Math.abs(
        row.reconcile ??
        999,
      ) >
      0.001
    ) {
      throw new Error(
        `${row.country}: attribution does not reconcile`,
      );
    }
  }


  if (
    [
      "BRA",
      "ZAF",
    ].includes(
      row.country,
    )
  ) {
    if (
      row.available
    ) {
      throw new Error(
        `${row.country}: unavailable composite exposed comparison`,
      );
    }


    if (
      row.v02 !==
        null ||
      row.delta !==
        null
    ) {
      throw new Error(
        `${row.country}: fail-closed comparison emitted score/delta`,
      );
    }
  }
}


console.log(
  "PASS: CURRENT THREE-COMPONENT COMPARISON RECONCILES",
);

console.log(
  "PASS: BRA/ZAF COMPARISON REMAINS FAIL-CLOSED",
);
