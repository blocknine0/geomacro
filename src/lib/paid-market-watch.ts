/**
 * Source-private, zero-additional-read paid market watch.
 * Only names market channels from modules, GRO drivers, or events ALREADY
 * independently admitted by the canonical paid query. Never invents prices,
 * market direction, a news event, a new signature or source authority.
 */
export const GEOMACRO_PAID_MARKET_WATCH_VERSION = "geomacro.paid-market-watch.v1" as const;

type Basis = "VERIFIED_STRUCTURAL_MODULE" | "VERIFIED_SIGNED_GRO_DRIVER" |
  "QUALIFIED_CURRENT_DERIVED_EVENT";

type Channel = Readonly<{
  key: string;
  dimension: string;
  market: string;
  transmission: string;
  intensifies: string;
  eases: string;
  indicator: string;
  referenceInstruments: readonly string[];
  instrumentScope: string;
}>;

const CHANNELS: readonly Channel[] = [
  {key:"fx",dimension:"external_fx",market:"Foreign-exchange rates",
    transmission:"External-balance or currency conditions can change the cost of cross-border transactions.",
    intensifies:"Further independently verified external FX strain could increase currency volatility; price direction is not established.",
    eases:"Verified easing of FX strain could reduce volatility; no currency appreciation is assumed.",
    indicator:"Official exchange-rate, reserve or balance-of-payments release",
    referenceInstruments:["Subject-currency/USD pair (only after currency-code and liquidity confirmation)","US Dollar Index (DXY)"],
    instrumentScope:"Reference instruments only; the subject currency and executable venue are not resolved here."},
  {key:"rates",dimension:"macro_monetary",market:"Government bond yields",
    transmission:"Monetary-policy conditions can change discount rates and bond pricing.",
    intensifies:"Verified tightening signals could put upward pressure on yields, depending on market expectations.",
    eases:"Verified easing signals could put downward pressure on yields, depending on market expectations.",
    indicator:"Central-bank decision, inflation or official rates release",
    referenceInstruments:["Subject sovereign 2-year yield","Subject sovereign 10-year yield","US Treasury 2-year and 10-year yields for cross-market context"],
    instrumentScope:"Yield references only; bonds, curve conventions and live quotes require instrument-level verification."},
  {key:"fiscal",dimension:"sovereign_fiscal",market:"Sovereign bond yields / spreads",
    transmission:"Debt and fiscal developments may change the premium demanded by lenders.",
    intensifies:"Verified deterioration in fiscal metrics could widen spreads if market expectations also deteriorate.",
    eases:"Verified fiscal improvement could narrow spreads if independently confirmed.",
    indicator:"Official budget, debt, issuance or fiscal update",
    referenceInstruments:["Subject sovereign USD bond spread","Subject sovereign 5-year CDS (if actively quoted)"],
    instrumentScope:"Credit references only; availability, tenor and liquidity vary by issuer."},
  {key:"security",dimension:"geopolitical_security",market:"Gold (XAU/USD)",
    transmission:"Security uncertainty may alter demand for liquid defensive assets.",
    intensifies:"Verified escalation could support defensive demand for gold; yields and USD may offset that effect.",
    eases:"Verified de-escalation could reduce defensive demand; no specific gold move is forecast.",
    indicator:"New independently qualified escalation or de-escalation evidence",
    referenceInstruments:["Gold spot reference (XAU/USD)","US Treasury 10-year yield","US Dollar Index (DXY)"],
    instrumentScope:"Cross-asset references only; geopolitical evidence does not establish causation or a price direction."},
  {key:"sanctions",dimension:"sanctions_restrictions",market:"Trade-exposed FX / import costs",
    transmission:"Sanctions and restrictions may alter payment access and import prices.",
    intensifies:"New verified restrictions could increase affected import costs; the FX response is uncertain.",
    eases:"Verified relaxation could lower some trade frictions; the impact depends on actual flows.",
    indicator:"Effective sanctions, licensing or export-control announcement",
    referenceInstruments:["Subject-currency/USD pair (only after currency-code and liquidity confirmation)","Commodity futures for the specifically affected import or export"],
    instrumentScope:"The affected currency and commodity must be established from the verified measure before selecting a contract."},
  {key:"corridor",dimension:"trade_corridor",market:"Freight / shipping rates",
    transmission:"Corridor disruption and rerouting can affect freight costs and delivery time.",
    intensifies:"A verified routing restriction could raise affected freight costs if capacity is constrained.",
    eases:"Verified reopening or added capacity could reduce freight pressure, conditional on demand.",
    indicator:"Confirmed port, corridor, customs or shipping capacity change",
    referenceInstruments:["Baltic Dry Index (BDI)","Route-specific freight forward agreements (where available)","ICE Brent crude futures (only for energy transit exposure)"],
    instrumentScope:"Freight indices are broad proxies; validate the named route, vessel class and contract before use."},
  {key:"energy",dimension:"energy_commodities",market:"Crude oil / energy benchmarks",
    transmission:"Energy supply and transport disruptions can affect benchmark commodity prices.",
    intensifies:"Verified disruption to available energy supply could add upward pressure if demand holds.",
    eases:"Verified supply restoration could ease pressure if other factors remain stable.",
    indicator:"Verified production, inventory, embargo or energy transport update",
    referenceInstruments:["ICE Brent crude futures (BRN)","NYMEX WTI crude futures (CL)","Dutch TTF natural-gas futures (for European gas exposure)"],
    instrumentScope:"Select only the benchmark connected to the verified commodity, region and affected flow."},
  {key:"minerals",dimension:"critical_minerals",market:"Critical-minerals price benchmarks",
    transmission:"Mineral production and export policy can affect upstream supply and downstream input costs.",
    intensifies:"A verified supply constraint could lift affected mineral prices, only where the specific mineral is confirmed.",
    eases:"Verified new capacity or relaxed controls could ease constraints; mineral-specific confirmation is required.",
    indicator:"Official mineral-specific export, mine capacity or production update",
    referenceInstruments:["COMEX copper futures (HG) / LME copper (for copper evidence)","Lithium benchmark (venue and grade specific)","Rare-earth benchmark (element and product specific)"],
    instrumentScope:"Mineral, grade, delivery location and benchmark must match; there is no interchangeable single critical-minerals contract."},
  {key:"agri",dimension:"food_agriculture",market:"Agricultural commodity prices",
    transmission:"Crop, logistics or food policy can affect agricultural input availability.",
    intensifies:"A verified physical supply loss could support affected crop prices, subject to inventories.",
    eases:"Verified output recovery could reduce supply pressure, subject to demand.",
    indicator:"Official crop, inventory or export-policy release",
    referenceInstruments:["CBOT wheat futures (ZW)","CBOT corn futures (ZC)"],
    instrumentScope:"Use only the crop and delivery region matched to the verified evidence."},
  {key:"bank",dimension:"banking_financial_system",market:"Bank funding spreads",
    transmission:"Bank liquidity and credit conditions can alter funding costs.",
    intensifies:"Verified deterioration could increase funding spreads if markets reprice credit risk.",
    eases:"Verified strengthening could ease spreads, without guaranteeing a price move.",
    indicator:"Bank liquidity, funding or supervisory data release",
    referenceInstruments:["Affected bank senior-credit spread (if quoted)","Bank funding spreads"],
    instrumentScope:"Issuer-specific credit references require the bank identity, seniority and liquid quote to be verified."},
  {key:"gov",dimension:"political_governance",market:"Sovereign credit spreads",
    transmission:"Governance changes may alter country risk premiums over time.",
    intensifies:"Verified governance deterioration could raise risk premiums; this is not a live market quote.",
    eases:"Verified improvement could lower premiums over time, conditional on financing conditions.",
    indicator:"Official governance or institutional assessment update",
    referenceInstruments:["Subject sovereign USD bond spread","Subject sovereign 5-year CDS (if actively quoted)"],
    instrumentScope:"Country-credit references only; an institutional assessment is not an executable market signal."},
  {key:"hazard",dimension:"natural_hazards",market:"Transport / insurance costs",
    transmission:"Physical disruptions can affect transport capacity and insured losses.",
    intensifies:"Verified damage or prolonged closure could raise affected transport and insurance costs.",
    eases:"Verified restoration may reduce disruption-related cost pressure.",
    indicator:"Verified infrastructure closure, damage or reopening update",
    referenceInstruments:["Route or port-specific freight rates","Marine insurance premium indicators","Affected commodity futures (only where physical exposure is verified)"],
    instrumentScope:"The damaged asset, route and affected commodity must be verified before treating any instrument as exposed."},
];

