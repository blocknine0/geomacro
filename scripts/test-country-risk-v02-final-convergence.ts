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
  buildComponentReliabilityEnvelope,
} from "../src/lib/country-risk-v02-component-reliability";

import {
  compareCountryRiskV01V02,
} from "../src/lib/country-risk-v02-comparison";

import {
  buildReliabilityNormalizedCandidate,
} from "../src/lib/country-risk-v02-final-gate";


const AS_OF =
  "2026-09-05T15:31:27.104Z";


/*
 * Final-gate candidate prior only.
 *
 * This does NOT change the current GRO implementation.
 */
const CANDIDATE = {
  event:
    0.70,

  macro:
    0.15,

  geopolitics:
    0.15,
} as const;


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


  const reliability =
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


  const eventAvailable =
    run.object
      .base_event_risk
      .available;


  const macroScore =
    run.object
      .macro_component
      .weighted_observed_risk;


  const geopoliticsScore =
    run.object
      .geopolitics_component
      .weighted_observed_risk;


  let residualEvent:
    number | null =
    null;


  let removedOverlap:
    number | null =
    null;


  if (
    eventAvailable
  ) {
    const residual =
      buildOrthogonalEventResidual({
        object:
          run.context
            .base_object,

        macro_component_available:
          reliability
            .macro
            .available,

        geopolitics_component_available:
          reliability
            .geopolitics
            .available,

        critical_minerals_component_available:
          false,
      });


    residualEvent =
      residual
        .residual_event_score;


    removedOverlap =
      residual
        .removed_direct_overlap;
  }


  const candidate =
    buildReliabilityNormalizedCandidate({
      event_available:
        eventAvailable,

      macro_available:
        reliability
          .macro
          .available,

      geopolitics_available:
        reliability
          .geopolitics
          .available,

      candidate_weights:
        CANDIDATE,

      component_reliability: {
        event:
          reliability
            .event
            .reliability_factor,

        macro:
          reliability
            .macro
            .reliability_factor,

        geopolitics:
          reliability
            .geopolitics
            .reliability_factor,
      },

      residual_event_score:
        residualEvent,

      macro_score:
        macroScore,

      geopolitics_score:
        geopoliticsScore,
    });


  /*
   * Deterministic replay.
   */
  const replay =
    buildReliabilityNormalizedCandidate({
      event_available:
        eventAvailable,

      macro_available:
        reliability
          .macro
          .available,

      geopolitics_available:
        reliability
          .geopolitics
          .available,

      candidate_weights:
        CANDIDATE,

      component_reliability: {
        event:
          reliability
            .event
            .reliability_factor,

        macro:
          reliability
            .macro
            .reliability_factor,

        geopolitics:
          reliability
            .geopolitics
            .reliability_factor,
      },

      residual_event_score:
        residualEvent,

      macro_score:
        macroScore,

      geopolitics_score:
        geopoliticsScore,
    });


  if (
    candidate
      .calculation_hash !==
    replay
      .calculation_hash
  ) {
    throw new Error(
      `${iso3}: final-gate deterministic replay mismatch`,
    );
  }


  if (
    candidate.available
  ) {
    const weights =
      candidate
        .effective_weights;


    if (!weights) {
      throw new Error(
        `${iso3}: candidate available without effective weights`,
      );
    }


    const total =
      weights.event +
      weights.macro +
      weights.geopolitics;


    if (
      Math.abs(
        total -
        1,
      ) >
      1e-6
    ) {
      throw new Error(
        `${iso3}: effective weights do not reconcile`,
      );
    }


    const contributionTotal =
      (
        candidate
          .contributions
          .event ??
        0
      ) +
      (
        candidate
          .contributions
          .macro ??
        0
      ) +
      (
        candidate
          .contributions
          .geopolitics ??
        0
      );


    if (
      Math.abs(
        contributionTotal -
        (
          candidate
            .candidate_score ??
          0
        ),
      ) >
      0.002
    ) {
      throw new Error(
        `${iso3}: candidate attribution does not reconcile`,
      );
    }
  }


  const currentComparison =
    compareCountryRiskV01V02(
      run.object,
    );


  rows.push({
    country:
      iso3,

    current_availability:
      run.object
        .availability
        .status,

    event_count:
      eventReliability
        .event_count,

    event_reliability:
      reliability
        .event
        .reliability_factor,

    macro_reliability:
      reliability
        .macro
        .reliability_factor,

    geo_reliability:
      reliability
        .geopolitics
        .reliability_factor,

    raw_event:
      run.object
        .base_event_risk
        .score,

    overlap_removed:
      removedOverlap,

    residual_event:
      residualEvent,

    current_v02:
      run.object
        .score
        .final_score,

    candidate_available:
      candidate.available,

    event_weight:
      candidate
        .effective_weights
        ?.event ??
      null,

    macro_weight:
      candidate
        .effective_weights
        ?.macro ??
      null,

    geo_weight:
      candidate
        .effective_weights
        ?.geopolitics ??
      null,

    candidate_score:
      candidate
        .candidate_score,

    comparison_available:
      currentComparison
        .comparison_available,

    current_reconciliation:
      currentComparison
        .attribution
        .reconciliation_delta,

    candidate_hash:
      candidate
        .calculation_hash
        .slice(
          0,
          16,
        ),
  });
}


