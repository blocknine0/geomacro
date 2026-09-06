import {
  createHash,
} from "node:crypto";

import {
  COUNTRY_RISK_V02_FINAL_GATE_VERSION,
} from "./country-risk-v02-final-gate";

import {
  COUNTRY_RISK_V02_EVENT_RESIDUAL_VERSION,
} from "./country-risk-v02-event-residual";

import {
  COUNTRY_RISK_V02_EVENT_RELIABILITY_VERSION,
} from "./country-risk-v02-event-reliability";

import {
  COUNTRY_RISK_V02_COMPONENT_RELIABILITY_VERSION,
} from "./country-risk-v02-component-reliability";

import {
  COUNTRY_RISK_V02_QUALITY_CONTRACT_VERSION,
} from "./country-risk-v02-quality-contract";


export const COUNTRY_RISK_V02_PHASE2_FREEZE_VERSION =
  "country-risk-v0.2-phase2-freeze-2026-09-05" as const;


export const COUNTRY_RISK_V02_PHASE2_STATUS =
  "PRE_PUBLICATION_FROZEN" as const;


/*
 * IMPORTANT
 *
 * These are Phase-2 validated PRIOR weights.
 *
 * They are not applied blindly.
 *
 * Effective country weights are:
 *
 *   prior_weight
 *     × component_reliability
 *     -> normalized across available components
 *
 * Full GRO remains fail-closed when the required
 * event component is unavailable.
 *
 * Production publication remains separately gated
 * on global coverage / source validation.
 */
export const COUNTRY_RISK_V02_FROZEN_PRIOR = {
  event:
    0.70,

  macro:
    0.15,

  geopolitics:
    0.15,

  critical_minerals:
    0,
} as const;


export const COUNTRY_RISK_V02_PHASE2_POLICY = {
  event_overlap_policy:
    "REMOVE_DIRECT_OVERLAP_ONLY",

  partial_overlap_policy:
    "RETAIN_WITH_EXPLICIT_CLASSIFICATION",

  event_score_input:
    "ORTHOGONAL_EVENT_RESIDUAL",

  component_weighting:
    "PRIOR_TIMES_RELIABILITY_NORMALIZED",

  confidence_semantics:
    "MEASUREMENT_CERTAINTY",

  reliability_semantics:
    "EVIDENCE_QUALITY",

  missing_event_policy:
    "FAIL_CLOSED_FULL_GRO",

  structured_data_without_event:
    "RETAIN_CONTEXT_NO_FULL_GRO",

  missing_data_policy:
    "NEVER_TREAT_MISSING_AS_ZERO_RISK",

  critical_minerals_policy:
    "CONTEXT_ONLY_ZERO_WEIGHT",

  publication_policy:
    "GLOBAL_COVERAGE_GATE_REQUIRED",

  attribution_policy:
    "COMPONENT_CONTRIBUTIONS_MUST_RECONCILE",

  replay_policy:
    "DETERMINISTIC_HASH_REQUIRED",
} as const;


export const COUNTRY_RISK_V02_PHASE2_DEPENDENCIES = {
  final_gate:
    COUNTRY_RISK_V02_FINAL_GATE_VERSION,

  event_residual:
    COUNTRY_RISK_V02_EVENT_RESIDUAL_VERSION,

  event_reliability:
    COUNTRY_RISK_V02_EVENT_RELIABILITY_VERSION,

  component_reliability:
    COUNTRY_RISK_V02_COMPONENT_RELIABILITY_VERSION,

  quality_contract:
    COUNTRY_RISK_V02_QUALITY_CONTRACT_VERSION,
} as const;


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


function sha256(
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
    .digest(
      "hex",
    );
}


export function
validateCountryRiskV02Phase2Freeze() {
  const total =
    COUNTRY_RISK_V02_FROZEN_PRIOR
      .event +
    COUNTRY_RISK_V02_FROZEN_PRIOR
      .macro +
    COUNTRY_RISK_V02_FROZEN_PRIOR
      .geopolitics +
    COUNTRY_RISK_V02_FROZEN_PRIOR
      .critical_minerals;


  if (
    Math.abs(
      total -
      1,
    ) >
    1e-12
  ) {
    throw new Error(
      `Phase-2 prior weights do not sum to 1: ${total}`,
    );
  }


  if (
    COUNTRY_RISK_V02_FROZEN_PRIOR
      .critical_minerals !==
    0
  ) {
    throw new Error(
      "Critical minerals must remain zero-weight in GRO v0.2 Phase 2",
    );
  }


  if (
    COUNTRY_RISK_V02_PHASE2_POLICY
      .missing_event_policy !==
    "FAIL_CLOSED_FULL_GRO"
  ) {
    throw new Error(
      "Phase-2 missing-event safety policy changed",
    );
  }


  return true;
}


export function
getCountryRiskV02Phase2FreezeManifest() {
  validateCountryRiskV02Phase2Freeze();


  const core = {
    freeze_version:
      COUNTRY_RISK_V02_PHASE2_FREEZE_VERSION,

    status:
      COUNTRY_RISK_V02_PHASE2_STATUS,

    prior_weights:
      COUNTRY_RISK_V02_FROZEN_PRIOR,

    policy:
      COUNTRY_RISK_V02_PHASE2_POLICY,

    dependencies:
      COUNTRY_RISK_V02_PHASE2_DEPENDENCIES,
  };


  return {
    ...core,

    methodology_hash:
      sha256(
        core,
      ),
  };
}
