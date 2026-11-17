const ACTIONS=new Set(["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"]);
const CATEGORIES=new Set(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
const CORRIDORS=new Set(["RED_SEA","MALACCA","HORMUZ","PANAMA","SUEZ","BAB_EL_MANDEB","TAIWAN_STRAIT","SOUTH_CHINA_SEA","BLACK_SEA","BOSPORUS","MOZAMBIQUE_CHANNEL","CAPE_OF_GOOD_HOPE",
 "BALTIC_SEA","ARCTIC_NORTHERN_SEA_ROUTE"]);
const ASSETS=Object.freeze({
 GEOPOLITICS:["sovereign_risk","cross_border_trade","shipping_routes","maritime_chokepoints","payment_rails","clearinghouses","war_risk_insurance","freight_indices"],
 MACRO_FX:["foreign_exchange","fx_pairs","interest_rates","sovereign_funding","energy_commodities","bank_capital","bank_liquidity","interbank_funding","equity_indices","capital_flows"],
 CRITICAL_MINERALS:["mineral_supply","critical_minerals","industrial_inputs","mineral_processing","battery_materials","semiconductor_inputs","shipping_routes","maritime_chokepoints"]
});
const ALLOWED_ASSETS=new Set([
 ...Object.values(ASSETS).flat(),"usd_eur","eur_usd","usd_jpy","usd_cny","usd_inr","usd_krw",
 "usd_brl","usd_try","usd_zar","usd_mxn","brent_crude","lng_spot","freight_rates",
 "lithium","cobalt","nickel","copper","rare_earths","ndpr","dysprosium","terbium",
 "graphite","gallium","germanium","antimony","tungsten","manganese","vanadium",
 "titanium","uranium","potash","phosphate","battery_materials","semiconductor_inputs",
 "payment_rails","subsea_cables","pipeline_networks","grid_infrastructure",
 "usd_gbp","usd_chf","usd_cad","usd_aud","usd_sgd","usd_pln",
 "oil_supply","export_controls","sanctions_exposure","wheat",
 "equity_indices","equity_volatility","volatility_indices","sovereign_yields","yield_curves",
 "bond_auctions","credit_spreads","bank_capital","bank_liquidity","interbank_funding",
 "cross_currency_basis","capital_flows","market_microstructure","crypto_liquidity",
 "stablecoin_liquidity","exchange_inventories","warehouse_stocks","cancelled_warrants",
 "curve_spreads","treatment_charges","refining_charges","project_finance","precious_metals",
 "pgm","iron_ore","aluminum","tin","zinc","polysilicon","natural_gas","freight_indices",
 "war_risk_insurance","baltic_dry_index","clearinghouses","foreign_investment","repo_markets",
 "sovereign_fx_reserves","sovereign_wealth_funds","short_selling_controls","ndf_markets",
 "margin_liquidations","commodity_benchmarks","physical_premiums","offtake_finance"
]);
const CORRIDOR_ASSETS=Object.freeze({
 RED_SEA:["brent_crude","lng_spot","freight_rates","shipping_routes","maritime_chokepoints"],
 BAB_EL_MANDEB:["brent_crude","lng_spot","freight_rates","shipping_routes","maritime_chokepoints"],
 SUEZ:["brent_crude","lng_spot","freight_rates","shipping_routes","maritime_chokepoints"],
 MALACCA:["lng_spot","brent_crude","freight_rates","shipping_routes","copper"],
 HORMUZ:["brent_crude","lng_spot","freight_rates","shipping_routes","maritime_chokepoints"],
 PANAMA:["lng_spot","freight_rates","shipping_routes","copper"],
 TAIWAN_STRAIT:["lng_spot","copper","rare_earths","freight_rates","shipping_routes"],
 SOUTH_CHINA_SEA:["lng_spot","copper","rare_earths","freight_rates","shipping_routes"],
 BLACK_SEA:["brent_crude","wheat","freight_rates","shipping_routes","maritime_chokepoints"],
 BOSPORUS:["brent_crude","wheat","freight_rates","shipping_routes","maritime_chokepoints"],
 MOZAMBIQUE_CHANNEL:["lng_spot","copper","freight_rates","shipping_routes","maritime_chokepoints"],
 CAPE_OF_GOOD_HOPE:["brent_crude","lng_spot","freight_rates","shipping_routes","maritime_chokepoints"],
 BALTIC_SEA:["brent_crude","freight_rates","shipping_routes","maritime_chokepoints","war_risk_insurance"],
 ARCTIC_NORTHERN_SEA_ROUTE:["lng_spot","freight_rates","shipping_routes","maritime_chokepoints","war_risk_insurance"]
});
const EVENT_ASSETS=Object.freeze({
 SANCTIONS_LIST_UPDATE:["sanctions_exposure","export_controls"],
 EXPORT_CONTROL_CHANGE:["export_controls","lithium","copper","rare_earths","gallium","germanium","semiconductor_inputs"],
 MINERAL_EXPORT_RESTRICTION:["export_controls","mineral_supply","critical_minerals"],
 MINERAL_PROCESSING_DISRUPTION:["mineral_processing","battery_materials","semiconductor_inputs","industrial_inputs"],
 MINERAL_STOCKPILING:["critical_minerals","mineral_supply"],
 SUBSEA_CABLE_DISRUPTION:["subsea_cables","cross_border_trade"],
 INFRASTRUCTURE_SABOTAGE:["pipeline_networks","grid_infrastructure","energy_commodities"],
 PORT_RAIL_STRIKE:["shipping_routes","freight_rates","cross_border_trade"],
 AIRSPACE_SHIPPING_CLOSURE:["shipping_routes","maritime_chokepoints","freight_rates"],
 BANKING_PAYMENT_RESTRICTION:["payment_rails","fx_pairs","sovereign_funding"],
 SOVEREIGN_STRESS:["sovereign_funding","interest_rates","fx_pairs"],
 OIL_SUPPLY_DISRUPTION:["brent_crude","lng_spot","oil_supply"],
 LNG_SUPPLY_DISRUPTION:["lng_spot","oil_supply"],
 CENTRAL_BANK_RATE_DECISION:["fx_pairs","usd_eur","usd_jpy","usd_cny","usd_inr"],
 FX_RESERVE_CHANGE:["fx_pairs","usd_eur","usd_jpy","usd_cny","usd_inr"],
 MARITIME_BLOCKADE:["shipping_routes","maritime_chokepoints","brent_crude","lng_spot","freight_rates"],
 TRADE_POLICY:["cross_border_trade","export_controls"],
 MARITIME_CHOKEPOINT_DISRUPTION:["freight_rates","brent_crude","lng_spot","shipping_routes"],
 CHOKEPOINT_DISRUPTION:["freight_rates","brent_crude","lng_spot","shipping_routes"],
 EXPORT_CONTROL:["export_controls","lithium","copper","rare_earths"],
 EXPORT_BAN:["export_controls","lithium","copper","rare_earths"],
 MINERAL_SUPPLY_CHANGE:["lithium","copper","rare_earths"],
 MINERAL_SUPPLY_SHOCK:["lithium","copper","rare_earths"],
 MINERAL_TRADE:["lithium","copper","rare_earths"],
 MONETARY_POLICY:["fx_pairs","usd_eur","usd_jpy","usd_cny","usd_inr"],
 MACRO_POLICY_RELEASE:["fx_pairs","usd_eur","usd_jpy","usd_cny","usd_inr"],
 FX_STRESS:["fx_pairs","usd_eur","usd_jpy","usd_cny","usd_inr"],
 CENTRAL_BANK_LIQUIDITY_OPERATION:["repo_markets","interest_rates","bank_liquidity","sovereign_fx_reserves"],
 BANK_CAPITAL_LIQUIDITY_STRESS:["bank_capital","bank_liquidity","interbank_funding","sovereign_funding"],
 INTERBANK_FUNDING_STRESS:["interbank_funding","cross_currency_basis","credit_spreads"],
 SOVEREIGN_YIELD_CURVE_SHOCK:["sovereign_yields","yield_curves","credit_spreads","sovereign_funding"],
 SOVEREIGN_BOND_AUCTION:["bond_auctions","sovereign_yields","yield_curves"],
 MACRO_DATA_SURPRISE:["interest_rates","fx_pairs","yield_curves"],
 EQUITY_MARKET_MICROSTRUCTURE:["equity_indices","equity_volatility","volatility_indices","market_microstructure","short_selling_controls"],
 CROSS_BORDER_CAPITAL_FLOW:["capital_flows","fx_pairs","ndf_markets"],
 CRYPTO_STABLECOIN_LIQUIDITY:["crypto_liquidity","stablecoin_liquidity","payment_rails"],
 MARKET_INFRASTRUCTURE_CYBERATTACK:["clearinghouses","payment_rails","market_microstructure"],
 FREIGHT_WAR_RISK:["war_risk_insurance","freight_indices","baltic_dry_index","shipping_routes"],
 BANKING_SANCTIONS:["payment_rails","sanctions_exposure","fx_pairs"],
 EXCHANGE_INVENTORY_SHOCK:["exchange_inventories","warehouse_stocks","cancelled_warrants","commodity_benchmarks"],
 CURVE_SPREAD_REGIME:["curve_spreads","physical_premiums","commodity_benchmarks"],
 TREATMENT_REFINING_CHARGE:["treatment_charges","refining_charges","mineral_processing"],
 MINERAL_PROJECT_FINANCE:["project_finance","offtake_finance","mineral_supply"],
 COMMODITY_BENCHMARK_MOVE:["commodity_benchmarks","physical_premiums","precious_metals","pgm","iron_ore","aluminum","tin","zinc","polysilicon"],
 FINANCIAL_WAR_RISK:["sovereign_funding","sovereign_fx_reserves","sovereign_wealth_funds","fx_pairs"],
 ELECTION_REGIME_POLICY:["foreign_investment","cross_border_trade","sovereign_risk"]
});
const MECHANISMS=Object.freeze({
 GEOPOLITICS:"Changes in access, counterparties, sanctions exposure, or route availability propagate through trade and shipping links.",
 MACRO_FX:"Policy, inflation, foreign-exchange, and funding changes transmit through currency pairs, rates, and sovereign financing.",
 CRITICAL_MINERALS:"Production, export-control, and logistics changes transmit through commodity availability and industrial supply chains."
});
const DIRECT_IMPACTS=Object.freeze({
 GEOPOLITICS:"Freight, insurance, energy, and corridor risk premiums may adjust; the direction and size are not confirmed.",
 MACRO_FX:"FX pairs, sovereign yields, funding spreads, and import costs may reprice; the direction and size are not confirmed.",
 CRITICAL_MINERALS:"Commodity premiums, delivery lead times, and substitution costs may change; physical impact requires verification."
});
const EVENT_TRANSMISSION=Object.freeze({
 CENTRAL_BANK_LIQUIDITY_OPERATION:"OMO, repo and standing-facility changes transmit through overnight funding, policy expectations, FX reserves and sovereign yield curves.",
 BANK_CAPITAL_LIQUIDITY_STRESS:"Capital, deposit and liquidity metrics transmit through interbank funding costs, credit availability and sovereign-bank contagion channels.",
 INTERBANK_FUNDING_STRESS:"Benchmark rates, basis swaps and bank CDS transmit through short-term funding costs, FX hedging and counterparty risk.",
 SOVEREIGN_YIELD_CURVE_SHOCK:"Curve, term-premium and auction repricing transmits through government refinancing costs, bank balance sheets and local FX.",
 EQUITY_MARKET_MICROSTRUCTURE:"Index volatility, circuit breakers and short-sale controls transmit through liquidity, margin requirements and cross-border portfolio flows.",
 CROSS_BORDER_CAPITAL_FLOW:"FPI, FII, ETF and NDF flows transmit through local currency liquidity, equity demand and reserve management.",
 CRYPTO_STABLECOIN_LIQUIDITY:"Stablecoin and digital-asset liquidity transmits through payment rails, local FX access and short-term funding demand.",
 EXCHANGE_INVENTORY_SHOCK:"Warehouse stocks and cancelled warrants transmit through deliverable supply, nearby spreads and physical premiums.",
 CURVE_SPREAD_REGIME:"Backwardation, contango and physical spreads transmit through inventory financing, procurement costs and delivery incentives.",
 TREATMENT_REFINING_CHARGE:"TC/RC and utilization changes transmit through concentrate availability, smelter margins and refined-metal output.",
 MINERAL_PROJECT_FINANCE:"EXIM, DFI and bank commitments transmit through project completion probability, offtake terms and future supply capacity.",
 MARKET_INFRASTRUCTURE_CYBERATTACK:"Exchange, clearing and payment outages transmit through settlement continuity, collateral access and intraday liquidity.",
 FREIGHT_WAR_RISK:"War-risk insurance and freight benchmarks transmit through delivered energy and commodity costs and route substitution.",
 BANKING_SANCTIONS:"Correspondent restrictions and asset freezes transmit through settlement access, FX conversion and sovereign funding.",
 ELECTION_REGIME_POLICY:"Election and state intervention signals transmit through policy continuity, foreign investment and sovereign risk pricing."
});
const EVENT_DIRECT_IMPACT=Object.freeze({
 CENTRAL_BANK_LIQUIDITY_OPERATION:"Short rates, FX basis and sovereign curve levels may adjust; direction and size require observed market data.",
 BANK_CAPITAL_LIQUIDITY_STRESS:"Bank funding spreads, credit supply and equity volatility may move; no systemic loss is inferred.",
 INTERBANK_FUNDING_STRESS:"Interbank spreads, basis swaps and bank CDS may widen; monitor executable market references.",
 SOVEREIGN_YIELD_CURVE_SHOCK:"Sovereign yields, auction tails and local funding costs may reprice; no move is forecast.",
 EQUITY_MARKET_MICROSTRUCTURE:"Index volatility, liquidity and margin conditions may change; no exchange price is inferred.",
 CROSS_BORDER_CAPITAL_FLOW:"Local FX, equity indices and reserves may respond to flow pressure; direction is unverified.",
 CRYPTO_STABLECOIN_LIQUIDITY:"Stablecoin liquidity and on/off-ramp FX conditions may shift; settlement impact needs confirmation.",
 EXCHANGE_INVENTORY_SHOCK:"Nearby physical premiums and exchange spreads may react to deliverable inventory changes.",
 CURVE_SPREAD_REGIME:"Cash spreads and financing economics may shift with the curve; the move is not guaranteed.",
 TREATMENT_REFINING_CHARGE:"Concentrate and refined-metal margins may change as treatment charges or utilization move.",
 MINERAL_PROJECT_FINANCE:"Future supply timing and offtake availability may change; committed capital is not proof of output.",
 MARKET_INFRASTRUCTURE_CYBERATTACK:"Settlement availability and intraday liquidity may be affected; market impact needs verified venue data.",
 FREIGHT_WAR_RISK:"Insurance and delivered freight costs may rise or reroute; no commodity price move is assumed.",
 BANKING_SANCTIONS:"Payment access, FX conversion and sovereign funding may be constrained; scope needs official confirmation.",
 ELECTION_REGIME_POLICY:"Risk premia and capital allocation may change as policy continuity is reassessed."
});
const horizonName=hours=>hours<=24?"24h":hours<=72?"72h":"7d";
const safeTrigger=value=>typeof value==="string"&&
 /^[A-Z][A-Z0-9_]{0,47}$/u.test(value)&&
 !/(?:PRIVATE|TELEGRAM|PUBLISHER|CHANNEL|HTTP)/u.test(value)?
 value.toLowerCase().replaceAll("_"," "):"classified risk event";

/** Build a source-free, deterministic audience view from already-scored facts. */
export function buildRiskStreamDualAudience({category,eventClass="UNCLASSIFIED",
 score=0,confidence=0,horizonHours=24,ttlSeconds=10800,actionPosture,
 deltaVs7d=0,tier="BASIC",corroborationReady=false,contagionCorridors=[],
 strategicCorridors=[],affectedAssets=[]}={}){
 if(!CATEGORIES.has(category)||!Number.isFinite(score)||score<0||score>100||
    !Number.isFinite(confidence)||confidence<0||confidence>1||
    !Number.isFinite(deltaVs7d)||deltaVs7d< -100||deltaVs7d>100||
    !["BASIC","STANDARD","COMPLEX"].includes(tier)||
    typeof corroborationReady!=="boolean"||
    !Number.isInteger(horizonHours)||horizonHours<1||horizonHours>168||
    !Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>604800||
    !Array.isArray(contagionCorridors)||contagionCorridors.length>12||
    contagionCorridors.some(x=>typeof x!=="string"||! /^[A-Z]{3}>[A-Z]{3}$/u.test(x))||
    !Array.isArray(strategicCorridors)||strategicCorridors.length>12||
    strategicCorridors.some(x=>!CORRIDORS.has(x))||
    !Array.isArray(affectedAssets)||affectedAssets.length>16||
    affectedAssets.some(x=>typeof x!=="string"||!ALLOWED_ASSETS.has(x)))
  throw Error("RISK_STREAM_DUAL_AUDIENCE_INVALID");
 const posture=actionPosture??(score>=80?"PAUSE":score>=65?"REQUIRE_APPROVAL":
  score>=45?"REDUCE_LIMIT":"CONTINUE");
 if(!ACTIONS.has(posture))throw Error("RISK_STREAM_DUAL_AUDIENCE_INVALID");
 const bias=category==="MACRO_FX"?"VOLATILITY_UP":
  category==="CRITICAL_MINERALS"?"SUPPLY_DISRUPTION_RISK":
  "RISK_PREMIUM_UP";
 const trigger=safeTrigger(eventClass);
 const mechanism=EVENT_TRANSMISSION[eventClass]??MECHANISMS[category];
 const directImpact=EVENT_DIRECT_IMPACT[eventClass]??DIRECT_IMPACTS[category];
 const eventAssets=EVENT_ASSETS[eventClass]??[];
 const corridorAssets=strategicCorridors.flatMap(x=>CORRIDOR_ASSETS[x]??[]);
 const enrichedAssets=[...new Set([...ASSETS[category],...eventAssets,...corridorAssets,...affectedAssets])].sort();
 if(enrichedAssets.length>24)throw Error("RISK_STREAM_DUAL_AUDIENCE_INVALID");
 return {
  agent_decision:{action_posture:posture,gate_state:posture,
   risk_score_0_100:Number(score.toFixed(2)),value_0_100:Number(score.toFixed(2)),
   delta_vs_7d:Number(deltaVs7d.toFixed(2)),
   confidence_0_1:Number(confidence.toFixed(3)),confidence:Number(confidence.toFixed(3)),
   horizon_hours:horizonHours,horizon:horizonName(horizonHours),
   affected_assets:enrichedAssets,price_direction_bias:bias,
   contagion_corridors:[...new Set(contagionCorridors)].sort(),
   strategic_corridors:[...new Set(strategicCorridors)].sort(),tier,
   upgrade_available:tier==="BASIC"&&corroborationReady,ttl_seconds:ttlSeconds},
  analyst_brief:{risk_mechanism:mechanism,
   downstream_effects:category==="MACRO_FX"?
    "Funding costs, currency conversion, and risk limits may adjust if the observation persists.":
    category==="CRITICAL_MINERALS"?
     "Input availability, delivery timing, and downstream production costs may adjust if the observation persists.":
     "Counterparty access, transit reliability, and compliance exposure may adjust if the observation persists.",
   price_impact_summary:category==="MACRO_FX"?
    "Monitor volatility and repricing; this output does not forecast a guaranteed price move.":
    category==="CRITICAL_MINERALS"?
     "Monitor supply premiums and substitution risk; this output does not forecast a guaranteed price move.":
     "Monitor risk premia and route sensitivity; this output does not forecast a guaranteed price move.",
   trigger,transmission_mechanism:mechanism,direct_price_supply_impact:directImpact,
   causal_summary:"Trigger: "+trigger+". Transmission Mechanism: "+mechanism+
    " Direct Price/Supply Impact: "+directImpact,
   raw_source_redacted:true,licensed_source_text_included:false,
   cross_category_outlook:"Assess linked geopolitical, macroeconomic, and critical-minerals conditions using separately verified evidence."},
  raw_source_redacted:true,licensed_source_text_included:false
 };
}

export function validRiskStreamDualAudience(value){
 const agent=value?.agent_decision,brief=value?.analyst_brief;
 const legacyAgentKeys=["action_posture","risk_score_0_100","confidence_0_1",
  "horizon_hours","affected_assets","price_direction_bias","contagion_corridors","ttl_seconds"];
 const enhancedAgentKeys=[...legacyAgentKeys,"gate_state","value_0_100","delta_vs_7d",
  "confidence","horizon","tier","upgrade_available"];
 const corridorAgentKeys=[...enhancedAgentKeys,"strategic_corridors"];
 const legacyBriefKeys=["risk_mechanism","downstream_effects","price_impact_summary","cross_category_outlook"];
 const enhancedBriefKeys=[...legacyBriefKeys,"trigger","transmission_mechanism",
  "direct_price_supply_impact","causal_summary","raw_source_redacted","licensed_source_text_included"];
 const agentKeys=Object.keys(agent??{}).sort().join("|");
 const briefKeys=Object.keys(brief??{}).sort().join("|");
 const legacy=agentKeys===legacyAgentKeys.slice().sort().join("|")&&
  briefKeys===legacyBriefKeys.slice().sort().join("|");
 const enhancedLegacy=agentKeys===enhancedAgentKeys.slice().sort().join("|")&&
  briefKeys===enhancedBriefKeys.slice().sort().join("|");
 const current=agentKeys===corridorAgentKeys.slice().sort().join("|")&&
  briefKeys===enhancedBriefKeys.slice().sort().join("|");
 const common=value?.raw_source_redacted===true&&agent&&typeof agent==="object"&&
  ACTIONS.has(agent.action_posture)&&Number.isFinite(agent.risk_score_0_100)&&
  agent.risk_score_0_100>=0&&agent.risk_score_0_100<=100&&
  Number.isFinite(agent.confidence_0_1)&&agent.confidence_0_1>=0&&agent.confidence_0_1<=1&&
  Number.isInteger(agent.horizon_hours)&&agent.horizon_hours>=1&&agent.horizon_hours<=168&&
  Array.isArray(agent.affected_assets)&&agent.affected_assets.length<=24&&agent.affected_assets.every(x=>
   typeof x==="string"&&/^[a-z0-9_]{2,48}$/u.test(x))&&
  typeof agent.price_direction_bias==="string"&&agent.price_direction_bias.length<=80&&
  Array.isArray(agent.contagion_corridors)&&agent.contagion_corridors.length<=12&&agent.contagion_corridors.every(x=>
   typeof x==="string"&&/^[A-Z]{3}>[A-Z]{3}$/u.test(x))&&
  Number.isInteger(agent.ttl_seconds)&&agent.ttl_seconds>=60&&agent.ttl_seconds<=604800&&
  brief&&typeof brief==="object";
 const validBrief=[...legacyBriefKeys].every(key=>
  typeof brief?.[key]==="string"&&brief[key].length>=12&&brief[key].length<=360);
 const validEnhanced=(!current||Array.isArray(agent.strategic_corridors)&&agent.strategic_corridors.length<=12&&
   agent.strategic_corridors.every(x=>CORRIDORS.has(x)))&&
  (!enhancedLegacy&&!current||value.licensed_source_text_included===false&&
   agent.gate_state===agent.action_posture&&
   Number.isFinite(agent.value_0_100)&&agent.value_0_100===agent.risk_score_0_100&&
   Number.isFinite(agent.delta_vs_7d)&&agent.delta_vs_7d>=-100&&agent.delta_vs_7d<=100&&
   Number.isFinite(agent.confidence)&&agent.confidence===agent.confidence_0_1&&
   ["24h","72h","7d"].includes(agent.horizon)&&
   ["BASIC","STANDARD","COMPLEX"].includes(agent.tier)&&
   typeof agent.upgrade_available==="boolean"&&
   (agent.tier==="BASIC"||agent.upgrade_available===false)&&
   brief.raw_source_redacted===true&&brief.licensed_source_text_included===false&&
   typeof brief.trigger==="string"&&brief.trigger.length>=6&&brief.trigger.length<=80&&
   typeof brief.transmission_mechanism==="string"&&brief.transmission_mechanism.length>=12&&
   typeof brief.direct_price_supply_impact==="string"&&brief.direct_price_supply_impact.length>=12&&
   typeof brief.causal_summary==="string"&&brief.causal_summary.length>=60&&
   brief.causal_summary.startsWith("Trigger: "+brief.trigger+". Transmission Mechanism: ")&&
   brief.causal_summary.includes(" Direct Price/Supply Impact: "+brief.direct_price_supply_impact));
 const clearText=!/(?:https?:[/][/]|www[.]|@|telegram|headline|publisher|channel_name)/iu.test(
  JSON.stringify({agent_decision:agent,analyst_brief:brief}));
 return Boolean(common&&(legacy||enhancedLegacy||current)&&validBrief&&clearText&&validEnhanced);
}
