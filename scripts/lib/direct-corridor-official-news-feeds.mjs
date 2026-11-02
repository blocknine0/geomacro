/**
 * Supplementary first-party RSS discovery for existing operator-supplied WTO
 * and USGS source families. This does NOT replace either of the 37 submitted
 * URLs; the official institutions publish these separate news feeds.
 *
 * Only native timestamp, original publisher permalink and hashed title are
 * eligible to pass to the existing private 72-hour candidate ledger.
 * Feed access, publisher timestamp and article presence never mean a verified
 * incident, CAMEO classification, rights clearance or Risk Gate PAUSE.
 */
import {DIRECT_GLOBAL_CORRIDOR_SOURCES} from "./direct-global-corridor-sources.mjs";

export const DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS=Object.freeze([
 Object.freeze({
  id:"wto_official_news",
  original_registry_source_id:"wto_tariffs",
  url:"https://www.wto.org/library/rss/latest_news_e.xml",
  format:"rss",state:"POLL_DIRECT_FEED",
  channel:"CORRIDOR_ONLY",website_intelligence_enabled:false,
  categories:Object.freeze(["geopolitics","macro"]),
  corridors:Object.freeze(["global"]),
  event_verified:false,commercial_eligible:false
 }),
 Object.freeze({
  id:"usgs_official_minerals_news",
  original_registry_source_id:"usgs_mcs",
  url:"https://www.usgs.gov/news/minerals/feed",
  format:"rss",state:"POLL_DIRECT_FEED",
  channel:"CORRIDOR_ONLY",website_intelligence_enabled:false,
  categories:Object.freeze(["rare_earth"]),
  corridors:Object.freeze(["global"]),
  event_verified:false,commercial_eligible:false
 })
]);
export function assertDirectCorridorSupplementalNativeFeeds(){
 const originals=new Map(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(s=>[s.id,s]));
 if(DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS.length!==2)throw Error("CORRIDOR_SUPPLEMENT_FEED_COUNT");
 const seen=new Set();
 for(const s of DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS){
  const original=originals.get(s.original_registry_source_id);
  if(!original||!s.categories.every(c=>original.categories.includes(c))||
     seen.has(s.id)||originals.has(s.id)||s.event_verified!==false||
     s.channel!=="CORRIDOR_ONLY"||s.website_intelligence_enabled!==false||
     s.commercial_eligible!==false||s.format!=="rss"||
     s.state!=="POLL_DIRECT_FEED")throw Error("CORRIDOR_SUPPLEMENT_REGISTRY_INVALID");
  const u=new URL(s.url);
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
     !u.hostname.endsWith(".org")&&!u.hostname.endsWith(".gov"))throw Error("CORRIDOR_SUPPLEMENT_URL_INVALID");
  // WTO and USGS are different first-party sources. No third-party mirror.
  if((s.id==="wto_official_news"&&u.hostname!=="www.wto.org")||
     (s.id==="usgs_official_minerals_news"&&u.hostname!=="www.usgs.gov"))
   throw Error("CORRIDOR_SUPPLEMENT_PUBLISHER_INVALID");
  seen.add(s.id);
 }
 return true;
}
