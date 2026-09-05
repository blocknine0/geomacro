import assert from "node:assert/strict";

import {
  generateCountryMacroRiskComponent,
} from "../src/lib/country-risk-v02-macro.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const first =
  await generateCountryMacroRiskComponent({
    country_iso3:
      "IND",

    as_of:
      AS_OF,
  });


const second =
  await generateCountryMacroRiskComponent({
    country_iso3:
      "IND",

    as_of:
      AS_OF,
  });


assert.equal(
  first.calculation_hash,
  second.calculation_hash,
  "Macro component replay must be deterministic",
);


console.log(
  "===== INDIA MACRO COMPONENT v0.2 =====",
);

console.log({
  methodology_version:
    first.methodology_version,

  country:
    first.country_iso3,

  available_dimensions:
    first.available_dimension_count,

  total_dimensions:
    first.total_dimension_count,

  coverage_ratio:
    first.coverage_ratio,

  weighted_observed_risk:
    first.weighted_observed_risk,

  score_contribution:
    first.score_contribution,

  confidence_factor:
    first.confidence_factor,

  calculation_hash:
    first.calculation_hash,
});


console.table(
  first.dimensions.map(
    item => ({
      dimension:
        item.key,

      available:
        item.available,

      peer_count:
        item.peer_count,

      normalized_risk:
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


assert.equal(
  first.available_dimension_count,
  3,
  "India should have 3 usable macro dimensions at frozen pilot timestamp",
);


const debt =
  first.dimensions.find(
    item =>
      item.key ===
      "government_debt",
  );


assert.ok(
  debt,
);


assert.equal(
  debt.available,
  false,
);


assert.equal(
  debt.exclusion_reason,
  "insufficient_peer_universe",
);


assert.equal(
  first.coverage_ratio,
  0.75,
);


assert.ok(
  first.weighted_observed_risk !==
    null,
);


assert.ok(
  first.score_contribution >=
    0 &&
  first.score_contribution <=
    100,
);


console.log(
  "PASS: INDIA MACRO COMPONENT DETERMINISTIC",
);

console.log(
  "PASS: MISSING DEBT WEIGHT NOT REDISTRIBUTED",
);
