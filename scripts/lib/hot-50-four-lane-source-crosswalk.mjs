/**
 * Source-ID and country/category crosswalk for the existing private Hot-50
 * collector. Pinned feeds are not current HTTP/rights/event confirmation;
 * Telegram entries remain explicitly disabled discovery references.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {HOT50_COUNTRY_ISO3,HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
import {hot50GoogleSourceCadence} from "./hot-50-google-news-category.mjs";
const ROOT=new URL("../../",import.meta.url);
const FILES=[
 "config/private-osint-working-sources.v1.json",
 "config/private-osint-local-gaplane.v1.json",
 "config/private-osint-national-gap-feeds.v1.json",
 "config/private-osint-official-priority-additions.v1.json",
 "config/private-osint-mineral-first-party-rss-expansion.v1.json",
 "config/private-osint-regional-corridor-additions.v1.json",
 "config/private-osint-local-rss-candidates.v1.json",
 "config/private-osint-macro-minerals-additions.v1.json",
 "config/hot-50-new-official-atom-sources.v1.json",
];
const CATEGORIES=["geopolitics","macro","rare_earth"];
const HTTP_GOOD=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"]);
const sha=s=>createHash("sha256").update(s).digest("hex");
export function hot50FourLaneSourceCrosswalk(){
 const snapshot=JSON.parse(readFileSync(
  new URL("config/hot-50-four-lane-source-crosswalk.v1.json",ROOT),"utf8"));
 if(snapshot.schema!=="geomacro.hot50.source-lane-crosswalk.v1"||
  snapshot.scope!=="PRIVATE_DISCOVERY_ONLY"||
  snapshot.country_count!==50||
  JSON.stringify(snapshot.categories)!==JSON.stringify(CATEGORIES)||
  !Array.isArray(snapshot.countries)||snapshot.countries.length!==50)
  throw Error("HOT50_FOUR_LANE_CROSSWALK_INVALID");
 const pinned=new Map();
 for(const file of FILES){
  const data=JSON.parse(readFileSync(new URL(file,ROOT),"utf8"));
  if(!Array.isArray(data.sources))throw Error("HOT50_PINNED_MANIFEST_MALFORMED");
  for(const s of data.sources){
   if(pinned.has(s.id))throw Error("HOT50_PINNED_SOURCE_DUPLICATE");
   pinned.set(s.id,s);
  }
 }
 let direct=0,telegram=0,primaries=0;
 for(let i=0;i<50;i++){
  const row=snapshot.countries[i];
  if(row?.country_iso3!==HOT50_COUNTRY_ISO3[i]||
     !HOT50_COUNTRY_SET.has(row.country_iso3)||
     !Array.isArray(row.direct_news_osint_feeds)||
     row.direct_news_osint_feeds.length<1||
     !Array.isArray(row.telegram_discovery_candidates)||
     JSON.stringify(row.google_news_category_watches)!==JSON.stringify(CATEGORIES)||
     row.on_demand_gdelt_shared!==true||
     row.no_event_or_rights_certification!==true)
   throw Error("HOT50_FOUR_LANE_COUNTRY_INVALID:"+i);
  const seenFeedIds=new Set(),seenChannelIds=new Set();
  for(const source of row.direct_news_osint_feeds){
   const pin=pinned.get(source.id);
   if(!pin||pin.url!==source.url||
      pin.publisher_country_iso3!==row.country_iso3||
      JSON.stringify(pin.categories)!==JSON.stringify(source.categories)||
      source.current_transport_verified!==false||
      !["official_or_public_primary_candidate","editorial_osint_candidate"].includes(source.kind)||
      !["rss","rdf","atom","xml","json"].includes(source.feed_format)||
      seenFeedIds.has(source.id))
    throw Error("HOT50_FOUR_LANE_DIRECT_SOURCE_DRIFT:"+source?.id);
   seenFeedIds.add(source.id);direct++;
   if(source.kind==="official_or_public_primary_candidate")primaries++;
  }
  for(const t of row.telegram_discovery_candidates){
   if(typeof t.candidate_key!=="string"||!t.candidate_key||
     !["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].includes(t.category)||
     t.activation_status!=="DISABLED"||
     t.publisher_authorized!==false||
     seenChannelIds.has(t.candidate_key))
    throw Error("HOT50_FOUR_LANE_UNAUTHORIZED_TELEGRAM");
   seenChannelIds.add(t.candidate_key);telegram++;
  }
 }
 if(direct!==124||telegram!==139)
  throw Error("HOT50_FOUR_LANE_SOURCE_COUNT_DRIFT");
 return Object.freeze({snapshot,inventory:{
  countries:50,categories:3,google_news_category_variants:150,
  pinned_direct_feed_country_entries:direct,
  first_party_or_public_original_candidates:primaries,
  telegram_discovery_candidates:telegram,
  telegram_authorized_active:0,
  original_article_or_rights_verification_inferred:false,
 }});
}
const sourceRef=(s,c)=>sha([s.id,s.url,c].join("\n"));
export function observedHot50FourLaneSourceState(registry,checks,items){
 if(!Array.isArray(registry)||!Array.isArray(checks)||!Array.isArray(items))
  throw Error("HOT50_FOUR_LANE_OBSERVATION_INPUT_INVALID");
 const {snapshot,inventory}=hot50FourLaneSourceCrosswalk();
 const sourceByUrl=new Map(registry.map(s=>[s.url,s]));
 const healthyRefs=new Set(checks.filter(c=>HTTP_GOOD.has(c.state))
  .map(c=>c.source_ref));
 let configured=0,healthy=0,hotCountryWorking=0;
 for(const row of snapshot.countries){
  let hasHealthy=false;
  for(const pin of row.direct_news_osint_feeds){
   const s=sourceByUrl.get(pin.url);
   if(!s)continue;
   configured++;
   if(s.categories.some(cat=>healthyRefs.has(sourceRef(s,cat)))){
    healthy++;hasHealthy=true;
   }
  }
  if(hasHealthy)hotCountryWorking++;
 }
 const hotObserved=new Set(items.filter(x=>HOT50_COUNTRY_SET.has(x.country_iso3))
  .map(x=>x.country_iso3));
 return Object.freeze({
  ...inventory,
  direct_configured_in_current_poll:configured,
  direct_healthy_in_current_poll:healthy,
  countries_with_healthy_direct_transport:hotCountryWorking,
  countries_with_title_matched_items_current_batch:hotObserved.size,
  actual_google_category_queries:registry.filter(s=>s.google_news_category_specific===true).length,
  nominal_google_category_cadence:hot50GoogleSourceCadence(
   registry.filter(s=>s.private_discovery_index_only===true&&
    /^[A-Z]{3}$/u.test(s.discovery_country_iso3??"")).length),
  telegram_message_ingestion_activated:false,
  originating_articles_independently_verified:false,
  commercial_rights_promoted:false,
  d1_b2_parity_proven_by_this_metric:false,
 });
}
