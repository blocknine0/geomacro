export type CompositeAvailability =
  | "FULL"
  | "EVENT_ONLY"
  | "MACRO_ONLY"
  | "UNAVAILABLE";


export type CompositeAvailabilityResult = {
  status:
    CompositeAvailability;

  event_available:
    boolean;

  macro_available:
    boolean;

  composite_score_available:
    boolean;

  exclusion_reason:
    string | null;
};


export function determineCompositeAvailability(
  input: {
    event_available:
      boolean;

    macro_available:
      boolean;
  },
): CompositeAvailabilityResult {
  const {
    event_available,
    macro_available,
  } = input;


  if (
    event_available &&
    macro_available
  ) {
    return {
      status:
        "FULL",

      event_available:
        true,

      macro_available:
        true,

      composite_score_available:
        true,

      exclusion_reason:
        null,
    };
  }


  if (
    event_available &&
    !macro_available
  ) {
    return {
      status:
        "EVENT_ONLY",

      event_available:
        true,

      macro_available:
        false,

      /*
       * v0.2 may preserve the event-derived score path,
       * but absence of macro context must remain explicit.
       */
      composite_score_available:
        true,

      exclusion_reason:
        "macro_component_unavailable",
    };
  }


  if (
    !event_available &&
    macro_available
  ) {
    return {
      status:
        "MACRO_ONLY",

      event_available:
        false,

      macro_available:
        true,

      /*
       * Fail closed.
       * Macro-only data must not masquerade as the
       * integrated country risk score.
       */
      composite_score_available:
        false,

      exclusion_reason:
        "event_component_unavailable",
    };
  }


  return {
    status:
      "UNAVAILABLE",

    event_available:
      false,

    macro_available:
      false,

    composite_score_available:
      false,

    exclusion_reason:
      "event_and_macro_components_unavailable",
  };
}
