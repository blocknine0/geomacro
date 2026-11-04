/**
 * Hot-50 private discovery priority over the existing 195-country index.
 * Index results are hints, NOT originating publisher articles, native article
 * dates, corroboration, event geolocation, usage rights or Risk Gate evidence.
 * Does not increase a single fetch/D1/B2 quota or change commercial state.
 */
import {readFileSync} from "node:fs";

const manifest=JSON.parse(readFileSync(
  new URL("../../config/hot-50-three-domain-watch.v1.json",import.meta.url),"utf8"));
const ISO=/^[A-Z]{3}$/u;
const EXPECTED_CATEGORIES=["geopolitics","macro","rare_earth"];
if(manifest.schema!=="geomacro.hot50-three-domain-watch.v1"||
 manifest.scope!=="PRIVATE_NEWS_DISCOVERY_ONLY_NO_COMMERCIAL_ACTIVATION"||
 manifest.nominal_freshness_target_minutes!==180||
 !Array.isArray(manifest.country_iso3)||manifest.country_iso3.length!==50||
 new Set(manifest.country_iso3).size!==50||
 manifest.country_iso3.some(code=>!ISO.test(code))||
 JSON.stringify(manifest.categories)!==JSON.stringify(EXPECTED_CATEGORIES))
 throw Error("HOT50_PRIVATE_WATCH_MANIFEST_INVALID");

export const HOT50_COUNTRY_ISO3=Object.freeze([...manifest.country_iso3]);
export const HOT50_COUNTRY_SET=new Set(HOT50_COUNTRY_ISO3);
export const HOT50_TARGET_MINUTES=180;
const PERIOD_MS=15*60*1000;

/**
 * Exactly the legacy 195-country cycle length, with Hot-50 discovered first
 * within that cycle. No extra upstream request, no 145-country starvation.
 * If quota permits >=17 country-index GETs/15m, this full cycle is <=3h;
 * a lower actual quota must report its genuine slower nominal cadence.
 */
export function selectHot50CountryDiscoveryBatch(now,countries,perTick){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   !Array.isArray(countries)||countries.length!==195||
   new Set(countries.map(c=>c?.iso3)).size!==195||
   !Number.isSafeInteger(perTick)||perTick<1||perTick>49)
  throw Error("HOT50_COUNTRY_DISCOVERY_INPUT_INVALID");
 const hot=countries.filter(c=>HOT50_COUNTRY_SET.has(c.iso3));
 const other=countries.filter(c=>!HOT50_COUNTRY_SET.has(c.iso3));
 if(hot.length!==50||other.length!==145)
  throw Error("HOT50_COUNTRY_UNIVERSE_MISMATCH");
 const slot=Math.floor(now.getTime()/PERIOD_MS);
 const cycle=Math.ceil(195/perTick);
 const start=(slot%cycle)*perTick;
 return Object.freeze([...hot,...other].slice(start,start+perTick));
}

/** Truthful budget-derived nominal cadence, not a production freshness SLA. */
export function hot50NominalIndexCadence(perTick){
 if(!Number.isSafeInteger(perTick)||perTick<0||perTick>49)
  throw Error("HOT50_CADENCE_BUDGET_INVALID");
 if(perTick===0)return Object.freeze({
  hot50_cycle_minutes:null,hot50_first_pass_minutes:null,
  other145_cycle_minutes:null,
  hot50_under_180_minutes:false,nonhot_under_180_minutes:false,
  runtime_schedule_guaranteed:false,
 });
 const minutes=Math.ceil(195/perTick)*15;
 return Object.freeze({
  hot50_cycle_minutes:minutes,
  hot50_first_pass_minutes:Math.ceil(50/perTick)*15,
  other145_cycle_minutes:minutes,
  hot50_under_180_minutes:minutes<=HOT50_TARGET_MINUTES,
  nonhot_under_180_minutes:minutes<=HOT50_TARGET_MINUTES,
  runtime_schedule_guaranteed:false,
 });
}
