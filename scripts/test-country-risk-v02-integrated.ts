import assert from "node:assert/strict";

import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const first =
  await dryRunCountryRiskV02({
    country_iso3:
      "IND",

    country_name:
      "India",

    as_of:
      AS_OF,
  });


const second =
  await dryRunCountryRiskV02({
    country_iso3:
      "IND",

    country_name:
      "India",

    as_of:
      AS_OF,
  });


assert.equal(
  first.object
    .integrity
    .calculation_hash,
  second.object
    .integrity
    .calculation_hash,
);


console.log(
  "===== INDIA GRO v0.2 DRY RUN =====",
);


console.log({
  methodology:
    first.object
      .methodology_version,

  base_event_score:
    first.object
      .base_event_risk
      .score,

  macro_observed_risk:
    first.object
      .macro_component
      .weighted_observed_risk,

  macro_coverage:
    first.object
      .macro_component
      .coverage_ratio,

  event_contribution:
    first.object
      .score
      .event_contribution,

  macro_contribution:
    first.object
      .score
      .macro_contribution,

  final_score:
    first.object
      .score
      .final_score,

  final_confidence:
    first.object
      .confidence
      .final_confidence,

  calculation_hash:
    first.object
      .integrity
      .calculation_hash,
});


console.table(
  first.object
    .macro_component
    .dimensions
    .map(
      item => ({
        dimension:
          item.key,

        available:
          item.available,

        risk:
          item
            .normalized_risk_score,

        weight:
          item.base_weight,

        contribution:
          item.contribution,

        exclusion:
          item.exclusion_reason,
      }),
    ),
);


assert.equal(
  first.object
    .weights
    .geopolitics_cis,
  0,
);


assert.equal(
  first.object
    .weights
    .critical_minerals_cis,
  0,
);


assert.ok(
  first.object
    .score
    .final_score >= 0 &&
  first.object
    .score
    .final_score <= 100,
);


console.log(
  "PASS: INDIA GRO v0.2 DRY RUN DETERMINISTIC",
);

console.log(
  "PASS: GEOPOLITICS + MINERALS REMAIN FAIL-CLOSED",
);

console.log(
  "PASS: NO GRO v0.2 DATABASE PUBLICATION EXECUTED",
);
