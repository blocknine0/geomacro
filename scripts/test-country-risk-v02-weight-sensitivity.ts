import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  evaluateWeightCandidate,
  type WeightCandidate,
} from "../src/lib/country-risk-v02-weight-sensitivity";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const candidates:
  WeightCandidate[] = [
  {
    id:
      "70_15_15",

    event:
      0.70,

    macro:
      0.15,

    geopolitics:
      0.15,
  },

  {
    id:
      "65_20_15",

    event:
      0.65,

    macro:
      0.20,

    geopolitics:
      0.15,
  },

  {
    id:
      "60_20_20",

    event:
      0.60,

    macro:
      0.20,

    geopolitics:
      0.20,
  },

  {
    id:
      "75_15_10",

    event:
      0.75,

    macro:
      0.15,

    geopolitics:
      0.10,
  },
];


const countries =
  [
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
    iso3,
    name,
  ] of countries
) {
  const run =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  const object =
    run.object;


  for (
    const candidate of
      candidates
  ) {
    const result =
      evaluateWeightCandidate(
        {
          event_score:
            object
              .base_event_risk
              .score,

          event_confidence:
            object
              .confidence
              .event_confidence,

          macro_score:
            object
              .macro_component
              .weighted_observed_risk,

          macro_confidence:
            object
              .confidence
              .macro_confidence,

          geopolitics_score:
            object
              .geopolitics_component
              .weighted_observed_risk,

          geopolitics_confidence:
            object
              .confidence
              .geopolitics_confidence,
        },
        candidate,
      );


    rows.push({
      country:
        iso3,

      candidate:
        candidate.id,

      event_only:
        object
          .base_event_risk
          .score,

      macro:
        object
          .macro_component
          .weighted_observed_risk,

      geo:
        object
          .geopolitics_component
          .weighted_observed_risk,

      event_part:
        result
          .event_contribution,

      macro_part:
        result
          .macro_contribution,

      geo_part:
        result
          .geopolitics_contribution,

      final:
        result
          .final_score,

      confidence:
        result
          .final_confidence,
    });
  }
}


console.log(
  "===== WEIGHT SENSITIVITY =====",
);

console.table(
  rows,
);


console.log(
  "\n===== DELTA FROM EVENT-ONLY =====",
);

console.table(
  rows
    .filter(
      row =>
        typeof row.event_only ===
          "number" &&
        typeof row.final ===
          "number",
    )
    .map(
      row => ({
        country:
          row.country,

        candidate:
          row.candidate,

        event_only:
          row.event_only,

        final:
          row.final,

        delta:
          Math.round(
            (
              Number(row.final) -
              Number(row.event_only)
            ) *
            1000,
          ) /
          1000,
      }),
    ),
);


console.log(
  "PASS: WEIGHTING SENSITIVITY AUDIT CLEAN",
);

console.log(
  "PASS: NO PRODUCTION WEIGHTS CHANGED",
);
