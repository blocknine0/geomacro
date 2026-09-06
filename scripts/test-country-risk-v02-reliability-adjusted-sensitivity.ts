import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  buildOrthogonalEventResidual,
} from "../src/lib/country-risk-v02-event-residual";

import {
  buildEventReliability,
} from "../src/lib/country-risk-v02-event-reliability";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


const candidates = [
  {
    id:
      "70_15_15",
    event:
      0.70,
    macro:
      0.15,
    geo:
      0.15,
  },

  {
    id:
      "75_15_10",
    event:
      0.75,
    macro:
      0.15,
    geo:
      0.10,
  },

  {
    id:
      "65_20_15",
    event:
      0.65,
    macro:
      0.20,
    geo:
      0.15,
  },
] as const;


const countries = [
  ["IND", "India"],
  ["USA", "United States"],
  ["CHN", "China"],
  ["DEU", "Germany"],
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


  const object =
    run.object;


  const reliability =
    buildEventReliability(
      run.context
        .base_object,
    );


  const residual =
    buildOrthogonalEventResidual({
      object:
        run.context
          .base_object,

      macro_component_available:
        object
          .macro_component
          .weighted_observed_risk !==
        null,

      geopolitics_component_available:
        object
          .geopolitics_component
          .weighted_observed_risk !==
        null,

      critical_minerals_component_available:
        false,
    });


  for (
    const candidate of
      candidates
  ) {
    /*
     * Diagnostic only.
     *
     * Reliability-adjusted event contribution shows
     * sensitivity if evidence quality is allowed to
     * modulate the event component.
     *
     * This DOES NOT modify the actual GRO engine.
     */
    const eventPart =
      residual
        .residual_event_score *
      candidate.event *
      reliability
        .reliability_factor;


    const macroPart =
      (
        object
          .macro_component
          .weighted_observed_risk ??
        0
      ) *
      candidate.macro *
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
      candidate.geo *
      object
        .geopolitics_component
        .confidence_factor;


    const score =
      eventPart +
      macroPart +
      geoPart;


    rows.push({
      country:
        iso3,

      candidate:
        candidate.id,

      residual_event:
        Math.round(
          residual
            .residual_event_score *
          1000,
        ) /
        1000,

      event_reliability:
        reliability
          .reliability_factor,

      reliability_status:
        reliability
          .status,

      event_part:
        Math.round(
          eventPart *
          1000,
        ) /
        1000,

      macro_part:
        Math.round(
          macroPart *
          1000,
        ) /
        1000,

      geo_part:
        Math.round(
          geoPart *
          1000,
        ) /
        1000,

      diagnostic_score:
        Math.round(
          score *
          1000,
        ) /
        1000,
    });
  }
}


console.log(
  "===== RELIABILITY-ADJUSTED DIAGNOSTIC =====",
);

console.table(
  rows,
);


console.log(
  "PASS: RELIABILITY-ADJUSTED SENSITIVITY GENERATED",
);

console.log(
  "NOTE: DIAGNOSTIC ONLY; GRO CALCULATION UNCHANGED",
);
