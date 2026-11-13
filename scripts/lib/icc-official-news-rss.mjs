/**
 * ICC's own Media and ICC page links to the official news RSS feed.
 * First-party RSS observations are discovery leads only: feed pubDate,
 * observed/retrieval timestamps or titles never supply independently
 * verified original-article publication, rights, review or paid evidence.
 */
export const ICC_OFFICIAL_NEWS_RSS="https://www.icc-cpi.int/rss.xml";
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
    !(/^\/news\/[a-z0-9][a-z0-9-]{2,160}(?:\/[a-z0-9][a-z0-9-]{2,160}){0,3}\/?$/iu.test(u.pathname)||
      /^\/node\/[1-9][0-9]{2,8}\/?$/u.test(u.pathname))||
    /\/(?:rss|subscribe|filter|search)(?:\/|$)/iu.test(u.pathname))
    return null;
 return u.href;
}
function nativeFeedDate(item){
 for(const tag of ["pubDate","dc:date"]){
  const value=xmlValue(item,tag);
  if(!value||!/(?:Z|[+-]\d{2}:?\d{2}|\bGMT\b|\bUTC\b)$/iu.test(value))continue;
  const ms=Date.parse(value);
  if(Number.isFinite(ms))return new Date(ms).toISOString();
 }
 return null;
}
// Internal bounded fetch input: only validated first-party article URLs leave
// the RSS parser. The public diagnostic receipt intentionally omits the URLs.
export function extractIccOfficialNewsLinks(xml,{limit=5}={}){
 const receipt=parseIccOfficialNewsRss(xml);
 if(!Number.isInteger(limit)||limit<1||limit>10)throw Error("ICC_OFFICIAL_RSS_LINK_LIMIT_INVALID");
 const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)],seen=new Set(),links=[];
 for(const [,item] of items){
  const link=pinnedIccOriginalNewsLink(xmlValue(item,"link"));
  const title=xmlValue(item,"title").replace(/<[^>]*>/gu," ").trim();
  if(link&&title.length>=10&&title.length<=360&&!seen.has(link)){seen.add(link);links.push(link);}
  if(links.length>=limit)break;
 }
 if(!receipt.first_party_original_link_leads||!links.length)throw Error("ICC_OFFICIAL_RSS_NO_APPROVED_ORIGINAL_LINKS");
 return Object.freeze(links);
}
export function parseIccOfficialNewsItems(xml){
 if(typeof xml!=="string"||Buffer.byteLength(xml)>MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/iu.test(xml) ||
    !/<rss(?:\s|>)/iu.test(xml) ||
    !/<channel(?:\s|>)/iu.test(xml) ||
    !/International Criminal Court|ICC/iu.test(xml.slice(0,10000)))
   throw Error("ICC_OFFICIAL_RSS_SHAPE_INVALID");
 const matches=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)];
 if(matches.length<1)throw Error("ICC_OFFICIAL_RSS_NO_ITEMS");
 if(matches.length>MAX_ITEMS)throw Error("ICC_OFFICIAL_RSS_ITEM_BUDGET");
 const seen=new Set(),records=[];
 for(const [,item] of matches){
  const link=pinnedIccOriginalNewsLink(xmlValue(item,"link"));
  const title=xmlValue(item,"title").replace(/<[^>]*>/gu," ").trim();
  const publishedAt=nativeFeedDate(item);
  if(!link||title.length<10||title.length>360||!publishedAt||seen.has(link))continue;
  seen.add(link);
  records.push(Object.freeze({id:new URL(link).pathname.split("/").filter(Boolean).at(-1),
    title,publishedAt,url:link}));
 }
 if(!records.length)throw Error("ICC_OFFICIAL_RSS_NO_DATED_FIRST_PARTY_ITEMS");
 return Object.freeze(records);
}
export function parseIccOfficialNewsRss(xml){
 if(typeof xml!=="string"||Buffer.byteLength(xml)>MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/iu.test(xml) ||
    !/<rss(?:\s|>)/iu.test(xml) ||
    !/<channel(?:\s|>)/iu.test(xml) ||
    !/International Criminal Court|ICC/iu.test(xml.slice(0,10000)))
   throw Error("ICC_OFFICIAL_RSS_SHAPE_INVALID");
 const matches=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)];
 if(matches.length<1)throw Error("ICC_OFFICIAL_RSS_NO_ITEMS");
 if(matches.length>MAX_ITEMS)throw Error("ICC_OFFICIAL_RSS_ITEM_BUDGET");
 let official=0,dated=0;
 const seen=new Set();
 for(const [,item] of matches){
  const link=pinnedIccOriginalNewsLink(xmlValue(item,"link"));
  const title=xmlValue(item,"title").replace(/<[^>]*>/gu," ").trim();
  if(!link||title.length<10||title.length>360||seen.has(link))continue;
  seen.add(link);official++;
  if(nativeFeedDate(item))dated++;
 }
 if(!official)throw Error("ICC_OFFICIAL_RSS_NO_APPROVED_ORIGINAL_LINKS");
 return Object.freeze({
  schema:"geomacro.icc-first-party-rss-discovery.v1",
  issuer:"icc",category:"GEOPOLITICS",
  feed_items_inspected:matches.length,
  first_party_original_link_leads:official,
  feed_date_assertion_count:dated,
  first_party_official_rss_verified:true,
  publisher_native_feed_clock_verified:dated>0,
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
