import {
  createHash,
} from "node:crypto";

import type {
  CountryRiskV02IntegratedObject,
} from "./country-risk-v02-object-contract";


export type CountryRiskV02Comparison = {
  country_iso3:
    string;

  as_of:
    string;

  comparison_available:
    boolean;

  exclusion_reason:
    string | null;

  v01_score:
    number | null;

  v02_score:
    number | null;

  total_delta:
    number | null;

  attribution: {
    event_reweighting_effect:
      number | null;

    macro_effect:
      number | null;

    geopolitics_effect:
      number | null;

    reconciliation_delta:
      number | null;
  };

  confidence: {
    v01:
      number;

    v02:
      number;

    delta:
      number | null;
  };

  safeguards: {
    geopolitics_score_active:
      boolean;

    critical_minerals_score_active:
      false;

    unavailable_composite_fail_closed:
      boolean;
  };

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
compareCountryRiskV01V02(
  object:
    CountryRiskV02IntegratedObject,
): CountryRiskV02Comparison {
  const v01 =
    object
      .base_event_risk
      .score;

  const v02 =
    object
      .score
      .final_score;

  const eventContribution =
    object
      .score
      .event_contribution;

  const macroContribution =
    object
      .score
      .macro_contribution;

  const geopoliticsContribution =
    object
      .score
      .geopolitics_contribution;

  const comparisonAvailable =
    v01 !== null &&
    v02 !== null &&
    eventContribution !== null &&
    macroContribution !== null &&
    geopoliticsContribution !== null;

  const totalDelta =
    comparisonAvailable
      ? round(
          v02 - v01,
          3,
        )
      : null;

  const eventReweightingEffect =
    comparisonAvailable
      ? round(
          eventContribution -
            v01,
        )
      : null;

  const macroEffect =
    comparisonAvailable
      ? round(
          macroContribution,
        )
      : null;

  const geopoliticsEffect =
    comparisonAvailable
      ? round(
          geopoliticsContribution,
        )
      : null;

  const reconstructed =
    comparisonAvailable
      ? round(
          eventReweightingEffect +
            macroEffect +
            geopoliticsEffect,
          3,
        )
      : null;

  const reconciliationDelta =
    comparisonAvailable
      ? round(
          totalDelta -
            reconstructed,
          6,
        )
      : null;

  const confidenceDelta =
    comparisonAvailable
      ? round(
          object
            .confidence
            .final_confidence -
          object
            .confidence
            .event_confidence,
        )
      : null;

  const comparisonCore = {
    country_iso3:
      object.country_iso3,

    as_of:
      object.as_of,

    comparison_available:
      comparisonAvailable,

    exclusion_reason:
      comparisonAvailable
        ? null
        : "composite_or_required_component_unavailable",

    v01_score:
      v01,

    v02_score:
      v02,

    total_delta:
      totalDelta,

    attribution: {
      event_reweighting_effect:
        eventReweightingEffect,

      macro_effect:
        macroEffect,

      geopolitics_effect:
        geopoliticsEffect,

      reconciliation_delta:
        reconciliationDelta,
    },

    confidence: {
      v01:
        object
          .confidence
          .event_confidence,

      v02:
        object
          .confidence
          .final_confidence,

      delta:
        confidenceDelta,
    },

    safeguards: {
      geopolitics_score_active:
        geopoliticsContribution !== null,

      critical_minerals_score_active:
        false as const,

      unavailable_composite_fail_closed:
        !comparisonAvailable,
    },
  };

  return {
    ...comparisonCore,

    calculation_hash:
      hashJson(
        comparisonCore,
      ),
  };
}