const DIMENSION_ALIASES: Readonly<Record<string,RegExp>> = {
  external_fx:/\b(?:external[_ ]fx|currency|fx|exchange[_ -]?rate|balance[_ -]?of[_ -]?payment)\b/i,
  macro_monetary:/\b(?:macro[_ ]monetary|monetary|interest[_ -]?rate|inflation|central[_ -]?bank)\b/i,
  sovereign_fiscal:/\b(?:sovereign[_ ]fiscal|fiscal|sovereign[_ -]?debt|budget)\b/i,
  geopolitical_security:/\b(?:geopolitical[_ ]security|conflict|security|escalat|war|geopolitic)\b/i,
  sanctions_restrictions:/\b(?:sanction|restriction|export[_ -]?control|embargo)\b/i,
  trade_corridor:/\b(?:trade[_ ]corridor|shipping|maritime|corridor|tariff|freight|trade)\b/i,
  energy_commodities:/\b(?:energy[_ ]commodities|oil|gas|energy)\b/i,
  critical_minerals:/\b(?:critical[_ ]minerals|mineral|rare[_ -]?earth|copper|lithium|nickel|cobalt)\b/i,
  food_agriculture:/\b(?:food[_ ]agriculture|agricultur|grain|wheat|crop)\b/i,
  banking_financial_system:/\b(?:banking[_ ]financial[_ ]system|bank[_ -]?funding|liquidity|banking)\b/i,
  political_governance:/\b(?:political[_ ]governance|governance|institution)\b/i,
  natural_hazards:/\b(?:natural[_ ]hazards|flood|earthquake|storm|drought)\b/i,
};

