import {
  createHash,
} from "node:crypto";

import type {
  GeomacroRiskObject,
  RiskAttribution,
} from "./risk-object-contract";

import {
  classifyEventDriverOverlap,
} from "./country-risk-v02-component-overlap";


export const COUNTRY_RISK_V02_EVENT_RESIDUAL_VERSION =
  "country-risk-event-residual-v0.1.0-pilot" as const;


export type EventResidualAdjustment = {
  driver:
    RiskAttribution["driver"];

  original_contribution:
    number;

  removed_contribution:
    number;

  retained_contribution:
    number;

  overlap_status:
    string;

  overlap_component:
    string | null;

  reason:
    string;
};


export type EventResidualResult = {
  methodology_version:
    typeof COUNTRY_RISK_V02_EVENT_RESIDUAL_VERSION;

  country_iso3:
    string;

  original_event_score:
    number;

  removed_direct_overlap:
    number;

  residual_event_score:
    number;

  original_confidence:
    number;

  adjustments:
    EventResidualAdjustment[];

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
buildOrthogonalEventResidual(
  input: {
    object:
      GeomacroRiskObject;

    macro_component_available:
      boolean;

    geopolitics_component_available:
      boolean;

    critical_minerals_component_available:
      boolean;
  },
): EventResidualResult {
  const adjustments =
    input.object.attribution
      .map(
        attribution => {
          const overlap =
            classifyEventDriverOverlap(
              attribution.driver,
            );


          let remove =
            false;

          let overlapComponent:
            string | null =
            null;


          if (
            overlap.status ===
              "DIRECT_OVERLAP" &&
            overlap.overlaps_with
              .includes(
                "MACRO",
              ) &&
            input
              .macro_component_available
          ) {
            remove =
              true;

            overlapComponent =
              "MACRO";
          }


          if (
            overlap.status ===
              "DIRECT_OVERLAP" &&
            overlap.overlaps_with
              .includes(
                "GEOPOLITICS",
              ) &&
            input
              .geopolitics_component_available
          ) {
            remove =
              true;

            overlapComponent =
              "GEOPOLITICS";
          }


          if (
            overlap.status ===
              "DIRECT_OVERLAP" &&
            overlap.overlaps_with
              .includes(
                "CRITICAL_MINERALS",
              ) &&
            input
              .critical_minerals_component_available
          ) {
            remove =
              true;

            overlapComponent =
              "CRITICAL_MINERALS";
          }


          const removed =
            remove
              ? attribution
                  .score_contribution
              : 0;


          return {
            driver:
              attribution.driver,

            original_contribution:
              attribution
                .score_contribution,

            removed_contribution:
              round(
                removed,
              ),

            retained_contribution:
              round(
                attribution
                  .score_contribution -
                removed,
              ),

            overlap_status:
              overlap.status,

            overlap_component:
              overlapComponent,

            reason:
              remove
                ? `Direct overlap removed because ${overlapComponent} structured component is active`
                : overlap.rationale,
          };
        },
      );


  const removedDirectOverlap =
    round(
      adjustments.reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item
            .removed_contribution,
        0,
      ),
    );


  const residualEventScore =
    round(
      Math.max(
        0,
        input.object
          .risk
          .score -
        removedDirectOverlap,
      ),
    );


  const core = {
    methodology_version:
      COUNTRY_RISK_V02_EVENT_RESIDUAL_VERSION,

    country_iso3:
      input.object
        .subject
        .id,

    original_event_score:
      input.object
        .risk
        .score,

    removed_direct_overlap:
      removedDirectOverlap,

    residual_event_score:
      residualEventScore,

    original_confidence:
      input.object
        .confidence,

    adjustments,
  };


  return {
    ...core,

    calculation_hash:
      hashJson(
        core,
      ),
  };
}
