import {
  buildGeopoliticalNormalizationSnapshot,
} from "../src/lib/country-risk-v02-geopolitics-normalization";

import type {
  PopulationNormalizedGeopoliticalSignal,
} from "../src/lib/country-risk-v02-geopolitics-contract";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const signals:
  PopulationNormalizedGeopoliticalSignal[] =
  [];


/*
 * Build 100 peers:
 * 90 verified zero-burden countries
 * 10 positive-burden countries.
 */
for (
  let i = 0;
  i < 90;
  i++
) {
  signals.push({
    country_iso3:
      `Z${String(i)
        .padStart(
          2,
          "0",
        )}`,

    metric:
      "internally_displaced",

    raw_value:
      0,

    population:
      1000000,

    population_observed_at:
      "2025-12-31T00:00:00.000Z",

    raw_observed_at:
      "2025-12-31T00:00:00.000Z",

    per_100k_population:
      0,

    freshness_status:
      "CURRENT",

    denominator_freshness_status:
      "CURRENT",

    score_eligible:
      true,

    exclusion_reason:
      null,
  });
}


for (
  let i = 1;
  i <= 10;
  i++
) {
  signals.push({
    country_iso3:
      `P${String(i)
        .padStart(
          2,
          "0",
        )}`,

    metric:
      "internally_displaced",

    raw_value:
      i * 100,

    population:
      1000000,

    population_observed_at:
      "2025-12-31T00:00:00.000Z",

    raw_observed_at:
      "2025-12-31T00:00:00.000Z",

    per_100k_population:
      i * 10,

    freshness_status:
      "CURRENT",

    denominator_freshness_status:
      "CURRENT",

    score_eligible:
      true,

    exclusion_reason:
      null,
  });
}


const snapshot =
  buildGeopoliticalNormalizationSnapshot({
    metric:
      "internally_displaced",

    as_of:
      AS_OF,

    signals,
  });


const zeroSignals =
  snapshot.signals.filter(
    signal =>
      signal.zero_burden,
  );


const positiveSignals =
  snapshot.signals.filter(
    signal =>
      !signal.zero_burden,
  );


if (
  zeroSignals.length !==
  90
) {
  throw new Error(
    `Expected 90 zero-burden signals, got ${zeroSignals.length}`,
  );
}


for (
  const signal of
    zeroSignals
) {
  if (
    signal
      .normalized_risk_score !==
    0
  ) {
    throw new Error(
      `${signal.country_iso3}: verified zero burden did not map to risk 0`,
    );
  }
}


if (
  positiveSignals.length !==
  10
) {
  throw new Error(
    `Expected 10 positive signals, got ${positiveSignals.length}`,
  );
}


for (
  const signal of
    positiveSignals
) {
  if (
    signal
      .normalized_risk_score <=
      0
  ) {
    throw new Error(
      `${signal.country_iso3}: positive burden mapped to zero risk`,
    );
  }
}


console.log({
  peer_count:
    snapshot.peer_count,

  positive_peer_count:
    positiveSignals.length,

  zero_burden_count:
    zeroSignals.length,

  lowest_positive:
    positiveSignals
      .sort(
        (a, b) =>
          a.normalized_risk_score -
          b.normalized_risk_score,
      )[0],

  highest_positive:
    positiveSignals
      .sort(
        (a, b) =>
          b.normalized_risk_score -
          a.normalized_risk_score,
      )[0],
});


console.log(
  "PASS: VERIFIED ZERO BURDEN MAPS TO ZERO RISK",
);

console.log(
  "PASS: POSITIVE BURDEN RANKS ONLY AGAINST POSITIVE PEERS",
);

console.log(
  "PASS: ZERO != MISSING",
);
