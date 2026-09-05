import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  buildEventReliability,
} from "../src/lib/country-risk-v02-event-reliability";

import {
  buildComponentReliabilityEnvelope,
} from "../src/lib/country-risk-v02-component-reliability";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


for (
  const [
    iso3,
    name,
  ] of [
    ["IND", "India"],
    ["USA", "United States"],
    ["CHN", "China"],
    ["DEU", "Germany"],
  ] as const
) {
  const run =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  const geo =
    run.object
      .geopolitics_component;


  console.log(
    `\n===== ${iso3} GEO INFORMATION =====`,
  );


  console.table(
    geo.dimensions.map(
      item => ({
        metric:
          item.metric,

        peers:
          item.peer_count,

        positive_peers:
          item
            .positive_peer_count,

        zero:
          item
            .zero_burden,

        numerator_freshness:
          item
            .numerator_freshness,

        denominator_freshness:
          item
            .denominator_freshness,

        risk:
          item
            .normalized_risk_score,

        available:
          item.available,
      }),
    ),
  );


  const event =
    buildEventReliability(
      run.context
        .base_object,
    );


  const envelope =
    buildComponentReliabilityEnvelope({
      country_iso3:
        iso3,

      event,

      macro:
        run.object
          .macro_component,

      geopolitics:
        geo,
    });


  console.log({
    country:
      iso3,

    geo_reliability:
      envelope
        .geopolitics
        .reliability_factor,

    geo_status:
      envelope
        .geopolitics
        .status,

    coverage:
      envelope
        .geopolitics
        .coverage_factor,

    freshness:
      envelope
        .geopolitics
        .freshness_factor,

    peer_information:
      envelope
        .geopolitics
        .peer_factor,

    warnings:
      envelope
        .geopolitics
        .warnings,
  });


  if (
    envelope
      .geopolitics
      .reliability_factor >=
      0.999999
  ) {
    throw new Error(
      `${iso3}: geopolitics reliability still unrealistically perfect`,
    );
  }
}


console.log(
  "PASS: GEOPOLITICS INFORMATION QUALITY HARDENED",
);

console.log(
  "PASS: ALL-ZERO METRIC DOES NOT CREATE PERFECT RELIABILITY",
);
