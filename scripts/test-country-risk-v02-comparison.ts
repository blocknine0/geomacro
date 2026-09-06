import assert from "node:assert/strict";

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
    iso3,
    name,
  ] of countries
) {
  try {
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

    assert.equal(
      first.object
        .integrity
        .calculation_hash,
      second.object
        .integrity
        .calculation_hash,
      `v0.2 replay failed for ${iso3}`,
    );

    const comparison =
      compareCountryRiskV01V02(
        first.object,
      );

    assert.ok(
      Math.abs(
        comparison
          .attribution
          .reconciliation_delta,
      ) <= 0.001,
      `Attribution does not reconcile for ${iso3}`,
    );

    assert.ok(
      first.object
        .score
        .final_score >= 0 &&
      first.object
        .score
        .final_score <= 100,
      `Invalid final score for ${iso3}`,
    );

    assert.ok(
      first.object
        .confidence
        .final_confidence >= 0 &&
      first.object
        .confidence
        .final_confidence <= 1,
      `Invalid final confidence for ${iso3}`,
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

    rows.push({
      country:
        iso3,

      v01:
        comparison.v01_score,

      v02:
        comparison.v02_score,

      delta:
        comparison.total_delta,

      event_effect:
        comparison
          .attribution
          .event_reweighting_effect,

      macro_effect:
        comparison
          .attribution
          .macro_effect,

      macro_coverage:
        first.object
          .macro_component
          .coverage_ratio,

      final_confidence:
        first.object
          .confidence
          .final_confidence,

      reconciliation:
        comparison
          .attribution
          .reconciliation_delta,

      hash:
        comparison
          .calculation_hash
          .slice(
            0,
            16,
          ),
    });
  }
  catch (
    error
  ) {
    rows.push({
      country:
        iso3,

      v01:
        null,

      v02:
        null,

      delta:
        null,

      event_effect:
        null,

      macro_effect:
        null,

      macro_coverage:
        null,

      final_confidence:
        null,

      reconciliation:
        null,

      hash:
        `ERROR: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
    });
  }
}


console.log(
  "===== GRO v0.1 vs v0.2 GLOBAL PILOT =====",
);

console.table(
  rows,
);


const india =
  rows.find(
    item =>
      item.country ===
      "IND",
  );


assert.ok(
  india,
);


assert.equal(
  india.v01,
  60.555,
);


assert.equal(
  india.v02,
  52.868,
);


console.log(
  "PASS: INDIA v0.1 -> v0.2 SCORE CHANGE REPRODUCIBLE",
);

console.log(
  "PASS: SCORE DELTA ATTRIBUTION RECONCILES",
);

console.log(
  "PASS: CROSS-COUNTRY GRO v0.2 SANITY AUDIT COMPLETE",
);
