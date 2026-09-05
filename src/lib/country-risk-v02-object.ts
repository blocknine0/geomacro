import {
  createHash,
} from "node:crypto";

import {
  COUNTRY_RISK_V02_OBJECT_METHOD_VERSION,
  type CountryRiskV02IntegratedObject,
} from "./country-risk-v02-object-contract";

import type {
  GeomacroRiskObject,
} from "./risk-object-contract";

import type {
  CountryMacroRiskComponent,
} from "./country-risk-v02-macro-contract";

import type {
  CountryGeopoliticalRiskComponent,
} from "./country-risk-v02-geopolitics-contract";

import type {
  CountryRiskV02Context,
} from "./country-risk-v02-contract";

import {
  determineCompositeAvailability,
} from "./country-risk-v02-availability";

import {
  COUNTRY_RISK_V02_WEIGHTS,
  COUNTRY_RISK_V02_WEIGHTING_VERSION,
  validateCountryRiskV02Weights,
} from "./country-risk-v02-weighting";


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
buildCountryRiskV02IntegratedObject(
  input: {
    base_event_object:
      GeomacroRiskObject;

    macro_component:
      CountryMacroRiskComponent;

    geopolitics_component:
      CountryGeopoliticalRiskComponent;

    cis_context:
      CountryRiskV02Context;
  },
): CountryRiskV02IntegratedObject {
  validateCountryRiskV02Weights();


  const base =
    input.base_event_object;

  const macro =
    input.macro_component;

  const geopolitics =
    input.geopolitics_component;

  const cis =
    input.cis_context;


  if (
    base.subject.id !==
      macro.country_iso3 ||
    base.subject.id !==
      geopolitics.country_iso3
  ) {
    throw new Error(
      "GRO v0.2 country mismatch",
    );
  }


  const eventAvailable =
    !(
      base.confidence === 0 &&
      base.evidence_summary
        .event_count === 0
    );


  const macroAvailable =
    macro.weighted_observed_risk !==
      null &&
    macro.confidence_factor > 0;


  const geopoliticsAvailable =
    geopolitics
      .weighted_observed_risk !==
      null &&
    geopolitics
      .confidence_factor > 0;


  /*
   * Existing availability policy remains anchored
   * on event + macro because event availability is
   * mandatory for an integrated composite.
   *
   * Geopolitics is an additional scored component
   * when available, but is not allowed to rescue a
   * missing dominant event component.
   */
  const availability =
    determineCompositeAvailability({
      event_available:
        eventAvailable,

      macro_available:
        macroAvailable,
    });


  const eventScore =
    eventAvailable
      ? base.risk.score
      : null;


  const eventContribution =
    eventAvailable
      ? round(
          base.risk.score *
            COUNTRY_RISK_V02_WEIGHTS
              .event_risk,
        )
      : null;


  const macroContribution =
    macroAvailable
      ? round(
          macro
            .weighted_observed_risk! *
          COUNTRY_RISK_V02_WEIGHTS
            .macro *
          macro
            .confidence_factor,
        )
      : null;


  const geopoliticsContribution =
    geopoliticsAvailable
      ? round(
          geopolitics
            .weighted_observed_risk! *
          COUNTRY_RISK_V02_WEIGHTS
            .geopolitics *
          geopolitics
            .confidence_factor,
        )
      : null;


  /*
   * No weight redistribution.
   *
   * Missing components contribute nothing,
   * but their missingness remains explicit in
   * confidence and availability metadata.
   */
  const finalScore =
    !availability
      .composite_score_available
      ? null
      : round(
          (
            eventContribution ??
            0
          ) +
          (
            macroContribution ??
            0
          ) +
          (
            geopoliticsContribution ??
            0
          ),
          3,
        );


  const eventConfidence =
    eventAvailable
      ? base.confidence
      : 0;


  const macroConfidence =
    macroAvailable
      ? macro
          .confidence_factor
      : 0;


  const geopoliticsConfidence =
    geopoliticsAvailable
      ? geopolitics
          .confidence_factor
      : 0;


  const finalConfidence =
    finalScore === null
      ? 0
      : round(
          (
            eventConfidence *
            COUNTRY_RISK_V02_WEIGHTS
              .event_risk
          ) +
          (
            macroConfidence *
            COUNTRY_RISK_V02_WEIGHTS
              .macro
          ) +
          (
            geopoliticsConfidence *
            COUNTRY_RISK_V02_WEIGHTS
              .geopolitics
          ),
        );


  const calculationHash =
    hashJson({
      methodology_version:
        COUNTRY_RISK_V02_OBJECT_METHOD_VERSION,

      weighting_version:
        COUNTRY_RISK_V02_WEIGHTING_VERSION,

      country_iso3:
        base.subject.id,

      as_of:
        base.generated_at,

      weights:
        COUNTRY_RISK_V02_WEIGHTS,

      availability,

      event_available:
        eventAvailable,

      macro_available:
        macroAvailable,

      geopolitics_available:
        geopoliticsAvailable,

      base_event_hash:
        base.integrity
          .calculation_hash,

      macro_hash:
        macro
          .calculation_hash,

      geopolitics_hash:
        geopolitics
          .calculation_hash,

      cis_hash:
        cis
          .cis_calculation_hash,

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
    });


  return {
    methodology_version:
      COUNTRY_RISK_V02_OBJECT_METHOD_VERSION,

    country_iso3:
      base.subject.id,

    country_name:
      base.subject.name,

    as_of:
      base.generated_at,

    base_event_risk: {
      methodology_version:
        base.methodology_version,

      object_id:
        base.object_id,

      available:
        eventAvailable,

      score:
        eventScore,

      confidence:
        eventConfidence,

      exclusion_reason:
        eventAvailable
          ? null
          : "no_usable_event_evidence",

      calculation_hash:
        base.integrity
          .calculation_hash,
    },

    macro_component:
      macro,

    geopolitics_component:
      geopolitics,

    cis_context:
      cis,

    availability,

    weights: {
      event_risk:
        0.6,

      macro:
        0.2,

      geopolitics:
        0.2,

      critical_minerals:
        0,
    },

    score: {
      event_contribution:
        eventContribution,

      macro_contribution:
        macroContribution,

      geopolitics_contribution:
        geopoliticsContribution,

      final_score:
        finalScore,
    },

    confidence: {
      event_confidence:
        eventConfidence,

      macro_confidence:
        macroConfidence,

      geopolitics_confidence:
        geopoliticsConfidence,

      final_confidence:
        finalConfidence,
    },

    exclusions: {
      geopolitics:
        geopoliticsAvailable
          ? null
          : "geopolitics_component_unavailable",

      critical_minerals:
        "Critical-mineral dependency and concentration scoring is not yet versioned.",
    },

    integrity: {
      base_event_hash:
        base.integrity
          .calculation_hash,

      macro_hash:
        macro
          .calculation_hash,

      cis_hash:
        cis
          .cis_calculation_hash,

      calculation_hash:
        calculationHash,
    },
  };
}
