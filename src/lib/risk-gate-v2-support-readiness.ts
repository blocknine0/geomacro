import type {
  RiskGateV2CoverageState,
  RiskGateV2Module,
} from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_SUPPORT_READINESS_VERSION =
  "risk-gate-v2-support-readiness-0.1.0" as const;

export type RiskGateV2SupportStatus =
  | "SUPPORTED"
  | "SOURCE_READY"
  | "BLOCKED_SOURCE_RIGHTS"
  | "BLOCKED_ADAPTER"
  | "BLOCKED_METHODOLOGY"
  | "BLOCKED_DATA_COVERAGE";

export type RiskGateV2ModuleSupportReadiness = {
  module: RiskGateV2Module;
  status: RiskGateV2SupportStatus;
  /**
   * Highest coverage state the current production methodology is allowed to
   * claim. This is intentionally independent from whether a module runtime
   * exists. A supported module can still have LIMITED/PARTIAL subject coverage.
   */
  coverage_ceiling: RiskGateV2CoverageState;
  governed_sources: readonly string[];
  blockers: readonly string[];
  promotion_requirements: readonly string[];
};

/**
 * Commercial support registry for Risk Gate v2.
 *
 * This file is deliberately conservative. `SUPPORTED` means Geomacro has a
 * deterministic, versioned module-state builder backed by governed inputs. It
 * never means every country/corridor has FULL coverage.
 *
 * Unsupported modules are kept here with explicit blockers and a promotion
 * path so they are engineering work items, not permanently ignored taxonomy.
 */
