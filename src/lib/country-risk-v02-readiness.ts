import type {
  CountryIntelligenceState,
} from "./country-intelligence-state-contract";

import {
  getFeatureMethodologyRule,
  type FeatureScoringMode,
} from "./country-risk-v02-feature-methodology";


export type FeatureReadinessItem = {
  feature_key:
    string;

  category:
    string;

  metric:
    string;

  freshness_status:
    string;

  scoring_mode:
    FeatureScoringMode;

  direction:
    string;

  score_eligible:
    boolean;

  reason:
    string;
};


export function
auditCountryRiskV02Readiness(
  cis:
    CountryIntelligenceState,
) {
  const items:
    FeatureReadinessItem[] =
    cis.features
      .map(
        feature => {
          const rule =
            getFeatureMethodologyRule(
              feature.category,
              feature.metric,
            );

          const freshnessEligible =
            feature
              .freshness_status ===
              "CURRENT" ||
            feature
              .freshness_status ===
              "AGING";

          const scoreEligible =
            rule.mode ===
              "SCORE_READY" &&
            freshnessEligible &&
            feature.value_numeric !==
              null;

          let reason =
            rule.rationale;

          if (
            rule.mode ===
              "SCORE_READY" &&
            !freshnessEligible
          ) {
            reason =
              "Feature methodology is score-ready but the observation is not sufficiently fresh.";
          }

          if (
            rule.mode ===
              "SCORE_READY" &&
            feature.value_numeric ===
              null
          ) {
            reason =
              "Feature methodology is score-ready but no numeric value is available.";
          }

          return {
            feature_key:
              feature.feature_key,

            category:
              feature.category,

            metric:
              feature.metric,

            freshness_status:
              feature
                .freshness_status,

            scoring_mode:
              rule.mode,

            direction:
              rule.direction,

            score_eligible:
              scoreEligible,

            reason,
          };
        },
      )
      .sort(
        (a, b) =>
          a.feature_key
            .localeCompare(
              b.feature_key,
            ),
      );

  const counts =
    items.reduce(
      (
        result,
        item,
      ) => {
        result.total += 1;

        result[
          item.scoring_mode
        ] += 1;

        if (
          item.score_eligible
        ) {
          result.score_eligible +=
            1;
        }

        return result;
      },
      {
        total: 0,
        SCORE_READY: 0,
        CONTEXT_ONLY: 0,
        NORMALIZATION_REQUIRED: 0,
        DEPENDENCY_MODEL_REQUIRED: 0,
        score_eligible: 0,
      },
    );

  return {
    cis_state_id:
      cis.state_id,

    cis_calculation_hash:
      cis.hashes
        .calculation_hash,

    country_iso3:
      cis.country_iso3,

    counts,

    items,
  };
}
