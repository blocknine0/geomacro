import type {
  CountryIntelligenceState,
  IntelligenceCategory,
  IntelligenceCoverageStatus,
} from "./country-intelligence-state-contract";

export const COUNTRY_RISK_V02_METHOD_VERSION =
  "country-risk-v0.2.0-cis-pilot" as const;

export type CisRiskComponent = {
  category:
    IntelligenceCategory;

  cis_state_id:
    string;

  cis_calculation_hash:
    string;

  coverage_status:
    IntelligenceCoverageStatus;

  feature_count:
    number;

  current_feature_count:
    number;

  stale_feature_count:
    number;

  unknown_freshness_feature_count:
    number;

  source_count:
    number;

  freshness_factor:
    number;

  coverage_factor:
    number;

  confidence_factor:
    number;

  /*
   * Phase 2 foundation deliberately does not infer
   * directional economic/geopolitical risk from
   * heterogeneous raw feature values.
   *
   * A later versioned feature methodology must
   * explicitly define normalization, directionality,
   * thresholds and weights before a numeric CIS risk
   * contribution is allowed to alter the GRO score.
   */
  directional_risk_score:
    null;

  score_contribution:
    0;

  feature_refs:
    string[];
};

export type CountryRiskV02Context = {
  methodology_version:
    typeof COUNTRY_RISK_V02_METHOD_VERSION;

  cis_state_id:
    string;

  cis_methodology_version:
    CountryIntelligenceState["methodology_version"];

  cis_calculation_hash:
    string;

  components:
    CisRiskComponent[];
};
