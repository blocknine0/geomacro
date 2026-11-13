import {createHash} from "node:crypto";
/**
 * Dedicated 20-minute private Hot-50 DIRECT publisher selection.
 * Existing pinned HTTP/Atom/RSS/JSON sources only, not Telegram, not Google
 * or GDELT index hints, not event-country attribution, not rights approval.
 *
 * This adapter intentionally uses ONLY source IDs, URL/category pins already
 * validated against the repository's source manifests by the crosswalk.
 * Every run independently checks source HTTP/native item clocks; unknown,
 * denied or stale feeds return honest checks and never fabricated news.
 */
import {hot50FourLaneSourceCrosswalk,hot50CellFeedFailoverPlan} from "./hot-50-four-lane-source-crosswalk.mjs";
import {HOT50_COUNTRY_ISO3,HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";
export const HOT50_DIRECT_20M_FREQUENCY_MINUTES=20;
export const HOT50_RETIRED_REPROBES_PER_SLOT=0;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const TYPES=new Set(["rss","rdf","atom","xml","json"]);
const safeUrl=link=>{
 const u=new URL(link);
 return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&
   !u.hostname.endsWith(".internal")&&!u.hostname.endsWith(".local")&&
   u.hostname.includes(".")&&u.href.length<=2000;
};
export function hot50Direct20mFailoverCategories(cellPlan,registry,checks){
 if(!Array.isArray(cellPlan)||cellPlan.length!==150||
    !Array.isArray(registry)||!Array.isArray(checks))
  throw Error("HOT50_DIRECT20M_FAILOVER_INPUT_INVALID");
 const checkByRef=new Map(checks.map(check=>[check.source_ref,check.state]));
 const needed=new Set();
 for(const cell of cellPlan){
  if(cell.primary_scope==="GLOBAL_TITLE_MATCH"){needed.add(cell.category);continue;}
  const primary=registry.find(source=>source.id===cell.primary_source_id);
  if(!primary){needed.add(cell.category);continue;}
  const ref=createHash("sha256").update([
   primary.id,primary.url,cell.category
  ].join("\n")).digest("hex");
  // Only a nonempty successful primary poll suppresses its backup. Empty,
  // denied, malformed or transport-failed primaries all take the failover.
  if(checkByRef.get(ref)!=="OBSERVED")needed.add(cell.category);
 }
 return Object.freeze([...needed].sort());
}
export function hot50Direct20mPublisherRegistry(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("HOT50_DIRECT20M_REPROBE_CLOCK_INVALID");
 const {snapshot}=hot50FourLaneSourceCrosswalk();
 const ids=new Set(),merged=new Map(),retired=[];
 for(const country of snapshot.countries){
  if(!HOT50_COUNTRY_SET.has(country.country_iso3))
    throw Error("HOT50_DIRECT20M_COUNTRY_SCOPE_INVALID");
  for(const pin of country.direct_news_osint_feeds){
   if(!TYPES.has(pin.feed_format)||!safeUrl(pin.url)||
     typeof pin.id!=="string"||!/^private_[a-z0-9_]+$/u.test(pin.id)||
     !Array.isArray(pin.categories)||pin.categories.length===0||
     pin.categories.some(c=>!CATEGORIES.includes(c))||
     ids.has(pin.id))
    throw Error("HOT50_DIRECT20M_PIN_INVALID:"+pin.id);
   ids.add(pin.id);
   const source=Object.freeze({
    id:pin.id,url:pin.url,
    source_ids:[pin.id],
    type:pin.feed_format,
    categories:[...pin.categories],
    continent:"global",
    publisher_country_iso3:pin.publisher_country_iso3??null,
    target_country_iso3:pin.target_country_iso3??country.country_iso3,
    target_country_iso3s:[pin.target_country_iso3??country.country_iso3],
    fallback_for_source_ids:[...(pin.fallback_for_source_ids??[])],
    supported:true,
    private_hot50_original_candidate:pin.kind==="official_or_public_primary_candidate",
    private_hot50_direct_20m:true,
    private_discovery_index_only:false,
    publisher_native_dates_required:true,
    transport_verified_at_registration:false,
    original_article_verified:false,
    rights_verified:false,
    commercial_eligible:false,publicly_deliverable:false,
   });
   if(isRetiredPrivateOsintSource(source)){retired.push(source);continue}
   const prev=merged.get(pin.url);
   if(prev){
    // Two catalogues can point at the same publisher endpoint. Preserve one
    // GET, union topics, never claim separate corroborating publishers.
   if(prev.publisher_country_iso3!==source.publisher_country_iso3)
    throw Error("HOT50_DIRECT20M_CONFLICTING_PUBLISHER_COUNTRY");
    merged.set(pin.url,Object.freeze({...prev,
     source_ids:[...new Set([...prev.source_ids,pin.id])],
     target_country_iso3s:[...new Set([...prev.target_country_iso3s,source.target_country_iso3])],
     categories:[...new Set([...prev.categories,...pin.categories])],
     fallback_for_source_ids:[...new Set([...prev.fallback_for_source_ids,...(pin.fallback_for_source_ids??[])])]}));
   }else merged.set(pin.url,source);
  }
 }
 const cellPlan=hot50CellFeedFailoverPlan();
 const globalFallbackRegistry=Object.freeze(snapshot.global_category_failover_candidates.map(feed=>
  Object.freeze({
   id:feed.id,url:feed.url,type:"rss",categories:[...feed.categories],
   continent:"global",supported:true,private_hot50_backup:true,
   private_hot50_direct_20m:false,private_discovery_index_only:false,
   private_hub_overlay:true,publisher_native_dates_required:true,
   transport_verified_at_registration:false,original_article_verified:false,
   rights_verified:false,commercial_eligible:false,publicly_deliverable:false,
  })));
 // Permanently removed feeds have no production re-probe lane. Preserve
 // catalogue provenance and expose exclusion counts for operator visibility.
 const nonretiredCount=merged.size;
 const n=retired.length;
 const count=0;
 const reprobed=[];
 if(snapshot.countries.length!==50||ids.size!==225||
    merged.size===0||merged.size>512)
  throw Error("HOT50_DIRECT20M_SOURCE_COUNT_DRIFT");
 return Object.freeze({
  registry:Object.freeze([...merged.values()]),
  fallback_registry:globalFallbackRegistry,
  cell_failover_plan:cellPlan,
  summary:Object.freeze({
   hot50_countries_configured:HOT50_COUNTRY_ISO3.length,
   categories_configured:CATEGORIES,
   direct_pinned_country_entries:225,
   distinct_nonretired_direct_endpoints:nonretiredCount,
   previously_retired_excluded:retired.length-reprobed.length,
   retired_source_ids:Object.freeze(retired.map(s=>s.id)),
   retired_reprobe_ids_this_tick:Object.freeze(reprobed),
   retired_reprobes_this_tick:reprobed.length,
   retired_reprobe_frequency_minutes:HOT50_DIRECT_20M_FREQUENCY_MINUTES,
   retired_reprobe_full_cycle_nominal_minutes:n&&count?
    HOT50_DIRECT_20M_FREQUENCY_MINUTES*Math.ceil(n/count):null,
   retired_reprobe_is_transport_only:true,
   retired_reprobe_does_not_prove_recovery:true,
   google_news_index_included:false,
   telegram_ingestion_included:false,
   original_article_or_rights_verified_by_catalogue:false,
  }),
 });
}
