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
  buildOrthogonalEventResidual,
} from "../src/lib/country-risk-v02-event-residual";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const PRIOR = {
  event:
    0.70,

  macro:
    0.15,

  geopolitics:
    0.15,
} as const;


function round(
  value: number,
  places = 6,
) {
  const factor =
    10 ** places;

  return Math.round(
    (value + Number.EPSILON) *
      factor,
  ) /
    factor;
}


const rows = [];


for (
  const [
    iso3,
    name,
  ] of [
    ["IND", "India"],
    ["USA", "United States"],
    ["CHN", "China"],
    ["DEU", "Germany"],
    ["BRA", "Brazil"],
    ["ZAF", "South Africa"],
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


  if (
    !eventReliability.available
  ) {
    rows.push({
      country:
        iso3,

      final_score:
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
        envelope.macro.available,

      geopolitics_component_available:
        envelope
          .geopolitics
          .available,

      critical_minerals_component_available:
        false,
    });


  const eventMass =
    PRIOR.event *
    envelope
      .event
      .reliability_factor;


  const macroMass =
    PRIOR.macro *
    envelope
      .macro
      .reliability_factor;


  const geoMass =
    PRIOR.geopolitics *
    envelope
      .geopolitics
      .reliability_factor;


  const totalMass =
    eventMass +
    macroMass +
    geoMass;


  if (
    totalMass <=
    0
  ) {
    throw new Error(
      `${iso3}: no reliability-adjusted component mass`,
    );
  }


  const eventWeight =
    eventMass /
    totalMass;


  const macroWeight =
    macroMass /
    totalMass;


  const geoWeight =
    geoMass /
    totalMass;


  const eventPart =
    residual
      .residual_event_score *
    eventWeight;


  const macroPart =
    (
      run.object
        .macro_component
        .weighted_observed_risk ??
      0
    ) *
    macroWeight;


  const geoPart =
    (
      run.object
        .geopolitics_component
        .weighted_observed_risk ??
      0
    ) *
    geoWeight;


  const score =
    eventPart +
    macroPart +
    geoPart;


  rows.push({
    country:
      iso3,

    event_rel:
      envelope
        .event
        .reliability_factor,

    macro_rel:
      envelope
        .macro
        .reliability_factor,

    geo_rel:
      envelope
        .geopolitics
        .reliability_factor,

    event_weight:
      round(
        eventWeight,
      ),

    macro_weight:
      round(
        macroWeight,
      ),

    geo_weight:
      round(
        geoWeight,
      ),

    event_part:
      round(
        eventPart,
        3,
      ),

    macro_part:
      round(
        macroPart,
        3,
      ),

    geo_part:
      round(
        geoPart,
        3,
      ),

    final_score:
      round(
        score,
        3,
      ),

    status:
      "DIAGNOSTIC",
  });
}


console.log(
  "===== COMPONENT-RELIABILITY WEIGHT DIAGNOSTIC =====",
);

console.table(
  rows,
);


console.log(
  "PASS: COMPONENT-RELIABILITY WEIGHT DIAGNOSTIC COMPLETE",
);

console.log(
  "NOTE: NO PRODUCTION CALCULATION MODIFIED",
);
