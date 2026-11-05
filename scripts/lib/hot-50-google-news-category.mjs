/**
 * Hot-50 × 3 domain-specific Google News RSS discovery hints.
 * Reuses the existing per-tick country-index GET budget. These results are
 * NOT first-party articles, source-native dates, country-event evidence,
 * permissions, commercial claims or Telegram content.
 */
import {HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
const DOMAINS=Object.freeze(["geopolitics","macro","rare_earth"]);
const STEP_MS=15*60_000;
const HOT50_KEYWORDS=Object.freeze({
 geopolitics:'("sanctions" OR "ceasefire" OR "military" OR "border security" OR "diplomatic" OR "conflict" OR "export ban" OR "election")',
 macro:'("central bank" OR "central bank decision" OR "monetary policy" OR "monetary-policy decision" OR "policy rate" OR "interest rate decision" OR "rate decision" OR "benchmark rate" OR "key rate" OR "repo rate" OR "discount rate" OR CPI OR "consumer price index" OR "consumer price inflation" OR HICP OR PPI OR "inflation rate" OR "inflation data" OR "CPI release" OR "price statistics" OR "employment rate" OR employment OR unemployment OR "jobless rate" OR payroll OR jobs OR wages OR "labour force" OR "labor force" OR "labour market" OR "labor market" OR "employment report" OR "jobs report" OR GDP OR currency OR "sovereign debt" OR "trade balance" OR "capital controls")',
 rare_earth:'("critical minerals" OR "critical raw materials" OR "rare earth" OR "rare-earth elements" OR mining OR mine OR mines OR miner OR "mineral production" OR "mine production" OR "mineral output" OR "mine project" OR "mining project" OR "mine permit" OR "mining licence" OR "mining license" OR exploration OR "mine expansion" OR "mine closure" OR "mine shutdown" OR "mineral processing" OR smelting OR refining OR lithium OR copper OR cobalt OR nickel OR graphite OR gallium OR germanium OR antimony OR manganese OR tungsten OR tin OR bauxite OR uranium OR "mineral export" OR "mineral exports" OR "export ban" OR "export restriction" OR royalty OR concession OR tailings OR strike)',
});
const escapeName=name=>'"'+name.replace(/["\\\r\n]/gu," ").trim()+'"';
export function hot50GoogleCategorySource(country,category,legacyAllDomainTerms=null){
 if(!country||!HOT50_COUNTRY_SET.has(country.iso3)||
    typeof country.name!=="string"||country.name.length<2||
    !Object.hasOwn(HOT50_KEYWORDS,category))throw Error("HOT50_GOOGLE_CATEGORY_INPUT_INVALID");
 const names=[country.name,...(Array.isArray(country.aliases)?country.aliases:[])].slice(0,3);
 if(!(legacyAllDomainTerms===null||
   typeof legacyAllDomainTerms==="string"&&legacyAllDomainTerms.length<1300&&
   legacyAllDomainTerms.startsWith("(")&&legacyAllDomainTerms.endsWith(")")))
  throw Error("HOT50_ALL_DOMAIN_DISCOVERY_TERMS_INVALID");
 const q="("+names.map(escapeName).join(" OR ")+") "+
  (legacyAllDomainTerms?legacyAllDomainTerms+" ":"")+
  HOT50_KEYWORDS[category]+" when:1d";
 const url=new URL("https://news.google.com/rss/search");
 url.searchParams.set("q",q);
 url.searchParams.set("hl","en-US");
 url.searchParams.set("gl","US");
 url.searchParams.set("ceid","US:en");
 if(url.href.length>2000)throw Error("HOT50_GOOGLE_QUERY_TOO_LONG");
 return Object.freeze({
  id:"private_country_index_"+country.iso3.toLowerCase()+"_"+category,
  url:url.toString(),categories:Object.freeze([...DOMAINS]),
  index_query_focus_category:category,
  google_news_category_specific:true,
  index_query_metric_focus:category==="macro"?Object.freeze([
   "central_bank_and_monetary_policy",
   "policy_and_interest_rate_decisions",
   "CPI_HICP_PPI_and_inflation_releases",
   "employment_unemployment_jobs_wages_and_labour_force",
   "GDP_currency_debt_and_trade",
  ]):category==="rare_earth"?Object.freeze([
   "mine_and_mineral_project_events",
   "exploration_production_processing_and_refining",
   "permits_closures_strikes_and_tailings",
   "critical_mineral_exports_and_restrictions",
  ]):Object.freeze(["geopolitical_events"]),
  original_publisher_verified:false,
  original_article_clock_verified:false,
  country_event_attribution_verified:false,
  rights_verified:false,commercial_eligible:false,
  publicly_deliverable:false,
 });
}
/**
 * Discovery routing is deterministic across delivered UTC 15m slots:
 * >=25 GETs/slot: all 150 Hot-50 × domain and 145 remaining country-wide
 * probes fit into 12 nominal slots, precisely within 180 minutes.
 * 8-24 GETs/slot: reserve one existing GET for a rolling targeted
 * Hot-50 category query, the remaining GETs preserve combined three-domain
 * searches for all 195 countries. <8 GETs keeps the full combined sweep.
 * The network/scheduler may be delayed or an actual feed may be unavailable.
 */
export function hot50CountryCategoryDiscoveryUnits(now,countries,perTick){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
  !Array.isArray(countries)||countries.length!==195||
  !Number.isSafeInteger(perTick)||perTick<1||perTick>49)
  throw Error("HOT50_GOOGLE_ROTATION_INVALID");
 const hot=countries.filter(c=>HOT50_COUNTRY_SET.has(c.iso3));
 const other=countries.filter(c=>!HOT50_COUNTRY_SET.has(c.iso3));
 if(hot.length!==50||other.length!==145||new Set(countries.map(x=>x.iso3)).size!==195)
  throw Error("HOT50_GOOGLE_COUNTRY_UNIVERSE_INVALID");
 const slot=Math.floor(now.getTime()/STEP_MS);
 if(perTick>=25){
  // Interleave 3 categories by country; no duplicate URL within a slot.
  const full=[
   ...hot.flatMap(country=>DOMAINS.map(category=>({country,category}))),
   ...other.map(country=>({country,category:null})),
  ];
  const cycle=Math.ceil(full.length/perTick);
  return Object.freeze(full.slice((slot%cycle)*perTick,(slot%cycle+1)*perTick));
 }
 const full=[...hot,...other];
 const focusedSpare=perTick>=8?1:0;
 const combinedCount=perTick-focusedSpare;
 const cycle=Math.ceil(full.length/combinedCount);
 const selected=full.slice((slot%cycle)*combinedCount,(slot%cycle+1)*combinedCount)
  .map(country=>({country,category:null}));
 if(focusedSpare){
  const index=slot%150;
  selected.push({country:hot[Math.floor(index/3)],category:DOMAINS[index%3]});
 }
 return Object.freeze(selected);
}
export function hot50GoogleSourceCadence(perTick){
 if(!Number.isSafeInteger(perTick)||perTick<0||perTick>49)
  throw Error("HOT50_GOOGLE_CADENCE_INVALID");
 return Object.freeze({
  total_hot50_category_queries:150,
  total_nonhot_combined_queries:145,
  existing_fetch_ceiling_unchanged:true,
  target_minutes:180,
  index_slots_per_tick:perTick,
  complete_hot50_3domain_cycle_minutes:perTick>=25?
   Math.ceil(295/perTick)*15:perTick>=8?150*15:null,
  combined_hot50_country_cycle_minutes:perTick===0?null:
   Math.ceil(50/(perTick>=8&&perTick<25?perTick-1:perTick))*15,
  legacy_combined_all_country_cycle_minutes:perTick===0?null:
   Math.ceil(195/(perTick>=8&&perTick<25?perTick-1:perTick))*15,
  focused_google_category_slots_per_tick:perTick>=25?perTick:perTick>=8?1:0,
  combined_three_domain_query_fallback_active:perTick>0&&perTick<25,
  under_3h_nominal:perTick>=25,
  runtime_guaranteed:false,
  source_native_event_verified:false,
 });
}
