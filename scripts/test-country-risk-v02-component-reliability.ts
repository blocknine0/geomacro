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
        run.object
          .geopolitics_component,
    });


  const replay =
    buildComponentReliabilityEnvelope({
      country_iso3:
        iso3,

      event,

      macro:
        run.object
          .macro_component,

      geopolitics:
        run.object
          .geopolitics_component,
    });


  if (
    envelope
      .calculation_hash !==
    replay
      .calculation_hash
  ) {
    throw new Error(
      `${iso3}: component reliability replay mismatch`,
    );
  }


  rows.push({
    country:
      iso3,

    event_reliability:
      envelope
        .event
        .reliability_factor,

    event_status:
      envelope
        .event
        .status,

    macro_reliability:
      envelope
        .macro
        .reliability_factor,

    macro_status:
      envelope
        .macro
        .status,

    geo_reliability:
      envelope
        .geopolitics
        .reliability_factor,

    geo_status:
      envelope
        .geopolitics
        .status,

    macro_warnings:
      envelope
        .macro
        .warnings
        .join(","),

    geo_warnings:
      envelope
        .geopolitics
        .warnings
        .join(","),

    hash:
      envelope
        .calculation_hash
        .slice(
          0,
          16,
        ),
  });
}


console.log(
  "===== COMPONENT RELIABILITY ENVELOPE =====",
);

console.table(
  rows,
);


console.log(
  "PASS: COMPONENT RELIABILITY ENVELOPE DETERMINISTIC",
);

console.log(
  "PASS: EVENT / MACRO / GEOPOLITICS RELIABILITY EXPOSED",
);
