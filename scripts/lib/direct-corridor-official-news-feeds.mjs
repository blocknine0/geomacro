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
 }),
 Object.freeze({
  // Independent first-party alternative while USGS minerals endpoint is denied.
  // This is US DOE's own news, not a mirror of USGS or an incident verifier.
  id:"doe_official_critical_materials_news",
  original_registry_source_id:"usgs_mcs",
  independent_alternative_for:"usgs_official_minerals_news",
  url:"https://www.energy.gov/rss/energygov/2193718",
  format:"rss",state:"POLL_DIRECT_FEED",
  channel:"CORRIDOR_ONLY",website_intelligence_enabled:false,
  categories:Object.freeze(["rare_earth"]),
  corridors:Object.freeze(["global"]),
  event_verified:false,commercial_eligible:false
 }),
 Object.freeze({
  id:"rbi_official_press_releases",
  original_registry_source_id:"rbi_releases",
  url:"https://www.rbi.org.in/pressreleases_rss.xml",
  format:"rss",state:"POLL_DIRECT_FEED",
  channel:"CORRIDOR_ONLY",website_intelligence_enabled:false,
  categories:Object.freeze(["macro"]),
  corridors:Object.freeze(["apac"]),
  event_verified:false,commercial_eligible:false
 })
]);
// Complete publisher URL contracts, not a substring or hostname-only check.
// A same-host malicious path, query string or URL-encoded suffix is NOT a
// different source licensed/authorized by the operator's pinned registry.
export const PINNED_CORRIDOR_OFFICIAL_FEED_URLS=Object.freeze({
 wto_official_news:"https://www.wto.org/library/rss/latest_news_e.xml",
 usgs_official_minerals_news:"https://www.usgs.gov/news/minerals/feed",
 doe_official_critical_materials_news:"https://www.energy.gov/rss/energygov/2193718",
 rbi_official_press_releases:"https://www.rbi.org.in/pressreleases_rss.xml",
});
export function assertDirectCorridorSupplementalNativeFeeds(
 feeds=DIRECT_CORRIDOR_SUPPLEMENTAL_NATIVE_FEEDS
){
 const originals=new Map(DIRECT_GLOBAL_CORRIDOR_SOURCES.map(s=>[s.id,s]));
 if(!Array.isArray(feeds)||feeds.length!==4)throw Error("CORRIDOR_SUPPLEMENT_FEED_COUNT");
 const seen=new Set();
 for(const s of feeds){
  const original=originals.get(s.original_registry_source_id);
  if(!original||!s.categories.every(c=>original.categories.includes(c))||
     seen.has(s.id)||originals.has(s.id)||s.event_verified!==false||
     s.channel!=="CORRIDOR_ONLY"||s.website_intelligence_enabled!==false||
     s.commercial_eligible!==false||s.format!=="rss"||
     s.state!=="POLL_DIRECT_FEED")throw Error("CORRIDOR_SUPPLEMENT_REGISTRY_INVALID");
  let u;
  try{u=new URL(s.url)}catch{throw Error("CORRIDOR_SUPPLEMENT_URL_INVALID")}
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
     u.search||u.href!==PINNED_CORRIDOR_OFFICIAL_FEED_URLS[s.id]||
     s.url!==PINNED_CORRIDOR_OFFICIAL_FEED_URLS[s.id]||
     (s.id==="doe_official_critical_materials_news"&&
      s.independent_alternative_for!=="usgs_official_minerals_news"))
   throw Error("CORRIDOR_SUPPLEMENT_PUBLISHER_INVALID");
  seen.add(s.id);
 }
 return true;
}
