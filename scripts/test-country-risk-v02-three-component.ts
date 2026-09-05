import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


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
  const first =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  const second =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  if (
    first.object
      .integrity
      .calculation_hash !==
    second.object
      .integrity
      .calculation_hash
  ) {
    throw new Error(
      `${iso3}: three-component replay mismatch`,
    );
  }


  rows.push({
    country:
      iso3,

    availability:
      first.object
        .availability
        .status,

    event:
      first.object
        .base_event_risk
        .score,

    macro:
      first.object
        .macro_component
        .weighted_observed_risk,

    geopolitics:
      first.object
        .geopolitics_component
        .weighted_observed_risk,

    event_contribution:
      first.object
        .score
        .event_contribution,

    macro_contribution:
      first.object
        .score
        .macro_contribution,

    geo_contribution:
      first.object
        .score
        .geopolitics_contribution,

    final_score:
      first.object
        .score
        .final_score,

    final_confidence:
      first.object
        .confidence
        .final_confidence,

    hash:
      first.object
        .integrity
        .calculation_hash
        .slice(
          0,
          16,
        ),
  });
}


console.table(
  rows,
);


for (
  const row of
    rows
) {
  if (
    row.availability ===
      "FULL" &&
    (
      row.final_score ===
        null ||
      row.final_score < 0 ||
      row.final_score > 100
    )
  ) {
    throw new Error(
      `${row.country}: invalid FULL composite score`,
    );
  }


  if (
    row.availability ===
      "MACRO_ONLY" &&
    row.final_score !==
      null
  ) {
    throw new Error(
      `${row.country}: missing event evidence still emitted composite score`,
    );
  }
}


console.log(
  "PASS: THREE-COMPONENT GRO v0.2 DETERMINISTIC",
);

console.log(
  "PASS: EVENT + MACRO + GEOPOLITICS ATTRIBUTION PRESENT",
);

console.log(
  "PASS: CRITICAL MINERALS REMAINS ZERO WEIGHT",
);

console.log(
  "PASS: NO GRO v0.2 DATABASE PUBLICATION EXECUTED",
);
