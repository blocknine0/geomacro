import {
  generateCountryMacroRiskComponent,
} from "../src/lib/country-risk-v02-macro.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const countries = [
  "IND",
  "USA",
  "CHN",
  "DEU",
  "BRA",
  "ZAF",
];


const rows = [];


for (
  const country of
    countries
) {
  const component =
    await generateCountryMacroRiskComponent({
      country_iso3:
        country,

      as_of:
        AS_OF,
    });

  rows.push({
    country,

    available:
      component
        .available_dimension_count,

    coverage:
      component
        .coverage_ratio,

    observed_risk:
      component
        .weighted_observed_risk,

    score_contribution:
      component
        .score_contribution,

    confidence:
      component
        .confidence_factor,

    hash:
      component
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
  const row of rows
) {
  if (
    !Number.isFinite(
      row.score_contribution,
    )
  ) {
    throw new Error(
      `Invalid macro score for ${row.country}`,
    );
  }

  if (
    row.coverage < 0 ||
    row.coverage > 1
  ) {
    throw new Error(
      `Invalid coverage for ${row.country}`,
    );
  }
}


console.log(
  "PASS: GLOBAL MACRO COMPONENT PILOT CLEAN",
);
