import {
  generateGlobalGeopoliticalNormalization,
} from "../src/lib/country-risk-v02-geopolitics-normalization.server";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const metrics = [
  "forced_displacement_total",
  "refugees_origin",
  "asylum_seekers_origin",
  "internally_displaced",
  "stateless_population",
] as const;


for (
  const metric of
    metrics
) {
  const snapshot =
    await generateGlobalGeopoliticalNormalization({
      metric,
      as_of:
        AS_OF,
    });


  const zero =
    snapshot.signals.filter(
      signal =>
        signal.zero_burden,
    );


  const positive =
    snapshot.signals.filter(
      signal =>
        !signal.zero_burden,
    );


  console.log(
    `\n===== ${metric} =====`,
  );


  console.log({
    peer_count:
      snapshot.peer_count,

    zero_burden_count:
      zero.length,

    positive_burden_count:
      positive.length,

    zero_share:
      Math.round(
        zero.length /
          snapshot.peer_count *
          10000,
      ) /
      100,
  });


  if (
    zero.some(
      signal =>
        signal
          .normalized_risk_score !==
        0,
    )
  ) {
    throw new Error(
      `${metric}: verified zero burden has non-zero risk`,
    );
  }


  console.table(
    [
      "IND",
      "USA",
      "CHN",
      "DEU",
      "BRA",
      "ZAF",
    ]
      .map(
        country =>
          snapshot.signals.find(
            signal =>
              signal.country_iso3 ===
              country,
          ),
      )
      .filter(Boolean)
      .map(
        signal => ({
          country:
            signal!
              .country_iso3,

          per_100k:
            signal!
              .per_100k_population,

          zero:
            signal!
              .zero_burden,

          percentile:
            signal!
              .percentile,

          risk:
            signal!
              .normalized_risk_score,

          peers:
            signal!
              .peer_count,

          positive_peers:
            signal!
              .positive_peer_count,
        }),
      ),
  );


  const replay =
    await generateGlobalGeopoliticalNormalization({
      metric,
      as_of:
        AS_OF,
    });


  if (
    replay
      .calculation_hash !==
    snapshot
      .calculation_hash
  ) {
    throw new Error(
      `${metric}: deterministic replay mismatch`,
    );
  }


  console.log(
    "PASS: zero-aware geopolitical distribution deterministic",
  );
}


console.log(
  "\nPASS: GLOBAL ZERO-AWARE GEOPOLITICS DISTRIBUTION CLEAN",
);
