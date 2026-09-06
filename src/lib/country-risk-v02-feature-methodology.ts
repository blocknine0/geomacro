import type {
  IntelligenceCategory,
} from "./country-intelligence-state-contract";


export const COUNTRY_RISK_V02_FEATURE_METHOD_VERSION =
  "country-risk-feature-method-v0.1.0-pilot" as const;


export type FeatureScoringMode =
  | "SCORE_READY"
  | "CONTEXT_ONLY"
  | "NORMALIZATION_REQUIRED"
  | "DEPENDENCY_MODEL_REQUIRED";


export type RiskDirection =
  | "HIGHER_IS_HIGHER_RISK"
  | "LOWER_IS_HIGHER_RISK"
  | "NON_DIRECTIONAL";


export type FeatureMethodologyRule = {
  category:
    IntelligenceCategory;

  metric:
    string;

  mode:
    FeatureScoringMode;

  direction:
    RiskDirection;

  rationale:
    string;

  required_normalization:
    string | null;
};


export const COUNTRY_RISK_V02_FEATURE_RULES:
  readonly FeatureMethodologyRule[] = [

  // --------------------------------------------------
  // MACRO
  // --------------------------------------------------

  {
    category:
      "MACRO",

    metric:
      "inflation_consumer_prices_annual_pct",

    mode:
      "SCORE_READY",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Higher inflation represents greater macroeconomic price instability within the pilot country-risk methodology.",

    required_normalization:
      "cross_country_percentile",
  },

  {
    category:
      "MACRO",

    metric:
      "unemployment_total_pct",

    mode:
      "SCORE_READY",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Higher unemployment represents greater labour-market stress within the pilot country-risk methodology.",

    required_normalization:
      "cross_country_percentile",
  },

  {
    category:
      "MACRO",

    metric:
      "real_gdp_growth_annual_pct",

    mode:
      "SCORE_READY",

    direction:
      "LOWER_IS_HIGHER_RISK",

    rationale:
      "Lower real GDP growth represents weaker current macroeconomic momentum within the pilot country-risk methodology.",

    required_normalization:
      "cross_country_percentile_inverse",
  },

  {
    category:
      "MACRO",

    metric:
      "central_government_debt_pct_gdp",

    mode:
      "SCORE_READY",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Higher government debt relative to GDP represents greater sovereign fiscal burden within the pilot methodology.",

    required_normalization:
      "cross_country_percentile",
  },

  {
    category:
      "MACRO",

    metric:
      "trade_pct_gdp",

    mode:
      "CONTEXT_ONLY",

    direction:
      "NON_DIRECTIONAL",

    rationale:
      "Trade intensity is an exposure characteristic, not intrinsically a positive or negative country-risk signal.",

    required_normalization:
      null,
  },


  // --------------------------------------------------
  // GEOPOLITICS
  // --------------------------------------------------

  {
    category:
      "GEOPOLITICS",

    metric:
      "forced_displacement_total",

    mode:
      "NORMALIZATION_REQUIRED",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Absolute displacement counts are not comparable across countries without a population denominator.",

    required_normalization:
      "population_share",
  },

  {
    category:
      "GEOPOLITICS",

    metric:
      "refugees_origin",

    mode:
      "NORMALIZATION_REQUIRED",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Absolute refugee-origin counts require population normalization before cross-country scoring.",

    required_normalization:
      "population_share",
  },

  {
    category:
      "GEOPOLITICS",

    metric:
      "asylum_seekers_origin",

    mode:
      "NORMALIZATION_REQUIRED",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Absolute asylum-seeker counts require population normalization before cross-country scoring.",

    required_normalization:
      "population_share",
  },

  {
    category:
      "GEOPOLITICS",

    metric:
      "internally_displaced",

    mode:
      "NORMALIZATION_REQUIRED",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Absolute internally displaced population requires population normalization.",

    required_normalization:
      "population_share",
  },

  {
    category:
      "GEOPOLITICS",

    metric:
      "stateless_population",

    mode:
      "NORMALIZATION_REQUIRED",

    direction:
      "HIGHER_IS_HIGHER_RISK",

    rationale:
      "Absolute stateless population requires population normalization before comparable scoring.",

    required_normalization:
      "population_share",
  },
] as const;


/*
 * Critical-mineral production/reserve/capacity metrics
 * intentionally do not receive blanket directionality.
 *
 * High production or reserves may represent resilience,
 * strategic importance, concentration exposure or economic
 * opportunity depending on the decision context.
 */
export function
criticalMineralRule(
  metric: string,
): FeatureMethodologyRule {
  return {
    category:
      "CRITICAL_MINERALS",

    metric,

    mode:
      "DEPENDENCY_MODEL_REQUIRED",

    direction:
      "NON_DIRECTIONAL",

    rationale:
      "Country mineral production, reserve and capacity quantities require dependency, concentration and supply-chain exposure modelling before directional risk scoring.",

    required_normalization:
      "supply_dependency_and_concentration_model",
  };
}


export function
getFeatureMethodologyRule(
  category:
    IntelligenceCategory,
  metric:
    string,
): FeatureMethodologyRule {
  const exact =
    COUNTRY_RISK_V02_FEATURE_RULES
      .find(
        rule =>
          rule.category ===
            category &&
          rule.metric ===
            metric,
      );

  if (exact) {
    return exact;
  }

  if (
    category ===
      "CRITICAL_MINERALS"
  ) {
    return criticalMineralRule(
      metric,
    );
  }

  return {
    category,

    metric,

    mode:
      "CONTEXT_ONLY",

    direction:
      "NON_DIRECTIONAL",

    rationale:
      "Feature has no explicitly versioned directional scoring methodology.",

    required_normalization:
      null,
  };
}
