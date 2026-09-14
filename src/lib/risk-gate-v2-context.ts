import {
  RISK_GATE_V2_DEFAULT_ACTION_MODULES,
  RISK_GATE_V2_MODULES,
  type RiskGateV2Module,
  type RiskGateV2SubjectType,
} from "./risk-gate-v2-taxonomy";
import {
  RISK_GATE_V2_REQUEST_SCHEMA_VERSION,
  type RiskGateV2Request,
} from "./risk-gate-v2-contract";

export type RiskGateV2ActivationPlan = {
  version: "risk-gate-v2-context-1.0.0";
  request_id: string;
  active_modules: RiskGateV2Module[];
  watch_modules: RiskGateV2Module[];
  activation_reasons: Partial<Record<RiskGateV2Module, string[]>>;
};

const SUBJECT_MODULES: Partial<
  Record<RiskGateV2SubjectType, readonly RiskGateV2Module[]>
> = {
  country: [
    "geopolitical_security",
    "political_governance",
    "sovereign_fiscal",
    "macro_monetary",
  ],
  corridor: [
    "geopolitical_security",
    "geoeconomic_trade",
    "currency_capital_mobility",
    "payments_treasury",
    "supply_chain_logistics",
  ],
  region: [
    "geopolitical_security",
    "geoeconomic_trade",
    "macro_monetary",
    "supply_chain_logistics",
  ],
  subnational: [
    "political_governance",
    "infrastructure_cyber_technology",
    "climate_environment_hazard",
    "societal_labor_health",
  ],
  city: [
    "infrastructure_cyber_technology",
    "climate_environment_hazard",
    "societal_labor_health",
  ],
  port: [
    "geopolitical_security",
    "supply_chain_logistics",
    "infrastructure_cyber_technology",
    "climate_environment_hazard",
  ],
  airport: [
    "geopolitical_security",
    "supply_chain_logistics",
    "infrastructure_cyber_technology",
    "climate_environment_hazard",
  ],
  border_crossing: [
    "geopolitical_security",
    "geoeconomic_trade",
    "political_governance",
    "supply_chain_logistics",
  ],
  chokepoint: [
    "geopolitical_security",
    "supply_chain_logistics",
    "energy_commodities",
    "climate_environment_hazard",
  ],
  logistics_route: [
    "geopolitical_security",
    "supply_chain_logistics",
    "energy_commodities",
    "climate_environment_hazard",
  ],
  energy_route: [
    "geopolitical_security",
    "energy_commodities",
    "supply_chain_logistics",
    "infrastructure_cyber_technology",
  ],
  currency_pair: [
    "macro_monetary",
    "currency_capital_mobility",
    "banking_financial_system",
  ],
  commodity: [
    "geopolitical_security",
    "geoeconomic_trade",
    "supply_chain_logistics",
    "energy_commodities",
  ],
  market: [
    "geopolitical_security",
    "macro_monetary",
    "banking_financial_system",
  ],
  sector: [
    "geoeconomic_trade",
    "macro_monetary",
    "regulatory_legal",
  ],
  counterparty_exposure: [
    "political_governance",
    "sovereign_fiscal",
    "banking_financial_system",
    "regulatory_legal",
  ],
  portfolio_exposure: [
    "geopolitical_security",
    "macro_monetary",
    "banking_financial_system",
  ],
  event: [
    "geopolitical_security",
    "information_influence",
    "emerging_long_tail",
  ],
};

function moduleOrder(module: RiskGateV2Module) {
  return RISK_GATE_V2_MODULES.indexOf(module);
}

function normalizeIso3(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Risk Gate v2 country codes must be ISO3");
  }
  return normalized;
}

export function buildRiskGateV2ActivationPlan(
  request: RiskGateV2Request,
): RiskGateV2ActivationPlan {
  if (request.schema_version !== RISK_GATE_V2_REQUEST_SCHEMA_VERSION) {
    throw new Error("Unsupported Risk Gate v2 request schema");
  }

  if (!request.request_id.trim()) {
    throw new Error("Risk Gate v2 request_id is required");
  }

  if (!request.primary_subject.id.trim()) {
    throw new Error("Risk Gate v2 primary subject id is required");
  }

  normalizeIso3(request.action_context.origin_country_iso3);
  normalizeIso3(request.action_context.destination_country_iso3);

  const active = new Set<RiskGateV2Module>();
  const watch = new Set<RiskGateV2Module>([
    "emerging_long_tail",
    "information_influence",
  ]);
  const reasons = new Map<RiskGateV2Module, Set<string>>();

  const activate = (module: RiskGateV2Module, reason: string) => {
    active.add(module);
    watch.delete(module);
    const current = reasons.get(module) ?? new Set<string>();
    current.add(reason);
    reasons.set(module, current);
  };

  const watchModule = (module: RiskGateV2Module, reason: string) => {
    if (!active.has(module)) watch.add(module);
    const current = reasons.get(module) ?? new Set<string>();
    current.add(reason);
    reasons.set(module, current);
  };

  for (const module of
    RISK_GATE_V2_DEFAULT_ACTION_MODULES[request.action_context.action_type] ?? []) {
    activate(module, `action:${request.action_context.action_type}`);
  }

  for (const module of SUBJECT_MODULES[request.primary_subject.type] ?? []) {
    activate(module, `primary_subject:${request.primary_subject.type}`);
  }

  for (const exposure of request.exposures ?? []) {
    if (exposure.type === "currency") {
      activate("currency_capital_mobility", "exposure:currency");
      activate("macro_monetary", "exposure:currency");
      continue;
    }

    for (const module of SUBJECT_MODULES[exposure.type] ?? []) {
      activate(module, `exposure:${exposure.type}:${exposure.role}`);
    }
  }

  if (request.action_context.amount != null) {
    if (!Number.isFinite(request.action_context.amount) || request.action_context.amount < 0) {
      throw new Error("Risk Gate v2 amount must be a non-negative finite number");
    }
  }

  if (request.action_context.sector) {
    activate("regulatory_legal", "action_context:sector");
    activate("geoeconomic_trade", "action_context:sector");
  }

  if (request.action_context.action_type === "autonomous_financial_agent_action") {
    activate("emerging_long_tail", "action:autonomous_financial_agent_action");
    watchModule("information_influence", "watch:agent_information_integrity");
  }

  if (active.size === 0) {
    activate("geopolitical_security", "fallback:minimum_external_risk_context");
    activate("macro_monetary", "fallback:minimum_external_risk_context");
  }

  for (const module of watch) {
    if (!reasons.has(module)) {
      watchModule(module, "watch:default_long_tail_monitoring");
    }
  }

  return {
    version: "risk-gate-v2-context-1.0.0",
    request_id: request.request_id,
    active_modules: [...active].sort((a, b) => moduleOrder(a) - moduleOrder(b)),
    watch_modules: [...watch].sort((a, b) => moduleOrder(a) - moduleOrder(b)),
    activation_reasons: Object.fromEntries(
      [...reasons.entries()]
        .sort(([a], [b]) => moduleOrder(a) - moduleOrder(b))
        .map(([module, moduleReasons]) => [module, [...moduleReasons].sort()]),
    ),
  };
}
