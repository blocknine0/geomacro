export const COUNTRY_RISK_V02_RELIABILITY_WEIGHTING_VERSION =
  "country-risk-reliability-weighting-v0.1.0-pilot" as const;


export type ReliabilityWeightInput = {
  event_reliability:
    number;

  event_available:
    boolean;

  macro_available:
    boolean;

  geopolitics_available:
    boolean;
};


export type ReliabilityWeightResult = {
  methodology_version:
    typeof COUNTRY_RISK_V02_RELIABILITY_WEIGHTING_VERSION;

  base_weights: {
    event:
      number;

    macro:
      number;

    geopolitics:
      number;
  };

  effective_weights: {
    event:
      number;

    macro:
      number;

    geopolitics:
      number;
  };

  event_reliability:
    number;

  removed_event_weight:
    number;

  redistributed_weight:
    number;

  redistribution_status:
    "NONE"
    | "STRUCTURED_COMPONENTS"
    | "NO_EVENT"
    | "UNAVAILABLE";

  composite_available:
    boolean;
};


function clamp01(
  value: number,
) {
  return Math.min(
    1,
    Math.max(
      0,
      value,
    ),
  );
}


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


/*
 * Pilot prior only.
 *
 * This is NOT a production weight lock.
 * It exists solely to test reliability-aware
 * allocation behavior.
 */
const BASE = {
  event:
    0.70,

  macro:
    0.15,

  geopolitics:
    0.15,
} as const;


export function
allocateReliabilityAwareWeights(
  input:
    ReliabilityWeightInput,
): ReliabilityWeightResult {
  const reliability =
    clamp01(
      input.event_reliability,
    );


  if (
    !input.event_available
  ) {
    return {
      methodology_version:
        COUNTRY_RISK_V02_RELIABILITY_WEIGHTING_VERSION,

      base_weights:
        BASE,

      effective_weights: {
        event:
          0,

        macro:
          input.macro_available
            ? 0.5
            : 0,

        geopolitics:
          input.geopolitics_available
            ? 0.5
            : 0,
      },

      event_reliability:
        reliability,

      removed_event_weight:
        BASE.event,

      redistributed_weight:
        0,

      redistribution_status:
        "NO_EVENT",

      /*
       * Preserve current fail-closed semantics.
       * Structured components alone do not yet
       * create the publishable GRO composite.
       */
      composite_available:
        false,
    };
  }


  const effectiveEvent =
    BASE.event *
    reliability;


  const removedEvent =
    BASE.event -
    effectiveEvent;


  const structuredBase =
    (
      input.macro_available
        ? BASE.macro
        : 0
    ) +
    (
      input.geopolitics_available
        ? BASE.geopolitics
        : 0
    );


  if (
    structuredBase <=
    0
  ) {
    return {
      methodology_version:
        COUNTRY_RISK_V02_RELIABILITY_WEIGHTING_VERSION,

      base_weights:
        BASE,

      effective_weights: {
        event:
          round(
            effectiveEvent,
          ),

        macro:
          0,

        geopolitics:
          0,
      },

      event_reliability:
        reliability,

      removed_event_weight:
        round(
          removedEvent,
        ),

      redistributed_weight:
        0,

      redistribution_status:
        "UNAVAILABLE",

      composite_available:
        false,
    };
  }


  /*
   * Removed event weight is redistributed only
   * across AVAILABLE structured components,
   * proportional to their base weights.
   *
   * Since macro and geopolitics are currently
   * 15/15, both receive equal redistribution
   * when both are available.
   */
  const macroShare =
    input.macro_available
      ? BASE.macro /
        structuredBase
      : 0;


  const geoShare =
    input.geopolitics_available
      ? BASE.geopolitics /
        structuredBase
      : 0;


  const effectiveMacro =
    (
      input.macro_available
        ? BASE.macro
        : 0
    ) +
    removedEvent *
      macroShare;


  const effectiveGeo =
    (
      input.geopolitics_available
        ? BASE.geopolitics
        : 0
    ) +
    removedEvent *
      geoShare;


  const total =
    effectiveEvent +
    effectiveMacro +
    effectiveGeo;


  if (
    Math.abs(
      total - 1,
    ) >
    1e-9
  ) {
    throw new Error(
      `Reliability-aware weights do not sum to 1: ${total}`,
    );
  }


  /*
   * Returned weights must reconcile exactly after
   * rounding, because these are audit-visible values.
   *
   * Round event + macro first, then derive geopolitics
   * as the residual so the exposed weights sum to 1.
   */
  const returnedEvent =
    round(
      effectiveEvent,
    );

  const returnedMacro =
    round(
      effectiveMacro,
    );

  const returnedGeopolitics =
    round(
      1 -
      returnedEvent -
      returnedMacro,
    );


  const returnedTotal =
    returnedEvent +
    returnedMacro +
    returnedGeopolitics;


  if (
    Math.abs(
      returnedTotal - 1,
    ) >
    1e-12
  ) {
    throw new Error(
      `Returned reliability-aware weights do not reconcile: ${returnedTotal}`,
    );
  }


  return {
    methodology_version:
      COUNTRY_RISK_V02_RELIABILITY_WEIGHTING_VERSION,

    base_weights:
      BASE,

    effective_weights: {
      event:
        returnedEvent,

      macro:
        returnedMacro,

      geopolitics:
        returnedGeopolitics,
    },

    event_reliability:
      reliability,

    removed_event_weight:
      round(
        removedEvent,
      ),

    redistributed_weight:
      round(
        removedEvent,
      ),

    redistribution_status:
      removedEvent >
        1e-12
        ? "STRUCTURED_COMPONENTS"
        : "NONE",

    composite_available:
      true,
  };
}
