/**
 * Private-only 195-country topical discovery over one pinned public news-index
 * host. An index query is NOT an original publisher, event location, native
 * original-page date, commercial right or a verified local source.
 *
 * 49 canonical countries per nominal 15-minute scheduled invocation => 195 routes
 * in four successive delivered slots (60 minutes). GitHub schedules can skip
 * or delay runs: this cycle is not an ingestion or publication SLA.
 */
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {privateOsintGlobalSources} from "./private-osint-global-sources.mjs";

export const COUNTRY_DISCOVERY_PER_TICK=49;
export const COUNTRY_DISCOVERY_CYCLE_SLOTS=4;
export const COUNTRY_DISCOVERY_NOMINAL_CYCLE_MINUTES=60;
const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
const TERMS='(election OR sanctions OR security OR conflict OR border OR war OR trade OR inflation OR currency OR "central bank" OR "critical minerals" OR "rare earth" OR mining OR lithium OR copper)';
const STEP_MS=15*60000;

export function rotatingPrivateCountryDiscoverySources(now=new Date(),countries=COUNTRIES_195){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(countries)||countries.length!==195||
    new Set(countries.map(c=>c?.iso3)).size!==195||
    countries.some(c=>!/^[A-Z]{3}$/u.test(c?.iso3??"")||
      typeof c?.name!=="string"||!c.name.trim()||c.name.length>90))
   throw Error("PRIVATE_OSINT_COUNTRY_INDEX_REGISTRY_INVALID");
 const slot=Math.floor(now.getTime()/STEP_MS)%COUNTRY_DISCOVERY_CYCLE_SLOTS;
 const selected=countries.slice(slot*COUNTRY_DISCOVERY_PER_TICK,(slot+1)*COUNTRY_DISCOVERY_PER_TICK);
 return Object.freeze(selected.map(country=>{
  // Known canonical aliases catch terms such as DRC, Ivory Coast and Burma.
  // These remain SEARCH HINTS only; no country is attributed from a query.
  const names=[country.name,...(Array.isArray(country.aliases)?country.aliases:[])].slice(0,3)
   .map(name=>'"'+name.replace(/["\\\r\n]/gu," ").trim()+'"');
  const query="("+names.join(" OR ")+") "+TERMS+" when:1d";
  const url=new URL("https://news.google.com/rss/search");
  url.searchParams.set("q",query);
  url.searchParams.set("hl","en-US");
  url.searchParams.set("gl","US");
  url.searchParams.set("ceid","US:en");
  return Object.freeze({
   id:"private_country_index_"+country.iso3.toLowerCase(),
   url:url.toString(),continent:"global",publisher_country_iso3:null,
   discovery_country_iso3:country.iso3,
   categories:CATEGORIES,type:"rss",supported:true,
   private_discovery_index_only:true,
   index_timestamp_not_original_page_clock:true,
   transport_verified_at_registration:false,
   commercial_eligible:false,publicly_deliverable:false,
  });
 }));
}

export function privateOsintRuntimeSources(now=new Date(),base=privateOsintGlobalSources(),countries=COUNTRIES_195){
 if(!Array.isArray(base)||base.length===0||base.length>512)
  throw Error("PRIVATE_OSINT_COUNTRY_INDEX_BASE_INVALID");
 const urls=new Set(base.map(s=>s.url));
 if(urls.size!==base.length)throw Error("PRIVATE_OSINT_COUNTRY_INDEX_BASE_DUPLICATE");
 const additional=rotatingPrivateCountryDiscoverySources(now,countries);
 // Never poll a registered pinned feed twice within a tick.
 const fresh=additional.filter(s=>!urls.has(s.url));
 if(base.length+fresh.length>512)
  throw Error("PRIVATE_OSINT_COUNTRY_INDEX_SOURCE_CEILING");
 return [...base,...fresh];
}
