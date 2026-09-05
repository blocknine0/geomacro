import type {
  NormalizedRiskSignal,
} from "./country-risk-v02-normalization-contract";


export const COUNTRY_RISK_V02_MACRO_METHOD_VERSION =
  "country-risk-macro-v0.1.0-pilot" as const;


export type MacroDimensionKey =
  | "inflation"
  | "growth"
  | "unemployment"
  | "government_debt";


export type MacroDimensionResult = {
  key:
    MacroDimensionKey;

  metric:
    string;

  base_weight:
    number;

  available:
    boolean;

  peer_count:
    number | null;

  normalized_risk_score:
    number | null;

  freshness_status:
    NormalizedRiskSignal["freshness_status"] | null;

  normalization_hash:
    string | null;

  contribution:
    number;

  exclusion_reason:
    string | null;
};


export type CountryMacroRiskComponent = {
  methodology_version:
    typeof COUNTRY_RISK_V02_MACRO_METHOD_VERSION;

  country_iso3:
    string;

  as_of:
    string;

  dimensions:
    MacroDimensionResult[];

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
