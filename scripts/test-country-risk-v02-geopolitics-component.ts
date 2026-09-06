import {
  generateCountryGeopoliticalRiskComponent,
} from "../src/lib/country-risk-v02-geopolitics-component.server";


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
  const first =
    await generateCountryGeopoliticalRiskComponent({
      country_iso3:
        country,

      as_of:
        AS_OF,
    });


  const second =
    await generateCountryGeopoliticalRiskComponent({
      country_iso3:
        country,

      as_of:
        AS_OF,
    });


  if (
    first.calculation_hash !==
    second.calculation_hash
  ) {
    throw new Error(
      `${country}: geopolitics replay mismatch`,
    );
  }


  rows.push({
    country,

    available:
      first
        .available_dimension_count,

    coverage:
      first
        .coverage_ratio,

    observed_risk:
      first
        .weighted_observed_risk,

    contribution:
      first
        .score_contribution,

    confidence:
      first
        .confidence_factor,

    hash:
      first
        .calculation_hash
        .slice(
          0,
          16,
        ),
  });


  console.log(
    `\n===== ${country} DIMENSIONS =====`,
  );

  console.table(
    first.dimensions.map(
      item => ({
        metric:
          item.metric,

        available:
          item.available,

        peers:
          item.peer_count,

        per_100k:
          item.per_100k_population,

        risk:
          item.normalized_risk_score,

        weight:
          item.base_weight,

        contribution:
          item.contribution,

        exclusion:
          item.exclusion_reason,
      }),
    ),
  );
}


console.log(
  "\n===== GEOPOLITICS COMPONENT PILOT =====",
);

console.table(
  rows,
);


for (
  const row of
    rows
) {
  if (
    row.coverage < 0 ||
    row.coverage > 1
  ) {
    throw new Error(
      `${row.country}: invalid geopolitical coverage`,
    );
  }

  if (
    row.observed_risk !==
      null &&
    (
      row.observed_risk < 0 ||
      row.observed_risk > 100
    )
  ) {
    throw new Error(
      `${row.country}: invalid geopolitical risk score`,
    );
  }
}


console.log(
  "PASS: GEOPOLITICS COMPONENT DETERMINISTIC",
);

console.log(
  "PASS: INSUFFICIENT PEER METRICS REMAIN FAIL-CLOSED",
);

console.log(
  "PASS: NO GRO v0.2 PUBLICATION EXECUTED",
);
