import {launchPriorityWatchSources} from "./launch-priority-watch-sources.mjs";
import {privateOsintGlobalHubSources} from "./private-osint-global-hub-overlay.mjs";
import {qualifyPrivateNationalPrimaryScope} from "./private-osint-national-primary-scope.mjs";
import {privateOsintOfficialPrioritySources} from "./private-osint-official-priority-sources.mjs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";
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
import {rotatingPrivateLocalPublisherSources,PRIVATE_LOCAL_FEEDS_PER_TICK} from "./private-osint-local-publisher-rotation.mjs";

export const COUNTRY_DISCOVERY_PER_TICK=49;
export const COUNTRY_DISCOVERY_CYCLE_SLOTS=4;
// Existing index-only country discovery is intentionally throttled when the
// 24 native publisher candidates occupy the same no-extra-fetch request budget.
export const COUNTRY_DISCOVERY_LOCAL_LANE_PER_TICK=25;
export const COUNTRY_DISCOVERY_LOCAL_LANE_CYCLE_MINUTES=120;
export const COUNTRY_DISCOVERY_NOMINAL_CYCLE_MINUTES=60;
// The existing 512-slot budget can be shared with three global hub feeds.
// The 76 active source retirements recover enough slots for all 25 original
// index queries alongside the replacement hubs; preserve 8-slot cycles.
export const COUNTRY_DISCOVERY_HUB_LOCAL_CYCLE_MINUTES=120;
export const COUNTRY_DISCOVERY_HUB_NOMINAL_CYCLE_MINUTES=60;
const CATEGORIES=Object.freeze(["geopolitics","macro","rare_earth"]);
export const COUNTRY_MACRO_DISCOVERY_TERMS=Object.freeze([
 '"central bank"','CPI','PPI','PMI','GDP','inflation','"interest rates"',
 '"economic growth"','employment','payrolls','"retail sales"','"industrial production"',
 '"fiscal budget"','"sovereign debt"','"foreign reserves"','"exchange rate"',
 '"bank liquidity"','"bank deposits"','"financial stability"','trade','tariffs',
]);
// Material anchors keep lifecycle searches out of unrelated industrial news.
// Bullion remains in Macro; country queries are discovery, never event evidence.
export const COUNTRY_MINERAL_DISCOVERY_TERMS=Object.freeze([
 '"critical minerals"','"critical raw materials"','"rare earth"','mining',
 'lithium','copper','cobalt','nickel','graphite','gallium','germanium','antimony',
 'tungsten','manganese','vanadium','bauxite','"magnet materials"',
 '"mine permit"','"mine closure"','"mineral processing"','"smelter outage"',
 '"mineral export"','"mining royalties"','"mineral recycling"',
 '"mineral reserves"','"mineral offtake"','"mining investment"',
 '"mineral refining"','"rare earth separation"',
]);
const TERMS='('+['election','sanctions','security','conflict','border','war',
 ...COUNTRY_MACRO_DISCOVERY_TERMS,'currency',...COUNTRY_MINERAL_DISCOVERY_TERMS].join(' OR ')+')';
const STEP_MS=15*60000;

export function rotatingPrivateCountryDiscoverySources(now=new Date(),countries=COUNTRIES_195,perTick=COUNTRY_DISCOVERY_PER_TICK){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    ![COUNTRY_DISCOVERY_PER_TICK,COUNTRY_DISCOVERY_LOCAL_LANE_PER_TICK,46,22].includes(perTick)||
    !Array.isArray(countries)||countries.length!==195||
    new Set(countries.map(c=>c?.iso3)).size!==195||
    countries.some(c=>!/^[A-Z]{3}$/u.test(c?.iso3??"")||
      typeof c?.name!=="string"||!c.name.trim()||c.name.length>90))
   throw Error("PRIVATE_OSINT_COUNTRY_INDEX_REGISTRY_INVALID");
 const slot=Math.floor(now.getTime()/STEP_MS)%Math.ceil(countries.length/perTick);
 const selected=countries.slice(slot*perTick,(slot+1)*perTick);
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

export function privateOsintRuntimeSources(now=new Date(),base=privateOsintGlobalSources(),countries=COUNTRIES_195,
 {includeLocalGapLane=false}={}){
 if(!Array.isArray(base)||base.length===0||base.length>512||
   typeof includeLocalGapLane!=="boolean")
  throw Error("PRIVATE_OSINT_COUNTRY_INDEX_BASE_INVALID");
 const activeBase=base.filter(s=>!isRetiredPrivateOsintSource(s));
 const urls=new Set(activeBase.map(s=>s.url));
 if(urls.size!==activeBase.length)throw Error("PRIVATE_OSINT_COUNTRY_INDEX_BASE_DUPLICATE");
 // Preserve all 463 native/index publisher endpoints and 24 local candidates.
 // Overlay exact, pinned multilateral hubs by reallocating only rotating
 // Google index slots, never by increasing the existing 512 network GET cap.
 // Tiny synthetic test registries keep their original country-index behavior.
 const local=includeLocalGapLane?rotatingPrivateLocalPublisherSources(now).filter(s=>!isRetiredPrivateOsintSource(s)):[];
 const normalIndex=includeLocalGapLane?
  COUNTRY_DISCOVERY_LOCAL_LANE_PER_TICK:COUNTRY_DISCOVERY_PER_TICK;
 if(activeBase.length+local.length+normalIndex>512)
  throw Error("PRIVATE_OSINT_COUNTRY_INDEX_SOURCE_CEILING");
 const hubs=activeBase.length>=300?
  privateOsintGlobalHubSources().filter(source=>!urls.has(source.url)):[];
 // A missed index query is discovery-only, not a missing registered publisher.
 // Retiring repeatedly failed sources restores the full 25/49 index budget.
 const priority=activeBase.length>=300?
  privateOsintOfficialPrioritySources().filter(source=>!urls.has(source.url)&&
    !isRetiredPrivateOsintSource(source)&&!hubs.some(hub=>hub.url===source.url)):[];
 const indexPerTick=Math.min(normalIndex,512-activeBase.length-local.length-hubs.length-priority.length);
 if(indexPerTick<1)
  throw Error("PRIVATE_OSINT_GLOBAL_HUB_SOURCE_CEILING");
 const countryIndex=rotatingPrivateCountryDiscoverySources(now,countries,indexPerTick);
 const fresh=[];
 for(const source of [...hubs,...priority,...local,...countryIndex]){
  if(urls.has(source.url))continue;
  urls.add(source.url);fresh.push(source);
 }
 if(activeBase.length+fresh.length>512||
    (includeLocalGapLane&&fresh.length>
      PRIVATE_LOCAL_FEEDS_PER_TICK+COUNTRY_DISCOVERY_LOCAL_LANE_PER_TICK+hubs.length+priority.length))
  throw Error("PRIVATE_OSINT_COUNTRY_INDEX_SOURCE_CEILING");
 return launchPriorityWatchSources([...activeBase,...fresh]).map(qualifyPrivateNationalPrimaryScope);
}
