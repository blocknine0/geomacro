export type WeightCandidate = {
  id: string;
  event: number;
  macro: number;
  geopolitics: number;
};

export type WeightSensitivityInput = {
  event_score: number | null;
  event_confidence: number;
  macro_score: number | null;
  macro_confidence: number;
  geopolitics_score: number | null;
  geopolitics_confidence: number;
};

function round(
  value: number,
  places = 6,
) {
  const factor =
    10 ** places;

  return Math.round(
    (value + Number.EPSILON) *
      factor,
  ) / factor;
}

export function
validateWeightCandidate(
  candidate: WeightCandidate,
) {
  const total =
    candidate.event +
    candidate.macro +
    candidate.geopolitics;

  if (
    Math.abs(total - 1) >
    1e-12
  ) {
    throw new Error(
      `${candidate.id}: weights do not sum to 1`,
    );
  }
}

export function
evaluateWeightCandidate(
  input: WeightSensitivityInput,
  candidate: WeightCandidate,
) {
  validateWeightCandidate(
    candidate,
  );

  if (
    input.event_score === null
  ) {
    return {
      candidate:
        candidate.id,

      score_available:
        false,

      event_contribution:
        null,

      macro_contribution:
        input.macro_score === null
          ? null
          : round(
              input.macro_score *
              candidate.macro *
              input.macro_confidence,
            ),

      geopolitics_contribution:
        input.geopolitics_score === null
          ? null
          : round(
              input.geopolitics_score *
              candidate.geopolitics *
              input.geopolitics_confidence,
            ),

      final_score:
        null,

      final_confidence:
        0,
    };
  }

  const eventContribution =
    round(
      input.event_score *
      candidate.event,
    );

  const macroContribution =
    input.macro_score === null
      ? null
      : round(
          input.macro_score *
          candidate.macro *
          input.macro_confidence,
        );

  const geopoliticsContribution =
    input.geopolitics_score === null
      ? null
      : round(
          input.geopolitics_score *
          candidate.geopolitics *
          input.geopolitics_confidence,
        );

  const finalScore =
    round(
      eventContribution +
      (macroContribution ?? 0) +
      (geopoliticsContribution ?? 0),
      3,
    );

  const finalConfidence =
    round(
      (
        input.event_confidence *
        candidate.event
      ) +
      (
        input.macro_confidence *
        candidate.macro
      ) +
      (
        input.geopolitics_confidence *
        candidate.geopolitics
      ),
    );

  return {
    candidate:
      candidate.id,

    score_available:
      true,

    event_contribution:
      eventContribution,

    macro_contribution:
      macroContribution,

    geopolitics_contribution:
      geopoliticsContribution,

    final_score:
      finalScore,

    final_confidence:
      finalConfidence,
  };
}
