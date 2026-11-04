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
import {hot50FourLaneSourceCrosswalk} from "./hot-50-four-lane-source-crosswalk.mjs";
import {HOT50_COUNTRY_ISO3,HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";
export const HOT50_DIRECT_20M_FREQUENCY_MINUTES=20;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const TYPES=new Set(["rss","rdf","atom","xml","json"]);
const safeUrl=link=>{
 const u=new URL(link);
 return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&
   !u.hostname.endsWith(".internal")&&!u.hostname.endsWith(".local")&&
   u.hostname.includes(".")&&u.href.length<=2000;
};
export function hot50Direct20mPublisherRegistry(){
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
    type:pin.feed_format,
    categories:[...pin.categories],
    continent:"global",
    publisher_country_iso3:country.country_iso3,
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
   if(isRetiredPrivateOsintSource(source)){retired.push(pin.id);continue}
   const prev=merged.get(pin.url);
   if(prev){
    // Two catalogues can point at the same publisher endpoint. Preserve one
    // GET, union topics, never claim separate corroborating publishers.
    if(prev.publisher_country_iso3!==country.country_iso3)
     throw Error("HOT50_DIRECT20M_CONFLICTING_PUBLISHER_COUNTRY");
    merged.set(pin.url,Object.freeze({...prev,
     categories:[...new Set([...prev.categories,...pin.categories])]}));
   }else merged.set(pin.url,source);
  }
 }
 if(snapshot.countries.length!==50||ids.size!==124||
    merged.size===0||merged.size>512)
  throw Error("HOT50_DIRECT20M_SOURCE_COUNT_DRIFT");
 return Object.freeze({
  registry:Object.freeze([...merged.values()]),
  summary:Object.freeze({
   hot50_countries_configured:HOT50_COUNTRY_ISO3.length,
   categories_configured:CATEGORIES,
   direct_pinned_country_entries:124,
   distinct_nonretired_direct_endpoints:merged.size,
   previously_retired_excluded:retired.length,
   retired_source_ids:Object.freeze(retired),
   google_news_index_included:false,
   telegram_ingestion_included:false,
   original_article_or_rights_verified_by_catalogue:false,
  }),
 });
}