export const RISK_GATE_V2_SUPPORT_READINESS = {
  geopolitical_security: {
    module: "geopolitical_security",
    status: "SOURCE_READY",
    coverage_ceiling: "PARTIAL",
    governed_sources: ["ucdp_candidate", "ucdp_ged"],
    blockers: [
      "Risk Gate v2 conflict module-state methodology is not yet versioned.",
      "Current UCDP Candidate evidence is evidence-only until explicitly promoted by a v2 methodology.",
    ],
    promotion_requirements: [
      "Build a deterministic country conflict-exposure module from governed UCDP evidence.",
      "Define recency, severity, conflict-type and country-attribution rules.",
      "Validate country coverage and backtest before enabling the module for decisions.",
    ],
  },
  geoeconomic_trade: {
    module: "geoeconomic_trade",
    status: "BLOCKED_SOURCE_RIGHTS",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["ofac_sanctions", "unsc_sanctions"],
    blockers: [
      "Current sanctions adapter path remains REVIEW_REQUIRED/UNVERIFIED for paid delivery.",
      "Trade/export-control/tariff coverage is not yet governed as a complete module input set.",
    ],
    promotion_requirements: [
      "Close exact OFAC/UNSC adapter commercial-use and delivery review.",
      "Add governed export-control, tariff and trade-restriction inputs where required.",
      "Version sanctions/trade scoring and validate country/corridor attribution.",
    ],
  },
  political_governance: {
    module: "political_governance",
    status: "SOURCE_READY",
    coverage_ceiling: "LIMITED",
    governed_sources: ["world_bank_wgi_political_stability"],
    blockers: [
      "WGI political-stability evidence is governed but still marked evidence-only for the older GRO methodology.",
      "Risk Gate v2 political-governance module builder is not yet implemented.",
    ],
    promotion_requirements: [
      "Create a separately versioned v2 WGI political-governance module methodology.",
      "Preserve WGI uncertainty/source-count context in module confidence.",
      "Add complementary governance/rule-of-law inputs before raising the coverage ceiling.",
    ],
  },
  sovereign_fiscal: {
    module: "sovereign_fiscal",
    status: "SUPPORTED",
    coverage_ceiling: "LIMITED",
    governed_sources: ["world_bank_indicators"],
    blockers: [
      "Current supported scope covers normalized central-government debt, not the full sovereign-fiscal ontology.",
    ],
    promotion_requirements: [
      "Add governed deficit, reserves, debt-service and external-funding inputs.",
      "Raise coverage only after the expanded methodology is versioned and validated.",
    ],
  },
  macro_monetary: {
    module: "macro_monetary",
    status: "SUPPORTED",
    coverage_ceiling: "PARTIAL",
    governed_sources: ["world_bank_indicators"],
    blockers: [
      "Current supported scope covers inflation, real GDP growth and unemployment; policy-rate, external-balance and liquidity signals are not yet active.",
    ],
    promotion_requirements: [
      "Add governed policy-rate, current-account/balance-of-payments and liquidity inputs.",
      "Raise coverage only after the expanded methodology is versioned and validated.",
    ],
  },
  currency_capital_mobility: {
    module: "currency_capital_mobility",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["imf_data", "bis_statistics"],
    blockers: [
      "IMF and BIS production source rights/adapter readiness are not yet closed in the current registry.",
      "FX volatility, reserves, convertibility and capital-control inputs are not yet a governed module dataset.",
    ],
    promotion_requirements: [
      "Close exact IMF/BIS dataset terms and production adapters or select equivalent governed sources.",
      "Implement reserve/FX/capital-control normalizations and version the module methodology.",
    ],
  },
  banking_financial_system: {
    module: "banking_financial_system",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["bis_statistics", "world_bank_indicators"],
    blockers: [
      "Current governed production inputs do not cover banking funding, deposits, credit stress and contagion sufficiently.",
      "BIS adapter/source review is not production-ready.",
    ],
    promotion_requirements: [
      "Operationalize governed banking/credit/funding datasets.",
      "Define systemic-stress and contagion methodology with country coverage tests.",
    ],
  },
  payments_treasury: {
    module: "payments_treasury",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No complete governed global payment-rail/correspondent-banking disruption dataset is active yet.",
    ],
    promotion_requirements: [
      "Add governed payment-rail, settlement, banking-holiday and correspondent-banking signals.",
      "Define action-specific treasury/payment disruption scoring and freshness SLAs.",
    ],
  },
  supply_chain_logistics: {
    module: "supply_chain_logistics",
    status: "BLOCKED_ADAPTER",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["un_comtrade", "jrc_rmis_supply_chain"],
    blockers: [
      "UN Comtrade exact API tier/derived-output terms are not closed for production.",
      "JRC RMIS stable machine-readable adapter is not yet operational.",
      "Port/route/chokepoint disruption coverage is incomplete.",
    ],
    promotion_requirements: [
      "Close a governed trade-flow adapter and source-rights contract.",
      "Add port, route and chokepoint operational signals with geographic entity mapping.",
      "Implement dependency/concentration and route-disruption methodology.",
    ],
  },
  energy_commodities: {
    module: "energy_commodities",
    status: "BLOCKED_METHODOLOGY",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["usgs_mcs"],
    blockers: [
      "USGS MCS is governed and operational, but mineral quantities are intentionally non-directional without dependency/concentration context.",
      "Energy, food and broader commodity coverage is incomplete.",
    ],
    promotion_requirements: [
      "Implement supply dependency and concentration methodology for critical minerals.",
      "Add governed energy/food/commodity disruption inputs before broad module coverage claims.",
    ],
  },
  regulatory_legal: {
    module: "regulatory_legal",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No governed global regulatory/legal change corpus with production scoring rules is active yet.",
    ],
    promotion_requirements: [
      "Add official regulatory/legal source families with jurisdiction mapping.",
      "Define licensing, investment, tax, data-localization and product-ban scoring rules.",
    ],
  },
  infrastructure_cyber_technology: {
    module: "infrastructure_cyber_technology",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No complete governed global infrastructure/cyber/telecom outage source set is active yet.",
    ],
    promotion_requirements: [
      "Add governed outage/cyber/infrastructure sources with location and impact normalization.",
      "Separate observed disruption from unverified incident reporting before scoring.",
    ],
  },
  climate_environment_hazard: {
    module: "climate_environment_hazard",
    status: "BLOCKED_METHODOLOGY",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["reliefweb", "gdacs"],
    blockers: [
      "ReliefWeb is derived-only and GDACS production rights are not yet closed.",
      "Hazard severity, exposure and financial-action transmission methodology is not versioned.",
    ],
    promotion_requirements: [
      "Close exact hazard-source delivery rights or use an alternative governed source.",
      "Implement event severity, geographic exposure and decay methodology.",
    ],
  },
  societal_labor_health: {
    module: "societal_labor_health",
    status: "BLOCKED_METHODOLOGY",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["unhcr_refugee_statistics", "world_bank_indicators"],
    blockers: [
      "UNHCR absolute displacement metrics require population-share normalization before comparable risk scoring.",
      "Public-health and strike/labor-disruption coverage is incomplete.",
    ],
    promotion_requirements: [
      "Implement population-normalized displacement stress using governed population denominators.",
      "Add governed public-health and labor-disruption inputs before broader coverage claims.",
    ],
  },
  information_influence: {
    module: "information_influence",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No production-grade governed misinformation/information-integrity dataset is active.",
      "News discovery alone must not be treated as verified information-influence scoring.",
    ],
    promotion_requirements: [
      "Add governed information-integrity/interference sources and corroboration rules.",
      "Validate false-information detection separately from ordinary negative-news intensity.",
    ],
  },
  emerging_long_tail: {
    module: "emerging_long_tail",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["reliefweb", "gdelt_gal"],
    blockers: [
      "Long-tail detection currently functions as watch/discovery context, not a validated broad scoring module.",
      "Novel risks require corroboration and explicit promotion before they can affect an action score.",
    ],
    promotion_requirements: [
      "Implement typed anomaly discovery with corroboration, provenance and promotion thresholds.",
      "Require a versioned driver mapping before any newly discovered risk contributes to scoring.",
    ],
  },
} as const satisfies Record<RiskGateV2Module, RiskGateV2ModuleSupportReadiness>;

export function getRiskGateV2SupportedModules(): RiskGateV2Module[] {
  return Object.values(RISK_GATE_V2_SUPPORT_READINESS)
    .filter((item) => item.status === "SUPPORTED")
    .map((item) => item.module);
}

export function getRiskGateV2PromotionBacklog(): RiskGateV2ModuleSupportReadiness[] {
  return Object.values(RISK_GATE_V2_SUPPORT_READINESS)
    .filter((item) => item.status !== "SUPPORTED");
}
