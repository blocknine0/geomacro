export const COUNTRY_RISK_V02_GEOPOLITICS_METHOD_VERSION =
  "country-risk-geopolitics-v0.1.0-pilot" as const;


export const COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION =
  "country-risk-geopolitics-normalization-v0.1.0-pilot" as const;


export type GeopoliticalMetricKey =
  | "forced_displacement_total"
  | "refugees_origin"
  | "asylum_seekers_origin"
  | "internally_displaced"
  | "stateless_population";


export type PopulationNormalizedGeopoliticalSignal = {
  country_iso3:
    string;

  metric:
    GeopoliticalMetricKey;

  raw_value:
    number;

  population:
    number;

  population_observed_at:
    string;

  raw_observed_at:
    string | null;

  per_100k_population:
    number;

  freshness_status:
    "CURRENT"
    | "AGING"
    | "STALE"
    | "UNKNOWN";

  denominator_freshness_status:
    "CURRENT"
    | "AGING"
    | "STALE"
    | "UNKNOWN";

  score_eligible:
    boolean;

  exclusion_reason:
    string | null;
};


export type GeopoliticalNormalizedRiskSignal =
  PopulationNormalizedGeopoliticalSignal & {
    /*
     * Full eligible peer universe, including
     * verified zero-burden countries.
     */
    peer_count:
      number;

    /*
     * Positive-burden peer universe used for
     * percentile ranking.
     *
     * Verified zero burden is assigned risk 0
     * directly and is not placed into the
     * positive-burden percentile distribution.
     */
    positive_peer_count:
      number;

    percentile:
      number;

    normalized_risk_score:
      number;

    zero_burden:
      boolean;

    normalization_version:
      typeof COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION;
  };


export type GeopoliticalNormalizationSnapshot = {
  normalization_version:
    typeof COUNTRY_RISK_V02_GEOPOLITICS_NORMALIZATION_VERSION;

  metric:
    GeopoliticalMetricKey;

  as_of:
    string;

  peer_count:
    number;

  signals:
    GeopoliticalNormalizedRiskSignal[];

  calculation_hash:
    string;
};


export type GeopoliticalDimensionResult = {
  metric:
    GeopoliticalMetricKey;

  base_weight:
    number;

  available:
    boolean;

  peer_count:
    number | null;

  positive_peer_count:
    number | null;

  zero_burden:
    boolean | null;

  numerator_freshness:
    "CURRENT"
    | "AGING"
    | "STALE"
    | "UNKNOWN"
    | null;

  denominator_freshness:
    "CURRENT"
    | "AGING"
    | "STALE"
    | "UNKNOWN"
    | null;

  per_100k_population:
    number | null;

  normalized_risk_score:
    number | null;

  contribution:
    number;

  exclusion_reason:
    string | null;

  normalization_hash:
    string | null;
};


export type CountryGeopoliticalRiskComponent = {
  methodology_version:
    typeof COUNTRY_RISK_V02_GEOPOLITICS_METHOD_VERSION;

  country_iso3:
    string;

  as_of:
    string;

  dimensions:
    GeopoliticalDimensionResult[];

  available_dimension_count:
    number;

  total_dimension_count:
    number;

  coverage_ratio:
    number;

  weighted_observed_risk:
    number | null;

  score_contribution:
    number;

  confidence_factor:
    number;

  calculation_hash:
    string;
};
