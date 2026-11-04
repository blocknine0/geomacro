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

/** One batch per existing country-index GET slot; preserve non-hot coverage. */
export function selectHot50CountryDiscoveryBatch(
 now,countries,perTick){
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
 // 40% of the existing index budget watches Hot-50, with the other 60%
 // reserved for all remaining 145 countries. A one-slot run alternates
 // 2 hot : 1 non-hot instead of silently starving other countries.
 const hotCount=perTick===1?(slot%3===0?0:1):
   Math.max(1,Math.min(perTick-1,Math.ceil(perTick*0.4)));
 const otherCount=perTick-hotCount;
 const hotOffset=perTick===1?slot-Math.ceil(slot/3):slot*hotCount;
 const otherOffset=perTick===1?Math.floor(slot/3):slot*otherCount;
 const ring=(list,start,n)=>Array.from({length:n},(_,i)=>
   list[(start+i)%list.length]);
 return Object.freeze([
  ...ring(hot,hotOffset,hotCount),
  ...ring(other,otherOffset,otherCount)
 ]);
}

/** Nominal discovery only; neither origin health nor scheduled delivery SLA. */
export function hot50NominalIndexCadence(perTick){
 if(!Number.isSafeInteger(perTick)||perTick<1||perTick>49)
  throw Error("HOT50_CADENCE_BUDGET_INVALID");
 if(perTick===1)return Object.freeze({
  hot50_cycle_minutes:1125,other145_cycle_minutes:6525,
  hot50_under_180_minutes:false,nonhot_under_180_minutes:false,
  runtime_schedule_guaranteed:false,
 });
 const hotCount=Math.max(1,Math.min(perTick-1,Math.ceil(perTick*0.4)));
 const otherCount=perTick-hotCount;
 const hot50Minutes=Math.ceil(50/hotCount)*15;
 const otherMinutes=Math.ceil(145/otherCount)*15;
 return Object.freeze({
  hot50_cycle_minutes:hot50Minutes,
  other145_cycle_minutes:otherMinutes,
  hot50_under_180_minutes:hot50Minutes<=HOT50_TARGET_MINUTES,
  nonhot_under_180_minutes:otherMinutes<=HOT50_TARGET_MINUTES,
  runtime_schedule_guaranteed:false,
 });
}
