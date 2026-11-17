/**
 * Fixed, source-neutral discovery vocabulary shared by Risk Stream and Ask.
 * One bucket is selected per existing provider call; no query fan-out is added.
 */
export const GLOBAL_RISK_QUERY_TAXONOMY_VERSION = "global-risk-query-taxonomy.v1";
export const GLOBAL_RISK_QUERY_ROTATION_MS = 20 * 60_000;
export const GLOBAL_RISK_QUERY_CATEGORIES = Object.freeze([
  "GEOPOLITICS", "MACRO_FX", "CRITICAL_MINERALS",
]);

const freezeBucket = (id, topicTags, terms, affectedAssets = []) => Object.freeze({
  id, topic_tags: Object.freeze(topicTags), terms: Object.freeze(terms),
  affected_assets: Object.freeze(affectedAssets),
});

export const GLOBAL_RISK_QUERY_BUCKETS = Object.freeze({
  GEOPOLITICS: Object.freeze([
    freezeBucket("conflict_mobilization", ["armed_conflict","border_mobilization","naval_blockade"],
      ["armed conflict","border mobilization","naval blockade","military escalation"]),
    freezeBucket("maritime_chokepoints", ["maritime_disruption","red_sea","hormuz","malacca","suez","panama","black_sea","taiwan_strait"],
      ["Red Sea","Bab el-Mandeb","Strait of Hormuz","Malacca Strait","Suez Canal","Panama Canal","Black Sea","Taiwan Strait"],
      ["shipping_routes","maritime_chokepoints","brent_crude","lng_spot","freight_rates"]),
    freezeBucket("critical_infrastructure", ["subsea_cable","pipeline_sabotage","grid_sabotage"],
      ["subsea cable sabotage","pipeline sabotage","power grid sabotage","critical infrastructure attack"],
      ["shipping_routes","energy_commodities","brent_crude","lng_spot"]),
    freezeBucket("sanctions", ["sanctions","secondary_sanctions","asset_freeze"],
      ["sanctions","secondary sanctions","asset freeze","sanctions enforcement"]),
    freezeBucket("export_controls", ["dual_use","semiconductor_controls","arms_export_ban"],
      ["dual-use export controls","semiconductor export ban","arms export ban","technology controls"],
      ["export_controls","rare_earths","gallium","germanium"]),
    freezeBucket("regime_instability", ["coup","martial_law","regime_instability"],
      ["coup attempt","martial law","regime instability","emergency rule"]),
    freezeBucket("labor_and_transport", ["port_strike","rail_strike","labor_disruption"],
      ["port strike","rail strike","dockworker strike","transport shutdown"],
      ["shipping_routes","freight_rates","cross_border_trade"]),
    freezeBucket("closures", ["airspace_closure","shipping_closure","sovereign_closure"],
      ["airspace closure","shipping closure","sovereign airspace restriction","port closure"],
      ["shipping_routes","maritime_chokepoints","freight_rates"]),
  ]),
  MACRO_FX: Object.freeze([
    freezeBucket("monetary_policy", ["emergency_rate_change","qt","qe","central_bank_policy"],
      ["emergency rate hike","emergency rate cut","quantitative tightening","quantitative easing","central bank policy"],
      ["interest_rates","fx_pairs","sovereign_funding"]),
    freezeBucket("fx_controls", ["fx_intervention","currency_devaluation","currency_peg","capital_controls","repatriation_freeze"],
      ["FX intervention","currency devaluation","currency peg","capital controls","repatriation freeze"],
      ["fx_pairs","foreign_exchange","sovereign_funding"]),
    freezeBucket("sovereign_debt", ["sovereign_default","debt_restructuring","imf_bailout"],
      ["sovereign debt default","debt restructuring","IMF bailout","debt standstill"],
      ["sovereign_funding","interest_rates","fx_pairs"]),
    freezeBucket("yields_and_ratings", ["sovereign_yield_spike","credit_downgrade","funding_stress"],
      ["sovereign yield spike","credit downgrade","bond selloff","sovereign risk premium"],
      ["sovereign_funding","interest_rates","fx_pairs"]),
    freezeBucket("macro_data_shock", ["inflation_shock","cpi","pmi","gdp_shock"],
      ["inflation shock","CPI surprise","PMI contraction","GDP shock","employment report"]),
    freezeBucket("trade_retaliation", ["tariffs","customs_retaliation","trade_restrictions"],
      ["tariff increase","customs retaliation","trade restriction","import duty"],
      ["cross_border_trade","energy_commodities"]),
    freezeBucket("banking_and_payments", ["bank_liquidity","swift_restriction","payment_rail"],
      ["bank liquidity stress","SWIFT restriction","payment rail disruption","bank deposit outflow"],
      ["sovereign_funding","fx_pairs","payment_rails"]),
    freezeBucket("commodity_price_shock", ["oil_supply_price","lng_supply_price","grain_supply_price"],
      ["oil supply price shock","LNG supply disruption","grain price shock","energy import costs"],
      ["brent_crude","lng_spot","wheat","energy_commodities"]),
  ]),
  CRITICAL_MINERALS: Object.freeze([
    freezeBucket("battery_metals", ["lithium","cobalt","nickel","battery_processing"],
      ["lithium export","cobalt supply","nickel smelter","battery mineral processing"],
      ["lithium","cobalt","nickel","battery_materials"]),
    freezeBucket("copper_and_magnets", ["copper","rare_earths","ndpr","dysprosium","terbium"],
      ["copper mine","rare earths","NdPr","dysprosium","terbium","permanent magnet supply"],
      ["copper","rare_earths","ndpr","dysprosium","terbium"]),
    freezeBucket("processing_inputs", ["graphite","gallium","germanium","semiconductor_processing"],
      ["graphite processing","gallium export ban","germanium supply","semiconductor mineral processing"],
      ["graphite","gallium","germanium","semiconductor_inputs"]),
    freezeBucket("strategic_metals", ["antimony","tungsten","manganese","vanadium","titanium"],
      ["antimony export","tungsten supply","manganese processing","vanadium production","titanium sponge"],
      ["antimony","tungsten","manganese","vanadium","titanium"]),
    freezeBucket("nuclear_and_fertilizer", ["uranium","potash","phosphate"],
      ["uranium supply","potash export","phosphate fertilizer","fertilizer export restriction"],
      ["uranium","potash","phosphate"]),
    freezeBucket("state_actions", ["mineral_export_ban","royalty_hike","nationalization","stockpiling"],
      ["mineral export ban","mineral export quota","mining royalty hike","mine nationalization","strategic mineral stockpiling"],
      ["critical_minerals","export_controls","mineral_supply"]),
    freezeBucket("operations_disruption", ["mine_strike","smelter_outage","mine_closure"],
      ["mine strike","smelter outage","mine closure","concentrator shutdown"],
      ["mineral_supply","industrial_inputs","freight_rates"]),
    freezeBucket("supply_chain_chokepoint", ["mineral_processing_chokepoint","ev_supply_chain","battery_supply_chain"],
      ["mineral processing chokepoint","EV battery supply chain","semiconductor mineral bottleneck","refining capacity disruption"],
      ["battery_materials","semiconductor_inputs","industrial_inputs","shipping_routes"]),
  ]),
});

const categoryName = value => value === "MACRO" ? "MACRO_FX" :
  value === "RARE_EARTH" ? "CRITICAL_MINERALS" : value;

export function selectGlobalRiskQueryBucket(category, now = Date.now(), rotationIndex = 0) {
  const normalized = categoryName(category);
  const buckets = GLOBAL_RISK_QUERY_BUCKETS[normalized];
  if (!buckets || !Number.isSafeInteger(now) || now < 0 ||
      !Number.isSafeInteger(rotationIndex) || rotationIndex < 0 || rotationIndex > 100_000) {
    throw new Error("GLOBAL_RISK_QUERY_INPUT_INVALID");
  }
  const slot = Math.floor(now / GLOBAL_RISK_QUERY_ROTATION_MS);
  const index = (slot + rotationIndex) % buckets.length;
  const bucket = buckets[index];
  return Object.freeze({
    category: normalized, slot, bucket_index: index, bucket_id: bucket.id,
    topic_tags: bucket.topic_tags, terms: bucket.terms,
    affected_assets: bucket.affected_assets,
  });
}
