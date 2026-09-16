import type { MarketRelevanceLevel } from "./early-warning-contract";

export const MARKET_IMPACT_METHOD_VERSION =
  "early-warning-market-impact-v0.1-provisional" as const;

export const MARKET_IMPACT_ASSET_CLASSES = [
  "equities",
  "crypto",
  "fx",
  "rates",
  "commodities",
] as const;

export type MarketImpactAssetClass = (typeof MARKET_IMPACT_ASSET_CLASSES)[number];
export type MarketPressureDirection = "POSITIVE" | "NEGATIVE" | "MIXED" | "UNCERTAIN";

export const MARKET_IMPACT_DRIVERS = [
  "MONETARY_TIGHTENING",
  "MONETARY_EASING",
  "INFLATION_UPSIDE",
  "GROWTH_DOWNSIDE",
  "LIQUIDITY_TIGHTENING",
  "LIQUIDITY_EASING",
  "ENERGY_SUPPLY_DISRUPTION",
  "ENERGY_SUPPLY_RELIEF",
  "CONFLICT_ESCALATION",
  "CONFLICT_DEESCALATION",
  "SANCTIONS_ESCALATION",
  "SANCTIONS_RELIEF",
  "BANKING_STRESS",
  "BANKING_STABILIZATION",
  "CAPITAL_CONTROLS_TIGHTENING",
  "TRADE_DISRUPTION",
  "TRADE_NORMALIZATION",
  "SOVEREIGN_STRESS",
  "CRITICAL_MINERAL_DISRUPTION",
  "NATURAL_HAZARD_DISRUPTION",
] as const;

export type MarketImpactDriver = (typeof MARKET_IMPACT_DRIVERS)[number];

export type MarketImpactAssetAssessment = {
  relevance: MarketRelevanceLevel;
  pressure_direction: MarketPressureDirection;
  rationale_code: string;
};

export type MarketImpactAssessment = {
  methodology_version: typeof MARKET_IMPACT_METHOD_VERSION;
  calibrated: false;
  structural_pressure_only: true;
  market_price_prediction: false;
  trading_instruction: false;
  public_performance_claims_allowed: false;
  driver: MarketImpactDriver;
  country_iso3: string;
  confidence: number;
  transmission_channels: string[];
  direction_semantics: {
    equities: "broad equity price pressure";
    crypto: "broad crypto risk-asset price pressure";
    fx: "domestic-currency pressure versus major reserve currencies";
    rates: "sovereign yield pressure";
    commodities: "broad relevant-commodity price pressure";
  };
  assets: Record<MarketImpactAssetClass, MarketImpactAssetAssessment>;
};

type DriverRule = {
  channels: readonly string[];
  assets: Record<MarketImpactAssetClass, MarketImpactAssetAssessment>;
};

const asset = (
  relevance: MarketRelevanceLevel,
  pressure_direction: MarketPressureDirection,
  rationale_code: string,
): MarketImpactAssetAssessment => ({ relevance, pressure_direction, rationale_code });

