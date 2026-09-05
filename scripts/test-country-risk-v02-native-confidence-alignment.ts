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
  const run =
    await dryRunCountryRiskV02({
      country_iso3:
        iso3,

      country_name:
        name,

      as_of:
        AS_OF,
    });


  const eventReliability =
    buildEventReliability(
      run.context
        .base_object,
    );


  const envelope =
    buildComponentReliabilityEnvelope({
      country_iso3:
        iso3,

      event:
        eventReliability,

      macro:
        run.object
          .macro_component,

      geopolitics:
        run.object
          .geopolitics_component,
    });


  rows.push({
    country:
      iso3,

    macro_native_confidence:
      run.object
        .macro_component
        .confidence_factor,

    macro_reliability:
      envelope
        .macro
        .reliability_factor,

    macro_gap:
      Math.round(
        (
          run.object
            .macro_component
            .confidence_factor -
          envelope
            .macro
            .reliability_factor
        ) *
        1e6,
      ) /
      1e6,

    geo_native_confidence:
      run.object
        .geopolitics_component
        .confidence_factor,

    geo_reliability:
      envelope
        .geopolitics
        .reliability_factor,

    geo_gap:
      Math.round(
        (
          run.object
            .geopolitics_component
            .confidence_factor -
          envelope
            .geopolitics
            .reliability_factor
        ) *
        1e6,
      ) /
      1e6,
  });
}


console.log(
  "===== NATIVE vs ENVELOPE CONFIDENCE =====",
);

console.table(
  rows,
);


const geoGapExists =
  rows.some(
    row =>
      row.geo_gap >
      0.1,
  );


if (
  !geoGapExists
) {
  throw new Error(
    "Expected geopolitics native/envelope confidence gap not detected",
  );
}


console.log(
  "PASS: NATIVE COMPONENT CONFIDENCE GAP EXPLICIT",
);

console.log(
  "NOTE: NO COMPONENT OBJECT MODIFIED YET",
);
