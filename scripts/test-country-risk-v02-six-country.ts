import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  determineCompositeAvailability,
} from "../src/lib/country-risk-v02-availability";


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
    country_iso3,
    country_name,
  ] of countries
) {
  const result =
    await dryRunCountryRiskV02({
      country_iso3,
      country_name,
      as_of:
        AS_OF,
    });


  const object =
    result.object;


  const macroAvailable =
    object
      .macro_component
      .weighted_observed_risk !==
        null &&
    object
      .macro_component
      .confidence_factor >
        0;


  const availability =
    determineCompositeAvailability({
      event_available:
        object
          .base_event_risk
          .available,

      macro_available:
        macroAvailable,
    });


  if (
    !availability
      .composite_score_available &&
    object
      .score
      .final_score !==
      null
  ) {
    throw new Error(
      `${country_iso3}: unavailable composite emitted numeric score`,
    );
  }


  if (
    availability.status ===
      "FULL" &&
    object
      .score
      .final_score ===
      null
  ) {
    throw new Error(
      `${country_iso3}: FULL composite unexpectedly null`,
    );
  }


  rows.push({
    country:
      country_iso3,

    availability:
      availability.status,

    event_available:
      object
        .base_event_risk
        .available,

    event_score:
      object
        .base_event_risk
        .score,

    event_confidence:
      object
        .base_event_risk
        .confidence,

    macro_available:
      macroAvailable,

    macro_risk:
      object
        .macro_component
        .weighted_observed_risk,

    macro_coverage:
      object
        .macro_component
        .coverage_ratio,

    final_score:
      object
        .score
        .final_score,

    final_confidence:
      object
        .confidence
        .final_confidence,

    hash:
      object
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
  const country of [
    "BRA",
    "ZAF",
  ]
) {
  const row =
    rows.find(
      item =>
        item.country ===
        country,
    );

  if (
    !row
  ) {
    throw new Error(
      `${country}: result missing`,
    );
  }

  if (
    row.availability !==
      "MACRO_ONLY"
  ) {
    throw new Error(
      `${country}: expected MACRO_ONLY, got ${row.availability}`,
    );
  }

  if (
    row.final_score !==
      null
  ) {
    throw new Error(
      `${country}: macro-only state emitted composite score`,
    );
  }
}


console.log(
  "PASS: SIX-COUNTRY AVAILABILITY REGRESSION CLEAN",
);

console.log(
  "PASS: BRA/ZAF MACRO DATA RETAINED WITHOUT FALSE COMPOSITE",
);