const RULES: Readonly<Record<MarketImpactDriver, DriverRule>> = {
  MONETARY_TIGHTENING: {
    channels: ["policy_rates", "discount_rates", "financial_conditions", "capital_flows"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "HIGHER_DISCOUNT_RATE_PRESSURE"),
      crypto: asset("HIGH", "NEGATIVE", "TIGHTER_LIQUIDITY_PRESSURE"),
      fx: asset("HIGH", "POSITIVE", "RATE_DIFFERENTIAL_SUPPORT"),
      rates: asset("VERY_HIGH", "POSITIVE", "POLICY_YIELD_PRESSURE"),
      commodities: asset("MODERATE", "MIXED", "DEMAND_VS_CURRENCY_CHANNEL"),
    },
  },
  MONETARY_EASING: {
    channels: ["policy_rates", "discount_rates", "financial_conditions", "capital_flows"],
    assets: {
      equities: asset("HIGH", "POSITIVE", "LOWER_DISCOUNT_RATE_SUPPORT"),
      crypto: asset("HIGH", "POSITIVE", "EASIER_LIQUIDITY_SUPPORT"),
      fx: asset("HIGH", "NEGATIVE", "RATE_DIFFERENTIAL_PRESSURE"),
      rates: asset("VERY_HIGH", "NEGATIVE", "POLICY_YIELD_PRESSURE"),
      commodities: asset("MODERATE", "MIXED", "DEMAND_VS_CURRENCY_CHANNEL"),
    },
  },
  INFLATION_UPSIDE: {
    channels: ["inflation_expectations", "policy_expectations", "real_income", "input_costs"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "MARGIN_AND_DISCOUNT_RATE_PRESSURE"),
      crypto: asset("MODERATE", "NEGATIVE", "POLICY_TIGHTENING_EXPECTATION"),
      fx: asset("MODERATE", "MIXED", "POLICY_SUPPORT_VS_REAL_INCOME_PRESSURE"),
      rates: asset("HIGH", "POSITIVE", "INFLATION_PREMIUM_PRESSURE"),
      commodities: asset("HIGH", "POSITIVE", "PRICE_LEVEL_PRESSURE"),
    },
  },
  GROWTH_DOWNSIDE: {
    channels: ["growth_expectations", "earnings", "credit_demand", "risk_appetite"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "EARNINGS_GROWTH_PRESSURE"),
      crypto: asset("MODERATE", "NEGATIVE", "RISK_APPETITE_PRESSURE"),
      fx: asset("MODERATE", "NEGATIVE", "GROWTH_DIFFERENTIAL_PRESSURE"),
      rates: asset("HIGH", "NEGATIVE", "SAFE_HAVEN_AND_EASING_EXPECTATION"),
      commodities: asset("MODERATE", "NEGATIVE", "DEMAND_EXPECTATION_PRESSURE"),
    },
  },
  LIQUIDITY_TIGHTENING: {
    channels: ["system_liquidity", "funding_costs", "leverage", "risk_appetite"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "FUNDING_AND_RISK_APPETITE_PRESSURE"),
      crypto: asset("VERY_HIGH", "NEGATIVE", "LEVERAGE_AND_LIQUIDITY_PRESSURE"),
      fx: asset("MODERATE", "MIXED", "SAFE_HAVEN_VS_DOMESTIC_FUNDING_CHANNEL"),
      rates: asset("HIGH", "POSITIVE", "FUNDING_COST_PRESSURE"),
      commodities: asset("MODERATE", "NEGATIVE", "LIQUIDITY_DEMAND_PRESSURE"),
    },
  },
  LIQUIDITY_EASING: {
    channels: ["system_liquidity", "funding_costs", "leverage", "risk_appetite"],
    assets: {
      equities: asset("HIGH", "POSITIVE", "FUNDING_AND_RISK_APPETITE_SUPPORT"),
      crypto: asset("VERY_HIGH", "POSITIVE", "LEVERAGE_AND_LIQUIDITY_SUPPORT"),
      fx: asset("MODERATE", "MIXED", "RISK_APPETITE_VS_RATE_CHANNEL"),
      rates: asset("HIGH", "NEGATIVE", "FUNDING_COST_RELIEF"),
      commodities: asset("MODERATE", "POSITIVE", "LIQUIDITY_DEMAND_SUPPORT"),
    },
  },
  ENERGY_SUPPLY_DISRUPTION: {
    channels: ["energy_supply", "input_costs", "inflation_expectations", "trade_balance", "risk_appetite"],
    assets: {
      equities: asset("HIGH", "MIXED", "SECTOR_WINNERS_AND_COST_PRESSURE"),
      crypto: asset("MODERATE", "NEGATIVE", "GLOBAL_RISK_OFF_PRESSURE"),
      fx: asset("HIGH", "MIXED", "ENERGY_EXPORTER_IMPORTER_DIVERGENCE"),
      rates: asset("MODERATE", "POSITIVE", "INFLATION_EXPECTATION_PRESSURE"),
      commodities: asset("CRITICAL", "POSITIVE", "SUPPLY_SHORTFALL_PRESSURE"),
    },
  },
  ENERGY_SUPPLY_RELIEF: {
    channels: ["energy_supply", "input_costs", "inflation_expectations", "trade_balance"],
    assets: {
      equities: asset("HIGH", "MIXED", "CONSUMER_RELIEF_VS_ENERGY_SECTOR_PRESSURE"),
      crypto: asset("LOW", "UNCERTAIN", "WEAK_DIRECT_TRANSMISSION"),
      fx: asset("HIGH", "MIXED", "ENERGY_EXPORTER_IMPORTER_DIVERGENCE"),
      rates: asset("MODERATE", "NEGATIVE", "INFLATION_PREMIUM_RELIEF"),
      commodities: asset("VERY_HIGH", "NEGATIVE", "SUPPLY_RISK_RELIEF"),
    },
  },
  CONFLICT_ESCALATION: {
    channels: ["risk_appetite", "trade_routes", "energy_supply", "capital_flows", "safe_havens"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "RISK_OFF_AND_DISRUPTION_PRESSURE"),
      crypto: asset("HIGH", "MIXED", "RISK_OFF_VS_ALTERNATIVE_ASSET_CHANNEL"),
      fx: asset("HIGH", "MIXED", "SAFE_HAVEN_AND_LOCAL_RISK_DIVERGENCE"),
      rates: asset("HIGH", "MIXED", "SAFE_HAVEN_VS_INFLATION_CHANNEL"),
      commodities: asset("HIGH", "POSITIVE", "SUPPLY_AND_ROUTE_RISK_PREMIUM"),
    },
  },
  CONFLICT_DEESCALATION: {
    channels: ["risk_appetite", "trade_routes", "capital_flows", "risk_premium"],
    assets: {
      equities: asset("HIGH", "POSITIVE", "RISK_PREMIUM_RELIEF"),
      crypto: asset("MODERATE", "MIXED", "RISK_ON_VS_ALTERNATIVE_ASSET_UNWIND"),
      fx: asset("HIGH", "MIXED", "LOCAL_RELIEF_VS_SAFE_HAVEN_UNWIND"),
      rates: asset("MODERATE", "MIXED", "SAFE_HAVEN_UNWIND_VS_GROWTH_CHANNEL"),
      commodities: asset("HIGH", "NEGATIVE", "SUPPLY_RISK_PREMIUM_RELIEF"),
    },
  },
  SANCTIONS_ESCALATION: {
    channels: ["trade_restrictions", "payments", "capital_flows", "supply_chains", "risk_appetite"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "TRADE_AND_COMPLIANCE_PRESSURE"),
      crypto: asset("HIGH", "MIXED", "RISK_OFF_VS_CIRCUMVENTION_NARRATIVE"),
      fx: asset("VERY_HIGH", "NEGATIVE", "PAYMENTS_AND_CAPITAL_FLOW_PRESSURE"),
      rates: asset("HIGH", "POSITIVE", "SOVEREIGN_RISK_PREMIUM_PRESSURE"),
      commodities: asset("HIGH", "MIXED", "SUPPLY_RESTRICTION_DIVERGENCE"),
    },
  },
  SANCTIONS_RELIEF: {
    channels: ["trade_restrictions", "payments", "capital_flows", "supply_chains"],
    assets: {
      equities: asset("HIGH", "POSITIVE", "TRADE_AND_COMPLIANCE_RELIEF"),
      crypto: asset("MODERATE", "MIXED", "RISK_ON_VS_CIRCUMVENTION_UNWIND"),
      fx: asset("VERY_HIGH", "POSITIVE", "PAYMENTS_AND_CAPITAL_FLOW_RELIEF"),
      rates: asset("HIGH", "NEGATIVE", "SOVEREIGN_RISK_PREMIUM_RELIEF"),
      commodities: asset("HIGH", "MIXED", "SUPPLY_ACCESS_DIVERGENCE"),
    },
  },
  BANKING_STRESS: {
    channels: ["credit_supply", "funding_costs", "deposits", "liquidity", "risk_appetite"],
    assets: {
      equities: asset("VERY_HIGH", "NEGATIVE", "FINANCIAL_SYSTEM_STRESS"),
      crypto: asset("VERY_HIGH", "MIXED", "RISK_OFF_VS_BANKING_ALTERNATIVE_CHANNEL"),
      fx: asset("HIGH", "NEGATIVE", "CAPITAL_AND_CONFIDENCE_PRESSURE"),
      rates: asset("HIGH", "NEGATIVE", "SAFE_HAVEN_AND_EASING_EXPECTATION"),
      commodities: asset("MODERATE", "NEGATIVE", "GROWTH_AND_CREDIT_DEMAND_PRESSURE"),
    },
  },
  BANKING_STABILIZATION: {
    channels: ["credit_supply", "funding_costs", "deposits", "liquidity", "risk_appetite"],
    assets: {
      equities: asset("VERY_HIGH", "POSITIVE", "FINANCIAL_SYSTEM_STABILIZATION"),
      crypto: asset("HIGH", "MIXED", "RISK_ON_VS_BANKING_ALTERNATIVE_UNWIND"),
      fx: asset("HIGH", "POSITIVE", "CAPITAL_AND_CONFIDENCE_RELIEF"),
      rates: asset("HIGH", "POSITIVE", "SAFE_HAVEN_UNWIND_PRESSURE"),
      commodities: asset("MODERATE", "POSITIVE", "GROWTH_AND_CREDIT_DEMAND_RELIEF"),
    },
  },
  CAPITAL_CONTROLS_TIGHTENING: {
    channels: ["capital_flows", "payments", "convertibility", "liquidity", "risk_appetite"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "CAPITAL_ACCESS_PRESSURE"),
      crypto: asset("VERY_HIGH", "MIXED", "RISK_OFF_VS_ALTERNATIVE_RAIL_DEMAND"),
      fx: asset("VERY_HIGH", "NEGATIVE", "CONVERTIBILITY_AND_OUTFLOW_PRESSURE"),
      rates: asset("HIGH", "POSITIVE", "SOVEREIGN_AND_LIQUIDITY_PREMIUM"),
      commodities: asset("MODERATE", "MIXED", "IMPORT_FINANCING_AND_LOCAL_PRICE_CHANNEL"),
    },
  },
  TRADE_DISRUPTION: {
    channels: ["trade_routes", "supply_chains", "input_costs", "export_demand", "risk_appetite"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "SUPPLY_CHAIN_AND_MARGIN_PRESSURE"),
      crypto: asset("MODERATE", "NEGATIVE", "RISK_APPETITE_PRESSURE"),
      fx: asset("HIGH", "MIXED", "TRADE_BALANCE_DIVERGENCE"),
      rates: asset("MODERATE", "MIXED", "GROWTH_VS_INFLATION_CHANNEL"),
      commodities: asset("HIGH", "MIXED", "SUPPLY_AND_DEMAND_DIVERGENCE"),
    },
  },
  TRADE_NORMALIZATION: {
    channels: ["trade_routes", "supply_chains", "input_costs", "export_demand"],
    assets: {
      equities: asset("HIGH", "POSITIVE", "SUPPLY_CHAIN_AND_MARGIN_RELIEF"),
      crypto: asset("LOW", "UNCERTAIN", "WEAK_DIRECT_TRANSMISSION"),
      fx: asset("HIGH", "MIXED", "TRADE_BALANCE_DIVERGENCE"),
      rates: asset("MODERATE", "MIXED", "GROWTH_VS_INFLATION_CHANNEL"),
      commodities: asset("HIGH", "MIXED", "SUPPLY_AND_DEMAND_NORMALIZATION"),
    },
  },
  SOVEREIGN_STRESS: {
    channels: ["sovereign_spreads", "funding_access", "capital_flows", "currency", "banking_system"],
    assets: {
      equities: asset("HIGH", "NEGATIVE", "COUNTRY_RISK_PREMIUM_PRESSURE"),
      crypto: asset("HIGH", "MIXED", "RISK_OFF_VS_ALTERNATIVE_ASSET_DEMAND"),
      fx: asset("VERY_HIGH", "NEGATIVE", "CAPITAL_FLIGHT_AND_CONFIDENCE_PRESSURE"),
      rates: asset("CRITICAL", "POSITIVE", "SOVEREIGN_YIELD_PREMIUM_PRESSURE"),
      commodities: asset("MODERATE", "MIXED", "LOCAL_DEMAND_AND_CURRENCY_CHANNEL"),
    },
  },
  CRITICAL_MINERAL_DISRUPTION: {
    channels: ["critical_mineral_supply", "industrial_inputs", "supply_chains", "trade_balance"],
    assets: {
      equities: asset("HIGH", "MIXED", "PRODUCER_WINNERS_AND_INPUT_COST_PRESSURE"),
      crypto: asset("LOW", "UNCERTAIN", "WEAK_DIRECT_TRANSMISSION"),
      fx: asset("MODERATE", "MIXED", "EXPORTER_IMPORTER_DIVERGENCE"),
      rates: asset("MODERATE", "MIXED", "INFLATION_VS_GROWTH_CHANNEL"),
      commodities: asset("VERY_HIGH", "POSITIVE", "SCARCE_INPUT_SUPPLY_PRESSURE"),
    },
  },
  NATURAL_HAZARD_DISRUPTION: {
    channels: ["physical_disruption", "supply_chains", "fiscal_response", "insurance", "local_demand"],
    assets: {
      equities: asset("HIGH", "MIXED", "LOCAL_DAMAGE_AND_REBUILD_DIVERGENCE"),
      crypto: asset("LOW", "UNCERTAIN", "WEAK_DIRECT_TRANSMISSION"),
      fx: asset("MODERATE", "NEGATIVE", "LOCAL_ECONOMIC_AND_EXTERNAL_PRESSURE"),
      rates: asset("MODERATE", "MIXED", "FISCAL_RESPONSE_VS_GROWTH_CHANNEL"),
      commodities: asset("HIGH", "MIXED", "LOCAL_SUPPLY_AND_REBUILD_DEMAND"),
    },
  },
};

