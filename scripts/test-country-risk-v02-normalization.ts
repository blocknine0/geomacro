import assert from "node:assert/strict";

import {
  generateGlobalMacroNormalization,
} from "../src/lib/country-risk-v02-normalization.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const metrics = [
  "inflation_consumer_prices_annual_pct",
  "real_gdp_growth_annual_pct",
  "unemployment_total_pct",
  "central_government_debt_pct_gdp",
];


for (
  const metric of
    metrics
) {
  console.log(
    `\n===== ${metric} =====`,
  );

  const first =
    await generateGlobalMacroNormalization({
      metric,
      as_of:
        AS_OF,
    });

  const second =
    await generateGlobalMacroNormalization({
      metric,
      as_of:
        AS_OF,
    });

  assert.equal(
    first.calculation_hash,
    second.calculation_hash,
    "Normalization replay must be deterministic",
  );

  const india =
    first.signals.find(
      signal =>
        signal.country_iso3 ===
        "IND",
    );

  console.log({
    peer_count:
      first.peer_count,

    calculation_hash:
      first.calculation_hash,

    india:
      india ?? null,
  });

  console.table(
    first.signals
      .sort(
        (a, b) =>
          b.normalized_risk_score -
          a.normalized_risk_score,
      )
      .slice(
        0,
        10,
      )
      .map(
        signal => ({
          country:
            signal.country_iso3,

          raw:
            signal.raw_value,

          percentile:
            signal.percentile,

          risk:
            signal.normalized_risk_score,
        }),
      ),
  );

  if (
    metric !==
      "central_government_debt_pct_gdp"
  ) {
    assert.ok(
      india,
      `India signal missing for ${metric}`,
    );
  }

  console.log(
    "PASS: deterministic global normalization",
  );
}


console.log(
  "\n========================================",
);

console.log(
  "PASS: GLOBAL MACRO NORMALIZATION SUITE CLEAN",
);

console.log(
  "========================================",
);
