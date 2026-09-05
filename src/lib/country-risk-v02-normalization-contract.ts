import type {
  RiskDirection,
} from "./country-risk-v02-feature-methodology";


export const COUNTRY_RISK_V02_NORMALIZATION_VERSION =
  "country-risk-normalization-v0.1.0-pilot" as const;


export type NormalizedRiskSignal = {
  country_iso3:
    string;

  category:
    "MACRO";

  metric:
    string;

  raw_value:
    number;

  unit:
    string | null;

  observed_at:
    string | null;

  freshness_status:
    "CURRENT"
    | "AGING"
    | "STALE"
    | "UNKNOWN";

  direction:
    RiskDirection;

  peer_count:
    number;

  percentile:
    number;

  normalized_risk_score:
    number;

  normalization_version:
    typeof COUNTRY_RISK_V02_NORMALIZATION_VERSION;
};


export type MacroNormalizationSnapshot = {
  normalization_version:
    typeof COUNTRY_RISK_V02_NORMALIZATION_VERSION;

  as_of:
    string;

  metric:
    string;

  direction:
    RiskDirection;

  peer_count:
    number;

  signals:
    NormalizedRiskSignal[];

  calculation_hash:
    string;
};