function validateConfidence(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  return value;
}

function validateIso3(value: string) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("country_iso3 must be ISO3-like uppercase text");
  }
  return normalized;
}

export function buildMarketImpactAssessment(input: {
  driver: MarketImpactDriver;
  country_iso3: string;
  confidence: number;
}): MarketImpactAssessment {
  if (!MARKET_IMPACT_DRIVERS.includes(input.driver)) {
    throw new Error("unsupported market impact driver");
  }
  const rule = RULES[input.driver];
  const countryIso3 = validateIso3(input.country_iso3);
  const confidence = validateConfidence(input.confidence);

  return {
    methodology_version: MARKET_IMPACT_METHOD_VERSION,
    calibrated: false,
    structural_pressure_only: true,
    market_price_prediction: false,
    trading_instruction: false,
    public_performance_claims_allowed: false,
    driver: input.driver,
    country_iso3: countryIso3,
    confidence,
    transmission_channels: [...rule.channels],
    direction_semantics: {
      equities: "broad equity price pressure",
      crypto: "broad crypto risk-asset price pressure",
      fx: "domestic-currency pressure versus major reserve currencies",
      rates: "sovereign yield pressure",
      commodities: "broad relevant-commodity price pressure",
    },
    assets: Object.fromEntries(
      MARKET_IMPACT_ASSET_CLASSES.map((key) => [key, { ...rule.assets[key] }]),
    ) as Record<MarketImpactAssetClass, MarketImpactAssetAssessment>,
  };
}

export function marketRelevanceFromAssessment(assessment: MarketImpactAssessment) {
  return Object.fromEntries(
    MARKET_IMPACT_ASSET_CLASSES.map((key) => [key, assessment.assets[key].relevance]),
  ) as Record<MarketImpactAssetClass, MarketRelevanceLevel>;
}
