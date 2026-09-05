import {
  createHash,
} from "node:crypto";


export const COUNTRY_RISK_V02_FINAL_GATE_VERSION =
  "country-risk-v0.2-final-gate-v0.1.0-pilot" as const;


export type FinalGateCandidateWeights = {
  event:
    number;

  macro:
    number;

  geopolitics:
    number;
};


export type FinalGateComponentReliability = {
  event:
    number;

  macro:
    number;

  geopolitics:
    number;
};


export type FinalGateEffectiveWeights = {
  event:
    number;

  macro:
    number;

  geopolitics:
    number;
};


export type FinalGateScoreResult = {
  methodology_version:
    typeof COUNTRY_RISK_V02_FINAL_GATE_VERSION;

  available:
    boolean;

  exclusion_reason:
    string | null;

  candidate_weights:
    FinalGateCandidateWeights;

  component_reliability:
    FinalGateComponentReliability;

  effective_weights:
    FinalGateEffectiveWeights | null;

  residual_event_score:
    number | null;

  macro_score:
    number | null;

  geopolitics_score:
    number | null;

  contributions: {
    event:
      number | null;

    macro:
      number | null;

    geopolitics:
      number | null;
  };

  candidate_score:
    number | null;

  calculation_hash:
    string;
};


function canonicalize(
  value: unknown,
): unknown {
  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize,
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      )
        .sort(
          ([a], [b]) =>
            a.localeCompare(b),
        )
        .map(
          ([key, item]) => [
            key,
            canonicalize(item),
          ],
        ),
    );
  }

  return value;
}


function hashJson(
  value: unknown,
) {
  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        canonicalize(value),
      ),
    )
    .digest("hex");
}


function clamp01(
  value:
    number,
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
  value:
    number,

  places =
    6,
) {
  const factor =
    10 ** places;

  return Math.round(
    (value + Number.EPSILON) *
      factor,
  ) /
    factor;
}


export function
buildReliabilityNormalizedCandidate(
  input: {
    event_available:
      boolean;

    macro_available:
      boolean;

    geopolitics_available:
      boolean;

    candidate_weights:
      FinalGateCandidateWeights;

    component_reliability:
      FinalGateComponentReliability;

    residual_event_score:
      number | null;

    macro_score:
      number | null;

    geopolitics_score:
      number | null;
  },
): FinalGateScoreResult {
  const baseTotal =
    input
      .candidate_weights
      .event +
    input
      .candidate_weights
      .macro +
    input
      .candidate_weights
      .geopolitics;


  if (
    Math.abs(
      baseTotal -
      1,
    ) >
    1e-12
  ) {
    throw new Error(
      `Candidate weights must sum to 1, got ${baseTotal}`,
    );
  }


  /*
   * Current Phase 2 publication semantics:
   *
   * Missing event evidence means the full GRO
   * candidate remains unavailable.
   *
   * Macro/geopolitics can still exist as structured
   * intelligence, but cannot silently manufacture
   * a full country-risk score.
   */
  if (
    !input.event_available ||
    input.residual_event_score ===
      null
  ) {
    const core = {
      methodology_version:
        COUNTRY_RISK_V02_FINAL_GATE_VERSION,

      available:
        false,

      exclusion_reason:
        "event_component_unavailable",

      candidate_weights:
        input.candidate_weights,

      component_reliability:
        input.component_reliability,

      effective_weights:
        null,

      residual_event_score:
        null,

      macro_score:
        input.macro_score,

      geopolitics_score:
        input.geopolitics_score,

      contributions: {
        event:
          null,

        macro:
          null,

        geopolitics:
          null,
      },

      candidate_score:
        null,
    };


    return {
      ...core,

      calculation_hash:
        hashJson(
          core,
        ),
    };
  }


  const eventMass =
    input
      .candidate_weights
      .event *
    clamp01(
      input
        .component_reliability
        .event,
    );


  const macroMass =
    input.macro_available &&
    input.macro_score !==
      null
      ? input
          .candidate_weights
          .macro *
        clamp01(
          input
            .component_reliability
            .macro,
        )
      : 0;


  const geopoliticsMass =
    input
      .geopolitics_available &&
    input
      .geopolitics_score !==
      null
      ? input
          .candidate_weights
          .geopolitics *
        clamp01(
          input
            .component_reliability
            .geopolitics,
        )
      : 0;


  const totalMass =
    eventMass +
    macroMass +
    geopoliticsMass;


  if (
    totalMass <=
    0
  ) {
    throw new Error(
      "Reliability-adjusted component mass is zero",
    );
  }


  const eventWeight =
    eventMass /
    totalMass;


  const macroWeight =
    macroMass /
    totalMass;


  /*
   * Derive final returned weight as residual so
   * audit-visible weights reconcile exactly.
   */
  const returnedEvent =
    round(
      eventWeight,
    );


  const returnedMacro =
    round(
      macroWeight,
    );


  const returnedGeopolitics =
    round(
      1 -
      returnedEvent -
      returnedMacro,
    );


  const effectiveWeights = {
    event:
      returnedEvent,

    macro:
      returnedMacro,

    geopolitics:
      returnedGeopolitics,
  };


  const eventContribution =
    round(
      input
        .residual_event_score *
      effectiveWeights
        .event,
    );


  const macroContribution =
    input.macro_score !==
      null
      ? round(
          input
            .macro_score *
          effectiveWeights
            .macro,
        )
      : 0;


  const geopoliticsContribution =
    input.geopolitics_score !==
      null
      ? round(
          input
            .geopolitics_score *
          effectiveWeights
            .geopolitics,
        )
      : 0;


  const candidateScore =
    round(
      eventContribution +
      macroContribution +
      geopoliticsContribution,
      3,
    );


  const core = {
    methodology_version:
      COUNTRY_RISK_V02_FINAL_GATE_VERSION,

    available:
      true,

    exclusion_reason:
      null,

    candidate_weights:
      input.candidate_weights,

    component_reliability:
      input.component_reliability,

    effective_weights:
      effectiveWeights,

    residual_event_score:
      input
        .residual_event_score,

    macro_score:
      input.macro_score,

    geopolitics_score:
      input
        .geopolitics_score,

    contributions: {
      event:
        eventContribution,

      macro:
        macroContribution,

      geopolitics:
        geopoliticsContribution,
    },

    candidate_score:
      candidateScore,
  };


  return {
    ...core,

    calculation_hash:
      hashJson(
        core,
      ),
  };
}
