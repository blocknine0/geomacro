import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  buildOrthogonalEventResidual,
} from "../src/lib/country-risk-v02-event-residual";

import {
  buildEventReliability,
} from "../src/lib/country-risk-v02-event-reliability";

import {
  allocateReliabilityAwareWeights,
} from "../src/lib/country-risk-v02-reliability-weighting";


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


function round(
  value: number,
) {
  return Math.round(
    value *
    1000,
  ) /
    1000;
}


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


  const object =
    run.object;


  const reliability =
    buildEventReliability(
      run.context
        .base_object,
    );


  const macroAvailable =
    object
      .macro_component
      .weighted_observed_risk !==
    null;


  const geoAvailable =
    object
      .geopolitics_component
      .weighted_observed_risk !==
    null;


  const allocation =
    allocateReliabilityAwareWeights({
      event_reliability:
        reliability
          .reliability_factor,

      event_available:
        reliability
          .available,

      macro_available:
        macroAvailable,

      geopolitics_available:
        geoAvailable,
    });


  if (
    !allocation
      .composite_available
  ) {
    rows.push({
      country:
        iso3,

      reliability:
        reliability
          .reliability_factor,

      event_weight:
        allocation
          .effective_weights
          .event,

      residual_event:
        null,

      event_part:
        null,

      macro_part:
        null,

      geo_part:
        null,

      diagnostic_score:
        null,

      status:
        "FAIL_CLOSED",
    });

    continue;
  }


  const residual =
    buildOrthogonalEventResidual({
      object:
        run.context
          .base_object,

      macro_component_available:
        macroAvailable,

      geopolitics_component_available:
        geoAvailable,

      critical_minerals_component_available:
        false,
    });


  const weights =
    allocation
      .effective_weights;


  const eventPart =
    residual
      .residual_event_score *
    weights.event;


  const macroPart =
    (
      object
        .macro_component
        .weighted_observed_risk ??
      0
    ) *
    weights.macro *
    object
      .macro_component
      .confidence_factor;


  const geoPart =
    (
      object
        .geopolitics_component
        .weighted_observed_risk ??
      0
    ) *
    weights.geopolitics *
    object
      .geopolitics_component
      .confidence_factor;


  const diagnostic =
    eventPart +
    macroPart +
    geoPart;


  rows.push({
    country:
      iso3,

    reliability:
      reliability
        .reliability_factor,

    event_weight:
      weights.event,

    residual_event:
      round(
        residual
          .residual_event_score,
      ),

    event_part:
      round(
        eventPart,
      ),

    macro_part:
      round(
        macroPart,
      ),

    geo_part:
      round(
        geoPart,
      ),

    diagnostic_score:
      round(
        diagnostic,
      ),

    status:
      reliability
        .status,
  });
}


console.log(
  "===== DYNAMIC SCORE DIAGNOSTIC =====",
);

console.table(
  rows,
);


console.log(
  "PASS: RELIABILITY + ORTHOGONAL RESIDUAL DIAGNOSTIC COMPLETE",
);

console.log(
  "NOTE: THIS DOES NOT MODIFY GRO v0.2 PRODUCTION CALCULATION",
);