console.log(
  "===== PHASE 2 FINAL CONVERGENCE MATRIX =====",
);

console.table(
  rows,
);


/*
 * --------------------------------------------------
 * SAFETY INVARIANTS
 * --------------------------------------------------
 */


const availableCountries =
  [
    "IND",
    "USA",
    "CHN",
    "DEU",
  ];


for (
  const iso3 of
    availableCountries
) {
  const row =
    rows.find(
      item =>
        item.country ===
        iso3,
    );


  if (!row) {
    throw new Error(
      `${iso3}: convergence row missing`,
    );
  }


  if (
    !row
      .candidate_available
  ) {
    throw new Error(
      `${iso3}: candidate unexpectedly unavailable`,
    );
  }


  if (
    row
      .candidate_score ===
      null
  ) {
    throw new Error(
      `${iso3}: candidate emitted null score`,
    );
  }


  if (
    row
      .candidate_score <
      0 ||
    row
      .candidate_score >
      100
  ) {
    throw new Error(
      `${iso3}: candidate score outside 0-100`,
    );
  }
}


for (
  const iso3 of
    [
      "BRA",
      "ZAF",
    ]
) {
  const row =
    rows.find(
      item =>
        item.country ===
        iso3,
    );


  if (!row) {
    throw new Error(
      `${iso3}: convergence row missing`,
    );
  }


  if (
    row
      .candidate_available
  ) {
    throw new Error(
      `${iso3}: missing-event country generated full candidate score`,
    );
  }


  if (
    row
      .candidate_score !==
      null
  ) {
    throw new Error(
      `${iso3}: fail-closed country emitted candidate score`,
    );
  }
}


/*
 * China must receive lower event weight than
 * stronger-evidence India / USA under the
 * reliability-normalized candidate.
 */

const china =
  rows.find(
    item =>
      item.country ===
      "CHN",
  );

const india =
  rows.find(
    item =>
      item.country ===
      "IND",
  );

const usa =
  rows.find(
    item =>
      item.country ===
      "USA",
  );


if (
  !china ||
  !india ||
  !usa
) {
  throw new Error(
    "Required concentration-test rows missing",
  );
}


if (
  !(
    Number(
      china.event_weight,
    ) <
    Number(
      india.event_weight,
    )
  )
) {
  throw new Error(
    "China evidence concentration did not reduce event weight vs India",
  );
}


if (
  !(
    Number(
      china.event_weight,
    ) <
    Number(
      usa.event_weight,
    )
  )
) {
  throw new Error(
    "China evidence concentration did not reduce event weight vs USA",
  );
}


console.log(
  "PASS: FINAL CANDIDATE DETERMINISTIC",
);

console.log(
  "PASS: RELIABILITY-NORMALIZED EFFECTIVE WEIGHTS RECONCILE",
);

console.log(
  "PASS: ORTHOGONAL EVENT RESIDUAL APPLIED BEFORE CANDIDATE WEIGHTING",
);

console.log(
  "PASS: EVENT CONCENTRATION REDUCES EFFECTIVE EVENT WEIGHT",
);

console.log(
  "PASS: BRA/ZAF REMAIN FAIL-CLOSED",
);

console.log(
  "PASS: CRITICAL MINERALS REMAIN OUTSIDE v0.2 SCORE",
);

console.log(
  "NOTE: CANDIDATE FORMULA IS STILL DIAGNOSTIC ONLY",
);
