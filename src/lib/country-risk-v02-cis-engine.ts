import type {
  CountryIntelligenceState,
  IntelligenceCategory,
  IntelligenceCoverageStatus,
} from "./country-intelligence-state-contract";

import {
  COUNTRY_RISK_V02_METHOD_VERSION,
  type CisRiskComponent,
  type CountryRiskV02Context,
} from "./country-risk-v02-contract";

const CATEGORIES:
  IntelligenceCategory[] = [
    "MACRO",
    "GEOPOLITICS",
    "CRITICAL_MINERALS",
  ];

function round(
  value: number,
  places = 6,
) {
  const factor =
    10 ** places;

  return (
    Math.round(
      (value + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function coverageFactor(
  status:
    IntelligenceCoverageStatus,
) {
  switch (status) {
    case "STRONG":
      return 1;

    case "USABLE":
      return 0.8;

    case "LIMITED":
      return 0.5;

    case "STALE":
      return 0.25;

    case "NO_SIGNAL":
      return 0;

    default: {
      const exhaustive:
        never = status;

      return exhaustive;
    }
  }
}

function buildComponent(
  cis: CountryIntelligenceState,
  category:
    IntelligenceCategory,
): CisRiskComponent {
  const summary =
    cis.categories[
      category
    ];

  const features =
    cis.features
      .filter(
        (feature) =>
          feature.category ===
          category,
      )
      .sort(
        (a, b) =>
          a.feature_key.localeCompare(
            b.feature_key,
          ),
      );

  const featureCount =
    features.length;

  const currentCount =
    features.filter(
      (feature) =>
        feature.freshness_status ===
        "CURRENT",
    ).length;

  const agingCount =
    features.filter(
      (feature) =>
        feature.freshness_status ===
        "AGING",
    ).length;

  const staleCount =
    features.filter(
      (feature) =>
        feature.freshness_status ===
        "STALE",
    ).length;

  const unknownCount =
    features.filter(
      (feature) =>
        feature.freshness_status ===
        "UNKNOWN",
    ).length;

  /*
   * CURRENT receives full freshness credit.
   * AGING receives partial freshness credit.
   * STALE and UNKNOWN do not create freshness
   * confidence.
   *
   * This affects confidence only. It does not
   * create a directional risk score.
   */
  const freshnessFactor =
    featureCount > 0
      ? (
          currentCount +
          agingCount * 0.5
        ) /
        featureCount
      : 0;

  const coverage =
    coverageFactor(
      summary.coverage_status,
    );

  const confidenceFactor =
    round(
      freshnessFactor *
        coverage,
    );

  return {
    category,

    cis_state_id:
      cis.state_id,

    cis_calculation_hash:
      cis.hashes
        .calculation_hash,

    coverage_status:
      summary.coverage_status,

    feature_count:
      featureCount,

    current_feature_count:
      currentCount,

    stale_feature_count:
      staleCount,

    unknown_freshness_feature_count:
      unknownCount,

    source_count:
      summary.source_count,

    freshness_factor:
      round(
        freshnessFactor,
      ),

    coverage_factor:
      round(
        coverage,
      ),

    confidence_factor:
      confidenceFactor,

    directional_risk_score:
      null,

    score_contribution:
      0,

    feature_refs:
      features.map(
        (feature) =>
          feature.feature_key,
      ),
  };
}

export function
buildCountryRiskV02Context(
  cis: CountryIntelligenceState,
): CountryRiskV02Context {
  return {
    methodology_version:
      COUNTRY_RISK_V02_METHOD_VERSION,

    cis_state_id:
      cis.state_id,

    cis_methodology_version:
      cis.methodology_version,

    cis_calculation_hash:
      cis.hashes
        .calculation_hash,

    components:
      CATEGORIES.map(
        (category) =>
          buildComponent(
            cis,
            category,
          ),
      ),
  };
}
