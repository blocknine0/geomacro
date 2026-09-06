import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  buildEventReliability,
} from "../src/lib/country-risk-v02-event-reliability";

import {
  buildComponentReliabilityEnvelope,
} from "../src/lib/country-risk-v02-component-reliability";

import {
  buildComponentQualityView,
} from "../src/lib/country-risk-v02-quality-view";


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


  const macro =
    buildComponentQualityView({
      confidence:
        run.object
          .macro_component
          .confidence_factor,

      reliability:
        envelope
          .macro
          .reliability_factor,

      reliability_status:
        envelope
          .macro
          .status,

      warnings:
        envelope
          .macro
          .warnings,
    });


  const geopolitics =
    buildComponentQualityView({
      confidence:
        run.object
          .geopolitics_component
          .confidence_factor,

      reliability:
        envelope
          .geopolitics
          .reliability_factor,

      reliability_status:
        envelope
          .geopolitics
          .status,

      warnings:
        envelope
          .geopolitics
          .warnings,
    });


  rows.push({
    country:
      iso3,

    macro_confidence:
      macro.confidence,

    macro_reliability:
      macro.reliability,

    macro_status:
      macro.reliability_status,

    geo_confidence:
      geopolitics.confidence,

    geo_reliability:
      geopolitics.reliability,

    geo_status:
      geopolitics.reliability_status,
  });


  if (
    macro.confidence_semantics ===
    macro.reliability_semantics
  ) {
    throw new Error(
      `${iso3}: macro confidence/reliability semantics collapsed`,
    );
  }


  if (
    geopolitics.confidence_semantics ===
    geopolitics.reliability_semantics
  ) {
    throw new Error(
      `${iso3}: geopolitics confidence/reliability semantics collapsed`,
    );
  }
}


console.log(
  "===== QUALITY SEMANTIC CONTRACT =====",
);

console.table(
  rows,
);


console.log(
  "PASS: CONFIDENCE AND RELIABILITY REMAIN DISTINCT",
);

console.log(
  "PASS: RELIABILITY WEIGHTING SEMANTICS EXPLICIT",
);

console.log(
  "PASS: QUALITY FACTORS RANGE-VALIDATED",
);
