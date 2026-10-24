/**
 * ICC's own Media and ICC page links to the official news RSS feed.
 * First-party RSS observations are discovery leads only: feed pubDate,
 * observed/retrieval timestamps or titles never supply independently
 * verified original-article publication, rights, review or paid evidence.
 */
export const ICC_OFFICIAL_NEWS_RSS="https://www.icc-cpi.int/rss/news/all";
const MAX_ITEMS=120;
const MAX_BYTES=2*1024*1024;
function xmlValue(item,tag){
 const m=new RegExp("<"+tag+"(?:\\s[^>]*)?>([\\s\\S]{0,2600}?)<\\/"+tag+">","iu").exec(item);
 if(!m)return "";
 const s=m[1].trim();
 return s.startsWith("<![CDATA[")
  ? /^<!\[CDATA\[([\s\S]*)\]\]>$/u.exec(s)?.[1]?.trim()??""
  : s.replace(/&amp;/giu,"&").trim();
}
export function pinnedIccOriginalNewsLink(value){
 if(typeof value!=="string"||value.length>700)return null;
 let u;
 try{u=new URL(value.trim())}catch{return null;}
 if(u.protocol!=="https:"||u.hostname!=="www.icc-cpi.int"||
    u.port||u.username||u.password||u.search||u.hash||
    u.href.length>600||
    !/^\/news\/[a-z0-9][a-z0-9-]{2,160}(?:\/[a-z0-9][a-z0-9-]{2,160}){0,3}\/?$/iu.test(u.pathname)||
    /\/(?:rss|subscribe|filter|search|node)(?:\/|$)/iu.test(u.pathname))
    return null;
 return u.href;
}
export function parseIccOfficialNewsRss(xml){
 if(typeof xml!=="string"||Buffer.byteLength(xml)>MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/iu.test(xml) ||
    !/<rss(?:\s|>)/iu.test(xml) ||
    !/<channel(?:\s|>)/iu.test(xml) ||
    !/International Criminal Court|ICC/iu.test(xml.slice(0,10000)))
   throw Error("ICC_OFFICIAL_RSS_SHAPE_INVALID");
 const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)];
 if(items.length<1)throw Error("ICC_OFFICIAL_RSS_NO_ITEMS");
 if(items.length>MAX_ITEMS)throw Error("ICC_OFFICIAL_RSS_ITEM_BUDGET");
 let official=0,dated=0;
 const seen=new Set();
 for(const [,item] of items){
  const link=pinnedIccOriginalNewsLink(xmlValue(item,"link"));
  const title=xmlValue(item,"title").replace(/<[^>]*>/gu," ").trim();
  if(!link||title.length<10||title.length>360||seen.has(link))continue;
  seen.add(link);official++;
  const time=xmlValue(item,"pubDate");
  if(/(?:\bGMT\b|\bUTC\b|[+-][0-1]\d\d{2})$/iu.test(time)&&
     Number.isFinite(Date.parse(time)))dated++;
 }
 if(!official)throw Error("ICC_OFFICIAL_RSS_NO_APPROVED_ORIGINAL_LINKS");
 return Object.freeze({
  schema:"geomacro.icc-first-party-rss-discovery.v1",
  issuer:"icc",category:"GEOPOLITICS",
  feed_items_inspected:items.length,
  first_party_original_link_leads:official,
  feed_date_assertion_count:dated,
  first_party_official_rss_verified:true,
  first_party_html_news_parser_recovered:false,
  original_article_html_readback_verified:false,
  native_first_publication_clock_verified:false,
  independently_corroborated_event_verified:false,
  article_scoped_rights_verified:false,
  numerical_scored_gri_verified:false,
  signed_products_created:false,
  commercial_eligible:false,
  raw_articles_or_links_emitted:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
 });
}