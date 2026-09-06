export const COUNTRY_INTELLIGENCE_STATE_SCHEMA_VERSION =
  "country-intelligence-state-1.0" as const;

export const COUNTRY_INTELLIGENCE_STATE_METHOD_VERSION =
  "country-intelligence-state-v0.1.0-pilot" as const;

export type IntelligenceCategory =
  | "MACRO"
  | "GEOPOLITICS"
  | "CRITICAL_MINERALS";

export type IntelligenceCoverageStatus =
  | "STRONG"
  | "USABLE"
  | "LIMITED"
  | "STALE"
  | "NO_SIGNAL";

export type CountryFeatureValue = {
  feature_key: string;

  category:
    IntelligenceCategory;

  metric:
    string;

  commodity:
    string | null;

  value_numeric:
    number | null;

  value_text:
    string | null;

  unit:
    string | null;

  observed_at:
    string | null;

  age_days:
    number | null;

  freshness_status:
    "CURRENT"
    | "AGING"
    | "STALE"
    | "UNKNOWN";

  source_count:
    number;

  observation_count:
    number;
};

export type CategoryIntelligenceSummary = {
  category:
    IntelligenceCategory;

  observation_count:
    number;

  metric_count:
    number;

  commodity_count:
    number;

  source_count:
    number;

  latest_observed_at:
    string | null;

  oldest_observed_at:
    string | null;

  age_days:
    number | null;

  stale_feature_count:
    number;

  current_feature_count:
    number;

  unknown_freshness_feature_count:
    number;

  coverage_status:
    IntelligenceCoverageStatus;
};

export type CountryIntelligenceState = {
  schema_version:
    typeof COUNTRY_INTELLIGENCE_STATE_SCHEMA_VERSION;

  methodology_version:
    typeof COUNTRY_INTELLIGENCE_STATE_METHOD_VERSION;

  state_id:
    string;

  country_iso3:
    string;

  country_name:
    string | null;

  as_of:
    string;

  generated_at:
    string;

  categories: {
    MACRO:
      CategoryIntelligenceSummary;

    GEOPOLITICS:
      CategoryIntelligenceSummary;

    CRITICAL_MINERALS:
      CategoryIntelligenceSummary;
  };

  features:
    CountryFeatureValue[];

  totals: {
    observation_count:
      number;

    feature_count:
      number;

    source_count:
      number;

    category_count:
      number;
  };

  hashes: {
    input_hash:
      string;

    data_hash:
      string;

    calculation_hash:
      string;
  };
};
