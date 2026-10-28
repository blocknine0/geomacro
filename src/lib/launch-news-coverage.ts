import {GLOBAL_MACRO_TOPIC_PATTERN} from "./global-macro-news-policy.ts";
import {HOT_TOPIC_FAMILIES,hotTopicIntakePattern,type HotTopicFamily} from './hot-topic-taxonomy.ts';
export const LAUNCH_NEWS_POLICY_VERSION='geomacro.launch-news-coverage.v1';
const MACRO_FAMILIES:readonly HotTopicFamily[]=[
 'monetary_policy_rates','inflation_growth_employment','fx_external_stress','sovereign_debt_fiscal',
 'energy_oil_gas','shipping_chokepoints','supply_chain_logistics','food_agriculture',
 'banking_financial_system','trade_corridor_disruption','payments_settlement_disruption',
 'border_customs_transit_disruption','electricity_grid_disruption','climate_water_heat_stress',
 'labor_strike_workforce_disruption','insurance_market_withdrawal_war_risk',
 'capital_controls_convertibility_shock','tariffs_trade_restrictions'];
const MINERAL_FAMILIES:readonly HotTopicFamily[]=['critical_minerals','rare_material_long_tail_supply_shock'];
const SHARED_GEO:readonly HotTopicFamily[]=['shipping_chokepoints','trade_corridor_disruption',
 'border_customs_transit_disruption','insurance_market_withdrawal_war_risk','tariffs_trade_restrictions'];
const GEO_FAMILIES=HOT_TOPIC_FAMILIES.filter(f=>
 (!MACRO_FAMILIES.includes(f)&&!MINERAL_FAMILIES.includes(f))||SHARED_GEO.includes(f));
export const LAUNCH_NEWS_FAMILY_CATEGORIES=Object.freeze({
 geopolitics:Object.freeze(GEO_FAMILIES),macro:Object.freeze(MACRO_FAMILIES),rare_earth:Object.freeze(MINERAL_FAMILIES),
});
// Gold and silver remain Macro precious metals, never the mineral lane.
const PRECIOUS=/\b(?:gold|silver|bullion)\b.{0,100}\b(?:demand|supply|prices?|reserves?|buying|purchases?|sales?|futures?|positioning|industrial|solar|mines?|production|exports?)\b/iu;
export const LAUNCH_NEWS_TOPIC_PATTERNS=Object.freeze(Object.fromEntries(
 Object.entries(LAUNCH_NEWS_FAMILY_CATEGORIES).map(([category,families])=>{
  const pattern=hotTopicIntakePattern(families);
  return [category,category==='macro'?new RegExp('(?:'+pattern.source+')|(?:'+PRECIOUS.source+')|(?:'+GLOBAL_MACRO_TOPIC_PATTERN.source+')','iu'):pattern];
 })
) as Record<'geopolitics'|'macro'|'rare_earth',RegExp>);

/** A policy target is never evidence that an event occurred or a product is sellable. */
export function launchNewsCoveragePolicy(){
 return {version:LAUNCH_NEWS_POLICY_VERSION,families:HOT_TOPIC_FAMILIES.length,
  category_families:LAUNCH_NEWS_FAMILY_CATEGORIES,
  fastlane_target_minutes:5,discovery_target_minutes:15,guaranteed_latency:false,
  macro_extension_targets:['official_leader_communications','global_cpi_jobs_growth','banking_liquidity_and_stability','global_trade_tariffs','hormuz_shipping_and_freight'],
  observed_market_reaction_requires_separate_price_evidence:true,
  original_native_time_required:true,index_time_is_original_time:false,
  paid_delivery_requires_request_scoped_evidence_rights_and_signature:true,
  source_registration_is_live_coverage:false,raw_redistribution_authorized:false};
}
