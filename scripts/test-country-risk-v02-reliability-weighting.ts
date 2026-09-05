import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

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


  const reliability =
    buildEventReliability(
      run.context
        .base_object,
    );


  const macroAvailable =
    run.object
      .macro_component
      .weighted_observed_risk !==
    null;


  const geoAvailable =
    run.object
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


  const weights =
    allocation
      .effective_weights;


  const weightTotal =
    weights.event +
    weights.macro +
    weights.geopolitics;


  if (
    allocation
      .composite_available &&
    Math.abs(
      weightTotal - 1,
    ) >
      1e-6
  ) {
    throw new Error(
      `${iso3}: effective weights do not reconcile`,
    );
  }


  rows.push({
    country:
      iso3,

    reliability:
      reliability
        .reliability_factor,

    reliability_status:
      reliability
        .status,

    event_weight:
      weights.event,

    macro_weight:
      weights.macro,

    geo_weight:
      weights.geopolitics,

    removed_event_weight:
      allocation
        .removed_event_weight,

    redistribution:
      allocation
        .redistribution_status,

    composite_available:
      allocation
        .composite_available,

    total:
      Math.round(
        weightTotal *
        1e6,
      ) /
      1e6,
  });
}


console.log(
  "===== RELIABILITY-AWARE WEIGHT ALLOCATION =====",
);

console.table(
  rows,
);


const china =
  rows.find(
    row =>
      row.country ===
      "CHN",
  );


const india =
  rows.find(
    row =>
      row.country ===
      "IND",
  );


const usa =
  rows.find(
    row =>
      row.country ===
      "USA",
  );


if (
  !china ||
  !india ||
  !usa
) {
  throw new Error(
    "Required country rows missing",
  );
}


if (
  china.event_weight >=
    india.event_weight
) {
  throw new Error(
    "China concentrated evidence did not reduce event weight",
  );
}


if (
  china.event_weight >=
    usa.event_weight
) {
  throw new Error(
    "China concentrated evidence did not reduce event weight versus USA",
  );
}


for (
  const country of [
    "BRA",
    "ZAF",
  ]
) {
  const row =
    rows.find(
      item =>
        item.country ===
        country,
    );


  if (
    !row ||
    row
      .composite_available !==
      false
  ) {
    throw new Error(
      `${country}: fail-closed composite semantics changed`,
    );
  }
}


console.log(
  "PASS: RELIABILITY-AWARE ALLOCATION DETERMINISTIC",
);

console.log(
  "PASS: CONCENTRATED EVENT EVIDENCE REDUCES EVENT WEIGHT",
);

console.log(
  "PASS: REMOVED EVENT WEIGHT REDISTRIBUTED TO STRUCTURED COMPONENTS",
);

console.log(
  "PASS: BRA/ZAF REMAIN FAIL-CLOSED",
);
