export const EARLY_WARNING_EVENT_FAMILIES = [
  "conflict",
  "sanctions",
  "political_instability",
  "trade_policy",
  "monetary_policy",
  "inflation",
  "labor_market",
  "currency_fx",
  "sovereign_fiscal",
  "banking_liquidity",
  "capital_controls",
  "shipping_logistics",
  "commodity_supply",
  "critical_minerals",
  "natural_disaster",
  "regulatory_policy",
  "cyber_infrastructure",
  "other",
] as const;

export type EarlyWarningEventFamily =
  (typeof EARLY_WARNING_EVENT_FAMILIES)[number];

const FAMILY_SET = new Set<string>(EARLY_WARNING_EVENT_FAMILIES);

const ALIASES: Readonly<Record<string, EarlyWarningEventFamily>> = Object.freeze({
  war: "conflict",
  armed_conflict: "conflict",
  military_escalation: "conflict",
  geopolitical_conflict: "conflict",
  sanctions_designation: "sanctions",
  sanctions_update: "sanctions",
  export_controls: "trade_policy",
  export_restriction: "trade_policy",
  import_restriction: "trade_policy",
  tariff: "trade_policy",
  tariffs: "trade_policy",
  rate_decision: "monetary_policy",
  interest_rate: "monetary_policy",
  central_bank_policy: "monetary_policy",
  cpi: "inflation",
  inflation_data: "inflation",
  jobs: "labor_market",
  unemployment: "labor_market",
  fx: "currency_fx",
  currency: "currency_fx",
  sovereign_debt: "sovereign_fiscal",
  fiscal_stress: "sovereign_fiscal",
  debt_distress: "sovereign_fiscal",
  bank_stress: "banking_liquidity",
  banking_stress: "banking_liquidity",
  liquidity_stress: "banking_liquidity",
  capital_control: "capital_controls",
  border_closure: "shipping_logistics",
  port_closure: "shipping_logistics",
  shipping_disruption: "shipping_logistics",
  oil_supply: "commodity_supply",
  gas_supply: "commodity_supply",
  energy_supply: "commodity_supply",
  rare_earths: "critical_minerals",
  minerals: "critical_minerals",
  earthquake: "natural_disaster",
  flood: "natural_disaster",
  wildfire: "natural_disaster",
  cyclone: "natural_disaster",
  hurricane: "natural_disaster",
  regulation: "regulatory_policy",
  regulatory_change: "regulatory_policy",
  cyberattack: "cyber_infrastructure",
  cyber_attack: "cyber_infrastructure",
  infrastructure_outage: "cyber_infrastructure",
});

export const EARLY_WARNING_CANDIDATE_TRANSMISSION_CHANNELS: Readonly<
  Record<EarlyWarningEventFamily, readonly string[]>
> = Object.freeze({
  conflict: ["risk_appetite", "commodity_supply", "shipping", "currency", "capital_flows"],
  sanctions: ["trade", "payments", "currency", "commodity_supply", "capital_flows"],
  political_instability: ["currency", "capital_flows", "sovereign_risk", "equities"],
  trade_policy: ["trade", "supply_chain", "inflation", "corporate_margins", "currency"],
  monetary_policy: ["rates", "currency", "capital_flows", "equities", "crypto_risk_appetite"],
  inflation: ["rates", "currency", "real_income", "corporate_margins"],
  labor_market: ["rates", "consumption", "currency", "equities"],
  currency_fx: ["currency", "inflation", "foreign_debt", "capital_flows"],
  sovereign_fiscal: ["sovereign_yields", "currency", "banking", "capital_flows"],
  banking_liquidity: ["banking", "credit", "liquidity", "risk_appetite", "currency"],
  capital_controls: ["capital_flows", "currency", "payments", "liquidity"],
  shipping_logistics: ["shipping", "supply_chain", "commodity_supply", "inflation"],
  commodity_supply: ["commodity_prices", "inflation", "trade_balance", "corporate_margins"],
  critical_minerals: ["supply_chain", "manufacturing", "trade", "commodity_prices"],
  natural_disaster: ["infrastructure", "supply_chain", "insurance", "commodity_supply"],
  regulatory_policy: ["compliance", "capital_flows", "sector_margins", "market_access"],
  cyber_infrastructure: ["infrastructure", "payments", "operations", "liquidity"],
  other: [],
});

function normalizeToken(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * This is exact normalization, not fuzzy prediction. Unknown labels fail into
 * `other` instead of guessing a high-impact family.
 */
export function normalizeEarlyWarningEventFamily(
  value: string,
): EarlyWarningEventFamily {
  const token = normalizeToken(value);
  if (FAMILY_SET.has(token)) return token as EarlyWarningEventFamily;
  return ALIASES[token] ?? "other";
}

/**
 * Candidate transmission channels are hypotheses to investigate, not asserted
 * causal outcomes. A customer-facing alert must include only channels supported
 * by its evidence/analysis pipeline.
 */
export function candidateTransmissionChannels(
  family: EarlyWarningEventFamily,
): readonly string[] {
  return EARLY_WARNING_CANDIDATE_TRANSMISSION_CHANNELS[family];
}
