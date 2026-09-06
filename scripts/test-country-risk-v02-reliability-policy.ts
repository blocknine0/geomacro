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


/*
 * Comparison baseline only.
 * No production policy change.
 */
const FIXED = {
  event: 0.70,
  macro: 0.15,
  geopolitics: 0.15,
} as const;


function round(
  value: number,
  places = 3,
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
  ] of countries
) {
  const run =
    await dryRunCountryRiskV02({
      country_iso3: iso3,
      country_name: name,
      as_of: AS_OF,
    });


  const object =
    run.object;


  const reliability =
    buildEventReliability(
      run.context.base_object,
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


  if (
    !reliability.available
  ) {
    rows.push({
      country: iso3,
      reliability:
        reliability.reliability_factor,
      status:
        reliability.status,
      residual_event: null,
      fixed_score: null,
      weight_modifier_score: null,
      confidence_modifier_score: null,
      weight_minus_fixed: null,
      confidence_minus_fixed: null,
    });

    continue;
  }


  const residual =
    buildOrthogonalEventResidual({
      object:
        run.context.base_object,

      macro_component_available:
        macroAvailable,

      geopolitics_component_available:
        geoAvailable,

      critical_minerals_component_available:
        false,
    });


  const eventScore =
    residual.residual_event_score;


  const macroScore =
    object
      .macro_component
      .weighted_observed_risk ??
    0;


  const geoScore =
    object
      .geopolitics_component
      .weighted_observed_risk ??
    0;


  const macroConfidence =
    object
      .macro_component
      .confidence_factor;


  const geoConfidence =
    object
      .geopolitics_component
      .confidence_factor;


  /*
   * A. Fixed 70/15/15:
   * reliability does not modify score.
   */
  const fixedScore =
    eventScore *
      FIXED.event +
    macroScore *
      FIXED.macro *
      macroConfidence +
    geoScore *
      FIXED.geopolitics *
      geoConfidence;


  /*
   * B. Reliability modifies event weight.
   * Removed event weight is redistributed.
   */
  const allocation =
    allocateReliabilityAwareWeights({
      event_reliability:
        reliability.reliability_factor,

      event_available:
        true,

      macro_available:
        macroAvailable,

      geopolitics_available:
        geoAvailable,
    });


  const dynamic =
    allocation.effective_weights;


  const weightModifierScore =
    eventScore *
      dynamic.event +
    macroScore *
      dynamic.macro *
      macroConfidence +
    geoScore *
      dynamic.geopolitics *
      geoConfidence;


  /*
   * C. Reliability modifies event confidence only.
   *
   * Fixed component weights remain unchanged.
   * No weight is redistributed.
   */
  const confidenceModifierScore =
    eventScore *
      FIXED.event *
      reliability.reliability_factor +
    macroScore *
      FIXED.macro *
      macroConfidence +
    geoScore *
      FIXED.geopolitics *
      geoConfidence;


  rows.push({
    country:
      iso3,

    reliability:
      reliability.reliability_factor,

    status:
      reliability.status,

    residual_event:
      round(eventScore),

    fixed_score:
      round(fixedScore),

    weight_modifier_score:
      round(weightModifierScore),

    confidence_modifier_score:
      round(confidenceModifierScore),

    weight_minus_fixed:
      round(
        weightModifierScore -
        fixedScore,
      ),

    confidence_minus_fixed:
      round(
        confidenceModifierScore -
        fixedScore,
      ),
  });
}


console.log(
  "===== RELIABILITY POLICY COMPARISON =====",
);

console.table(
  rows,
);


/*
 * Basic invariants.
 */

for (
  const row of rows
) {
  if (
    row.fixed_score === null
  ) {
    continue;
  }

  if (
    row.reliability <
      1 &&
    row.confidence_modifier_score >
      row.fixed_score +
        1e-6
  ) {
    throw new Error(
      `${row.country}: confidence modifier increased score unexpectedly`,
    );
  }
}


const china =
  rows.find(
    row =>
      row.country ===
      "CHN",
  );


if (
  !china ||
  china.fixed_score === null ||
  china.weight_modifier_score === null ||
  china.confidence_modifier_score === null
) {
  throw new Error(
    "China diagnostic row unavailable",
  );
}


console.log(
  "===== CHINA CONCENTRATION CHECK =====",
);

console.log({
  reliability:
    china.reliability,

  fixed:
    china.fixed_score,

  weight_modifier:
    china.weight_modifier_score,

  confidence_modifier:
    china.confidence_modifier_score,
});


console.log(
  "PASS: WEIGHT-vs-CONFIDENCE POLICY COMPARISON COMPLETE",
);

console.log(
  "PASS: NO PRODUCTION FORMULA MODIFIED",
);
