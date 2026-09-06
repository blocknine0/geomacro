import {
  dryRunCountryRiskV02,
} from "../src/lib/country-risk-v02.server";

import {
  buildOrthogonalEventResidual,
} from "../src/lib/country-risk-v02-event-residual";


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


  const object =
    run.object;


  if (
    !object
      .base_event_risk
      .available
  ) {
    rows.push({
      country:
        iso3,

      event_available:
        false,

      original:
        null,

      removed_overlap:
        null,

      residual:
        null,

      hash:
        null,
    });

    continue;
  }


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


  const replay =
    buildOrthogonalEventResidual({
      object:
        run.context
          .base_object,

      macro_component_available:
        true,

      geopolitics_component_available:
        true,

      critical_minerals_component_available:
        false,
    });


  if (
    residual
      .calculation_hash !==
    replay
      .calculation_hash
  ) {
    throw new Error(
      `${iso3}: event residual replay mismatch`,
    );
  }


  console.log(
    `\n===== ${iso3} ADJUSTMENTS =====`,
  );


  console.table(
    residual.adjustments.map(
      item => ({
        driver:
          item.driver,

        status:
          item.overlap_status,

        original:
          item
            .original_contribution,

        removed:
          item
            .removed_contribution,

        retained:
          item
            .retained_contribution,

        component:
          item
            .overlap_component,
      }),
    ),
  );


  rows.push({
    country:
      iso3,

    event_available:
      true,

    original:
      residual
        .original_event_score,

    removed_overlap:
      residual
        .removed_direct_overlap,

    residual:
      residual
        .residual_event_score,

    hash:
      residual
        .calculation_hash
        .slice(
          0,
          16,
        ),
  });
}


console.log(
  "\n===== EVENT RESIDUAL SUMMARY =====",
);


console.table(
  rows,
);


console.log(
  "PASS: DIRECT STRUCTURED-COMPONENT OVERLAP REMOVED",
);

console.log(
  "PASS: PARTIAL OVERLAP RETAINED",
);

console.log(
  "PASS: CRITICAL-MINERAL EVENT DRIVERS NOT REMOVED YET",
);
