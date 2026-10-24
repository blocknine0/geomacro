/**
 * RBI PRESS RELEASES (IND macro) — first-party public RSS reference ONLY.
 * Official feed: https://www.rbi.org.in/Scripts/rss.aspx
 * Native RSS item dates are feed assertions, NOT independently reread
 * original article publication, commercial rights or verified numerical FX.
 * Keep all upstream text and source URLs out of durable output.
 */
export const RBI_PRESS_RELEASE_FEEDS=Object.freeze([
 "https://rbi.org.in/pressreleases_rss.xml",
 "https://www.rbi.org.in/pressreleases_rss.xml",
]);
const MAX_BYTES=384*1024;
const MAX_ITEMS=80;
const FRESH_MS=24*3600_000;
const ALLOWED=new Set(["rbi.org.in","www.rbi.org.in"]);
const DATE_ZONE=/(?:\b(?:GMT|UTC)\b|[+-](?:0\d|1[0-4])\d{2})$/iu;
const relevant=/\b(?:monetary|repo rate|reverse repo|liquidity|foreign exchange|currency|inflation|policy rate|bank rate|exchange reserves?|reserve bank|financial stability|credit growth|payment systems?)\b/iu;
function valueOf(item,tag){
 const escaped=tag.replace(/[^A-Za-z]/gu,"");
 const match=new RegExp("<"+escaped+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+escaped+">","iu").exec(item);
 if(!match)return "";
 const s=match[1].trim();
 return s.startsWith("<![CDATA[")?(/^<!\[CDATA\[([\s\S]*?)\]\]>$/u.exec(s)?.[1]??""):s;
}
export function pinnedRbiPressReleaseLink(raw){
 if(typeof raw!=="string"||raw.length>550)return null;
 const cleaned=raw.trim().replace(/&amp;/giu,"&");
 let u;
 try{u=new URL(cleaned)}catch{return null;}
 if(!["http:","https:"].includes(u.protocol)||
    !ALLOWED.has(u.hostname.toLowerCase())||u.username||u.password||
    u.port||u.hash||
    !/^\/scripts\/bs_pressreleasedisplay\.aspx$/iu.test(u.pathname))
  return null;
 // Publisher's only supported permalink identifier. Do not forward any
 // unrelated query, redirect or arbitrary host. A historic RBI http URL is
 // normalized BEFORE private use and never directly fetched.
 const params=[...u.searchParams.entries()];
 if(params.length!==1||params[0][0].toLowerCase()!=="prid"||
   !/^[1-9][0-9]{2,9}$/u.test(params[0][1]))return null;
 return "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid="+params[0][1];
}
export function parseRbiMacroPressReference(xml,now=new Date()){
 if(typeof xml!=="string"||Buffer.byteLength(xml)>MAX_BYTES||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    /<!DOCTYPE|<!ENTITY/iu.test(xml)||
    !/<rss(?:\s|>)/iu.test(xml)||!/<channel(?:\s|>)/iu.test(xml))
  throw Error("RBI_FEED_SHAPE_INVALID");
 const items=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)];
 if(items.length>MAX_ITEMS)throw Error("RBI_ITEM_LIMIT");
 if(items.length===0)throw Error("RBI_NO_ITEMS");
 let exactLinks=0,dated=0,relevantItems=0,currentFeedItems=0;
 const seen=new Set();
 for(const [,item]of items){
  const url=pinnedRbiPressReleaseLink(valueOf(item,"link"));
  if(!url||seen.has(url))continue;
  seen.add(url);exactLinks++;
  const time=valueOf(item,"pubDate");
  const clock=DATE_ZONE.test(time)?Date.parse(time):NaN;
  if(!Number.isFinite(clock)||clock>now.getTime())continue;
  dated++;
  const title=valueOf(item,"title").replace(/<[^>]*>/gu," ").slice(0,500);
  if(!relevant.test(title))continue;
  relevantItems++;
  if(now.getTime()-clock<=FRESH_MS)currentFeedItems++;
 }
 return Object.freeze({
  schema:"geomacro.rbi-original-macro-reference.v1",
  country_iso3:"IND",category:"macro",publisher:"rbi",
  rss_items_inspected:items.length,exact_original_link_ids:exactLinks,
  feed_items_with_bounded_native_clock:dated,
  relevant_original_link_ids:relevantItems,
  current_24h_rss_reference_items:currentFeedItems,
  // The feed link identifies the issuer's original, but no original HTML was
  // reread; do NOT call this independent original-page evidence.
  original_page_html_readback_verified:false,
  publisher_original_first_published_clock_verified:false,
  article_scoped_commercial_rights_verified:false,
  independent_event_facts_verified:false,
  numerical_macro_values_verified:false,
  current_signed_gri_verified:false,commercial_paid_eligible:false,
  raw_article_urls_titles_or_bytes_exposed:false,
  supabase_requests:0,b2_requests:0,d1_writes:0,payments:0,
 });
}
export async function fetchRbiMacroPressReference({fetchImpl=fetch,now=new Date()}={}){
 let res;
 for(let i=0;i<RBI_PRESS_RELEASE_FEEDS.length;i++){
  try{
   res=await fetchImpl(RBI_PRESS_RELEASE_FEEDS[i],{
    method:"GET",redirect:"error",headers:{accept:"application/rss+xml,application/xml,text/xml"},
    signal:AbortSignal.timeout(12000),
   });
  }catch(e){
   // Only a transient network/redirect error on the first exact official
   // endpoint qualifies for a single already pinned www alternate.
   if(i===0 && (e?.name==="AbortError"||e?.name==="TimeoutError"||
      e?.name==="TypeError"))continue;
   throw Error("RBI_FEED_TRANSPORT_UNAVAILABLE");
  }
  if(!res?.ok){
   try{await res?.body?.cancel()}catch{}
   if(i===0&&[500,502,503,504].includes(res?.status))continue;
   throw Error(res?.status===429?"RBI_FEED_RATE_LIMITED":
    [401,403].includes(res?.status)?"RBI_FEED_ACCESS_DENIED":"RBI_FEED_HTTP_NOT_OK");
  }
  break;
 }
 if(!res?.ok)throw Error("RBI_FEED_UNAVAILABLE");
 if(res.redirected===true||
    (res.url && !RBI_PRESS_RELEASE_FEEDS.includes(res.url)))
  throw Error("RBI_FEED_REDIRECT_UNVERIFIED");
 if(!res.body||Number(res.headers.get("content-length")??0)>MAX_BYTES)
  throw Error("RBI_FEED_SIZE_INVALID");
 const reader=res.body.getReader(),parts=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>MAX_BYTES)throw Error("RBI_FEED_SIZE_INVALID");
   parts.push(Buffer.from(value));
  }
 }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 let xml;
 try{xml=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(parts))}
 catch{throw Error("RBI_FEED_ENCODING_INVALID")}
 return parseRbiMacroPressReference(xml,now);
}
