import assert from "node:assert/strict";

import {
  buildCountryMacroRiskComponent,
} from "../src/lib/country-risk-v02-macro";


const component =
  buildCountryMacroRiskComponent({
    country_iso3:
      "ZZZ",

    as_of:
      "2026-09-05T15:31:27.104Z",

    snapshots: {},
  });


console.log(
  "===== MISSING MACRO SAFETY =====",
);

console.log(component);


assert.equal(
  component.available_dimension_count,
  0,
);


assert.equal(
  component.coverage_ratio,
  0,
);


assert.equal(
  component.weighted_observed_risk,
  null,
);


assert.equal(
  component.score_contribution,
  0,
);


assert.equal(
  component.confidence_factor,
  0,
);


console.log(
  "PASS: MISSING MACRO DOES NOT CREATE FALSE RISK SIGNAL",
);
