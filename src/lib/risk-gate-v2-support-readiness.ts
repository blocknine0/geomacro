import type {
  RiskGateV2CoverageState,
  RiskGateV2Module,
} from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_SUPPORT_READINESS_VERSION =
  "risk-gate-v2-support-readiness-0.5.0" as const;

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
  coverage_ceiling: RiskGateV2CoverageState;
  governed_sources: readonly string[];
  blockers: readonly string[];
  promotion_requirements: readonly string[];
};

/**
 * `SUPPORTED` means there is a deterministic, versioned module-state builder
 * backed by governed inputs. It does not mean every subject has coverage or
 * that the module spans its complete long-term ontology.
 */
export const RISK_GATE_V2_SUPPORT_READINESS = {
  geopolitical_security: {
    module: "geopolitical_security",
    status: "SUPPORTED",
    coverage_ceiling: "LIMITED",
    governed_sources: ["ucdp_candidate", "world_bank_indicators"],
    blockers: [
      "Current supported scope is population-normalized organized-violence exposure; coups, elections, protests, territorial disputes and diplomatic risk are not yet active.",
    ],
    promotion_requirements: [
      "Add governed non-conflict political-security dimensions and validated UCDP conflict-type attribution before raising coverage.",
    ],
  },
  geoeconomic_trade: {
    module: "geoeconomic_trade",
    status: "BLOCKED_SOURCE_RIGHTS",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["ofac_sanctions", "unsc_sanctions"],
    blockers: [
      "Sanctions delivery rights and complete trade/export-control coverage are not yet closed.",
    ],
    promotion_requirements: [
      "Close exact sanctions source rights and add governed trade restriction inputs.",
      "Version sanctions/trade scoring and corridor attribution.",
    ],
  },
  political_governance: {
    module: "political_governance",
    status: "SUPPORTED",
    coverage_ceiling: "LIMITED",
    governed_sources: ["world_bank_wgi_political_stability"],
    blockers: [
      "Current supported scope is WGI political stability only; rule of law and policy continuity are not yet active.",
    ],
    promotion_requirements: [
      "Add governed rule-of-law, regulatory-quality and policy-continuity dimensions before raising coverage.",
    ],
  },
  sovereign_fiscal: {
    module: "sovereign_fiscal",
    status: "SUPPORTED",
    coverage_ceiling: "LIMITED",
    governed_sources: ["world_bank_indicators"],
    blockers: [
      "Current supported scope covers normalized central-government debt only.",
    ],
    promotion_requirements: [
      "Add governed deficit, reserves, debt-service and external-funding inputs.",
    ],
  },
  macro_monetary: {
    module: "macro_monetary",
    status: "SUPPORTED",
    coverage_ceiling: "PARTIAL",
    governed_sources: ["world_bank_indicators"],
    blockers: [
      "Policy-rate, external-balance and liquidity signals are not yet active.",
    ],
    promotion_requirements: [
      "Add governed policy-rate, current-account/balance-of-payments and liquidity inputs.",
    ],
  },
  currency_capital_mobility: {
    module: "currency_capital_mobility",
    status: "SUPPORTED",
    coverage_ceiling: "PARTIAL",
    governed_sources: ["world_bank_indicators"],
    blockers: [
      "Current supported scope covers reserve adequacy and current-account pressure; explicit capital controls, convertibility restrictions and market FX volatility are not yet active.",
    ],
    promotion_requirements: [
      "Add governed capital-control/convertibility policy data and high-frequency FX-volatility inputs before raising coverage.",
    ],
  },
  banking_financial_system: {
    module: "banking_financial_system",
    status: "SUPPORTED",
    coverage_ceiling: "PARTIAL",
    governed_sources: ["world_bank_indicators"],
    blockers: [
      "Current supported scope covers NPL burden, bank capital buffers and bank liquid-reserve buffers; deposit flight, interbank funding and contagion are not yet active.",
    ],
    promotion_requirements: [
      "Add governed deposit/funding/contagion signals before raising coverage.",
    ],
  },
  payments_treasury: {
    module: "payments_treasury",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No complete governed payment-rail/correspondent-banking disruption input set is active.",
    ],
    promotion_requirements: [
      "Add payment-rail, settlement, banking-holiday and correspondent-banking signals with freshness rules.",
    ],
  },
  supply_chain_logistics: {
    module: "supply_chain_logistics",
    status: "BLOCKED_ADAPTER",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["un_comtrade", "jrc_rmis_supply_chain"],
    blockers: [
      "Stable governed trade-flow and route/chokepoint adapters are not yet operational.",
    ],
    promotion_requirements: [
      "Operationalize governed trade-flow, port, route and chokepoint signals and dependency scoring.",
    ],
  },
  energy_commodities: {
    module: "energy_commodities",
    status: "SUPPORTED",
    coverage_ceiling: "LIMITED",
    governed_sources: ["usgs_mcs"],
    blockers: [
      "Current supported scope is verified critical-mineral extraction concentration only. Commodities with withheld, nonnumeric, ambiguous or incomplete extraction series fail closed; energy, food, price shocks and active commodity disruptions are not yet scored.",
    ],
    promotion_requirements: [
      "Add governed net-import reliance and major-source dependency signals, then version energy, food and market-price transmission methodologies before raising coverage.",
    ],
  },
  regulatory_legal: {
    module: "regulatory_legal",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No governed global regulatory/legal change corpus with jurisdiction scoring is active.",
    ],
    promotion_requirements: [
      "Add official jurisdiction-mapped regulatory/legal sources and version change-impact rules.",
    ],
  },
  infrastructure_cyber_technology: {
    module: "infrastructure_cyber_technology",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No complete governed global infrastructure/cyber/telecom disruption set is active.",
    ],
    promotion_requirements: [
      "Add verified outage/cyber/infrastructure sources with geographic impact normalization.",
    ],
  },
  climate_environment_hazard: {
    module: "climate_environment_hazard",
    status: "BLOCKED_METHODOLOGY",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["reliefweb", "gdacs"],
    blockers: [
      "Hazard delivery-rights boundary and financial-transmission methodology are not yet fully closed.",
    ],
    promotion_requirements: [
      "Close exact hazard-source delivery rights and version severity/exposure/decay scoring.",
    ],
  },
  societal_labor_health: {
    module: "societal_labor_health",
    status: "SUPPORTED",
    coverage_ceiling: "LIMITED",
    governed_sources: ["unhcr_refugee_statistics", "world_bank_indicators"],
    blockers: [
      "Current supported scope is population-normalized displacement/migration stress; labour and public-health signals are not yet active.",
    ],
    promotion_requirements: [
      "Add governed public-health and labour-disruption inputs before raising coverage.",
    ],
  },
  information_influence: {
    module: "information_influence",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: [],
    blockers: [
      "No production-grade governed information-integrity/interference dataset is active.",
    ],
    promotion_requirements: [
      "Add corroborated information-integrity/interference sources and separate false-information scoring from news intensity.",
    ],
  },
  emerging_long_tail: {
    module: "emerging_long_tail",
    status: "BLOCKED_DATA_COVERAGE",
    coverage_ceiling: "INSUFFICIENT",
    governed_sources: ["reliefweb", "gdelt_gal"],
    blockers: [
      "Long-tail discovery is watch context, not a validated scoring module.",
    ],
    promotion_requirements: [
      "Implement typed anomaly discovery, corroboration and versioned promotion thresholds before score contribution.",
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