function normalizeDimension(value: string): string | null {
  if (value.length > 160) return null;
  for (const [dimension, pattern] of Object.entries(DIMENSION_ALIASES)) {
    if (pattern.test(value)) return dimension;
  }
  return null;
}
export function paidMarketWatchLimitFor(capability: string | null,variant: string | null):number {
  if(capability==="structural_country_digest"||capability==="structural_corridor_digest")return 1;
  if(capability==="signed_risk_object")return 2;
  if(capability==="intelligence_query")return variant==="complex_multi_source"?5:variant==="standard"?3:2;
  return 3; // legacy/no explicit buyer product; never expands SKU.
}
export type MarketWatchInput = Readonly<{
  capability: string | null;
  variant: string | null;
  state_version: string | null;
  verified_dimensions: readonly string[];
  verified_signed_drivers: readonly string[];
  qualified_event_types: readonly string[];
  latest_evidence_at: string | null;
  refresh_not_before_seconds: number | null;
}>;

export function buildPaidMarketWatch(input:MarketWatchInput) {
  // Risk Gate is Coming Soon. Nothing here enables its public sale.
  const basisByDimension=new Map<string,Basis>();
  for(const label of input.verified_dimensions){
    const dimension=normalizeDimension(label);
    if(dimension)basisByDimension.set(dimension,"VERIFIED_STRUCTURAL_MODULE");
  }
  for(const driver of input.verified_signed_drivers){
    const dimension=normalizeDimension(driver);
    if(dimension)basisByDimension.set(dimension,"VERIFIED_SIGNED_GRO_DRIVER");
  }
  // Only events already independently accepted on the paid hot-topic path.
  for(const eventType of input.qualified_event_types){
    const dimension=normalizeDimension(eventType);
    if(dimension)basisByDimension.set(dimension,"QUALIFIED_CURRENT_DERIVED_EVENT");
  }

  // Under a small paid SKU cap, genuinely qualified current events take
  // precedence over signed risk drivers, then slower structural context.
  // Order within each proof class is stable; no market price or impact score
  // is inferred from a topic label.
  const priority:Record<Basis,number>={
    QUALIFIED_CURRENT_DERIVED_EVENT:0,
    VERIFIED_SIGNED_GRO_DRIVER:1,
    VERIFIED_STRUCTURAL_MODULE:2,
  };
  const items=CHANNELS.filter(channel=>basisByDimension.has(channel.dimension))
    .sort((a,b)=>priority[basisByDimension.get(a.dimension)!]-priority[basisByDimension.get(b.dimension)!])
    .slice(0,paidMarketWatchLimitFor(input.capability,input.variant)).map(channel=>({
      watch_id:channel.key,
      market:channel.market,
      reference_instruments:[...channel.referenceInstruments],
      instrument_scope_status:"REFERENCE_CANDIDATES_ONLY" as const,
      instrument_scope:channel.instrumentScope,
      indicator_to_watch:channel.indicator,
      transmission_channel:channel.transmission,
      scenario_if_disruption_intensifies:channel.intensifies,
      scenario_if_pressure_eases:channel.eases,
      evidence_dimension:channel.dimension,
      evidence_basis:basisByDimension.get(channel.dimension)!,
      evidence_class:basisByDimension.get(channel.dimension)==="QUALIFIED_CURRENT_DERIVED_EVENT"
        ? "QUALIFIED_EVENT" as const : basisByDimension.get(channel.dimension)==="VERIFIED_SIGNED_GRO_DRIVER"
          ? "SIGNED_RISK_DRIVER" as const : "STRUCTURAL_CONTEXT" as const,
      evidence_as_of:input.latest_evidence_at,
      current_market_price:null,
      estimated_price_change_pct:null,
      predicted_direction:"NOT_ESTABLISHED" as const,
      scenario_only:true as const,
    }));
  const refresh=Math.max(900,Math.min(86400,Math.trunc(input.refresh_not_before_seconds??21600)));
  return {
    schema_version:GEOMACRO_PAID_MARKET_WATCH_VERSION,
    status:items.length?"CONDITIONAL_MARKET_WATCH":"NO_QUALIFIED_MARKET_LINKAGE",
    items,
    monitoring:{
      state_version:input.state_version,
      recommended_not_before_seconds:refresh,
      requery_when:"NEW_QUALIFIED_EVIDENCE_OR_STATE_VERSION_CHANGE",
      do_not_assume_a_new_paid_delivery_when_unchanged:true,
    },
    limitations:{
      actual_market_prices_included:false,
      live_quotes_included:false,
      market_direction_verified:false,
      quantitative_forecast_included:false,
      asset_specificity_may_require_further_evidence:true,
      reference_instruments_are_not_confirmed_exposure:true,
      private_inputs_exposed:false,
      execution_authorized:false,
    },
    trader_checklist:[
      "Confirm the affected asset, currency, contract specification and trading venue against the verified evidence.",
      "Independently verify current executable price, bid-ask spread, liquidity, session status and quote timestamp.",
      "Compare the evidence with market expectations and independent confirmation before interpreting a reaction.",
      "Set position size, invalidation level and risk limits in the trader's own system; GeoMacro does not authorize execution.",
    ],
  } as const;
}
