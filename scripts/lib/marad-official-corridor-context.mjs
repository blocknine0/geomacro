// Official US Maritime Alert & Advisory System, hosted by MARAD.
// Private first-party RSS metadata only, never a vessel-attack certification,
// independently verified story, physical route observation or paid dataset.
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";
export const MARAD_OFFICIAL_RSS_URL="https://www.maritime.dot.gov/taxonomy/term/441/feed";
const LAST_90_DAYS=90*86_400_000;
const MARAD_CORRIDOR_TITLES=Object.freeze([
  {id:"strait_of_hormuz",pattern:/\b(?:strait of hormuz|persian gulf|gulf of oman)\b/iu},
  {id:"bab_el_mandeb",pattern:/\b(?:bab[- ](?:el|al)[- ]mandeb|red sea)\b/iu},
  {id:"gulf_of_aden_somali_basin",pattern:/\b(?:gulf of aden|somali basin)\b/iu},
  {id:"black_sea_grain_kerch",pattern:/\b(?:black sea|sea of azov|kerch strait)\b/iu},
  {id:"suez_canal",pattern:/\bsuez canal\b/iu},
]);
function xmlText(item,name){
 const raw=item.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","iu"))?.[1]??"";
 return raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/u,"$1")
   .replace(/&amp;/giu,"&").replace(/&quot;/giu,'"')
   .replace(/&#39;|&apos;/giu,"'").trim();
}
function isFirstPartyArticleLink(link){
 try{
   const u=new URL(link);
   return u.protocol==="https:"&&u.hostname==="www.maritime.dot.gov"&&
     !u.username&&!u.password&&!u.port&&!u.hash&&!u.search&&
     /^\/msci\/20\d{2}-\d{3}[a-z]?-[a-z0-9-]{8,240}$/u.test(u.pathname);
 }catch{return false;}
}
export function summarizeMaradCorridorContext(payload,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("MARAD_CLOCK_INVALID");
 if(typeof payload!=="string"||payload.length>256000||
     !/<rss(?:\s|>)/iu.test(payload)||/<!DOCTYPE|<!ENTITY/iu.test(payload))
   throw Error("MARAD_RSS_INVALID");
 const matching=new Set(),seen=new Set();
 let verified_feed_item_clocks=0;
 let first_party_advisory_candidates=0;
 for(const [,item] of payload.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)){
   if(seen.size>=40)break;
   const title=xmlText(item,"title"),link=xmlText(item,"link");
   const published=xmlText(item,"pubDate");
   const ms=officialItemNativePublicationMs(published);
   // RSS item pubDate is the feed's claim; article-page dates and active
   // advisory effective/expiry dates remain separately unverified.
   if(!Number.isFinite(ms)||ms>now.getTime()||now.getTime()-ms>LAST_90_DAYS||
      !isFirstPartyArticleLink(link)||!/^20\d{2}-\d{3}[a-z]?\b/iu.test(title)||
      seen.has(link))continue;
   seen.add(link);
   verified_feed_item_clocks++;
   const ids=MARAD_CORRIDOR_TITLES.filter(x=>x.pattern.test(title)).map(x=>x.id);
   if(!ids.length)continue;
   first_party_advisory_candidates++;
   for(const id of ids)matching.add(id);
 }
 return Object.freeze({
   schema:"geomacro.marad-corridor-context-candidates.v1",
   source_family:"marad_advisories",
   publisher_family:"us_maritime_advisory_system",
   first_party_issuer_feed_items_with_native_date:verified_feed_item_clocks,
   advisory_items_with_corridor_terms:first_party_advisory_candidates,
   candidate_corridor_ids:[...matching].sort(),
   rss_item_date_is_verified_article_page_date:false,
   publisher_advisory_current_status_verified:false,
   actual_maritime_incidents_verified:0,
   corridor_disruption_verified:false,
   commercial_rights_verified:false,
   raw_content_exposed:false
 });
}
