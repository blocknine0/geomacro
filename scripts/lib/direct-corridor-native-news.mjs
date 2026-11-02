/** First-party corridor-only RSS/Atom article discovery, never public news.
 * Only native-dated permalink metadata; no publisher headline or body saved.
 */
import {createHash} from "node:crypto";
const MAX_BYTES=224*1024,AGE_MS=72*3600000,MAX_CANDIDATES=160;
const ROUTES=[
 ["strait_of_hormuz",/\b(?:strait of hormuz|hormuz|gulf of oman)\b/iu],
 ["bab_el_mandeb",/\b(?:bab[- ](?:el|al)[- ]mandeb|southern red sea)\b/iu],
 ["suez_canal",/\b(?:suez canal|suez navigation)\b/iu],
 ["panama_canal",/\b(?:panama canal|panama navigation)\b/iu],
 ["strait_of_malacca",/\b(?:strait of malacca|malacca strait)\b/iu],
 ["singapore_strait",/\b(?:singapore strait)\b/iu],
 ["south_china_sea",/\b(?:south china sea)\b/iu],
 ["taiwan_strait",/\b(?:taiwan strait)\b/iu],
 ["red_sea",/\b(?:red sea)\b/iu],
 ["gulf_of_aden_somali_basin",/\b(?:gulf of aden|somali basin)\b/iu],
 ["gulf_of_guinea",/\b(?:gulf of guinea)\b/iu],
 ["black_sea_grain_kerch",/\b(?:black sea|kerch strait|sea of azov)\b/iu]
];
function clean(s){
 if(typeof s!=="string")return "";
 return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1")
 .replace(/<[^>]*>/gu," ").replace(/&#(x[0-9a-f]+|\d+);/giu,(_,n)=>{
  const v=n.startsWith("x")?parseInt(n.slice(1),16):Number(n);
  return Number.isInteger(v)&&v>=32&&v<=126?String.fromCharCode(v):" ";
 }).replace(/&(amp|lt|gt|quot|apos|nbsp);/giu,(_,c)=>({
  amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "
 })[c.toLowerCase()]??" ").replace(/\s+/gu," ").trim();
}
function tag(xml,name){
 if(!/^[a-z:]+$/iu.test(name))throw Error("NATIVE_TAG_NOT_ALLOWED");
 const regex=new RegExp("<(?:(?:[\\w.-]+):)?"+name+"\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?"+name+">","iu");
 return regex.exec(xml)?.[1]??null;
}
function validClock(raw,now){
 const s=clean(raw);
 if(s.length<12||s.length>100||/^\d{4}-\d{2}-\d{2}$/u.test(s)||
    !/(?:GMT|UTC|Z)\b|[+-]\d{2}:?\d{2}$/iu.test(s))return null;
 const t=Date.parse(s);
 return Number.isFinite(t)&&t<=now.getTime()&&now.getTime()-t<=72*3600000?
    new Date(t).toISOString():null;
}
function samePublisherPermalink(raw,feedUrl){
 if(typeof raw!=="string"||raw.length>2048)return null;
 let link,feed;
 try{link=new URL(clean(raw),feedUrl);feed=new URL(feedUrl)}catch{return null}
 const host=h=>h.toLowerCase().replace(/^www\./u,"");
 if(link.protocol!=="https:"||link.username||link.password||link.port||
    host(link.hostname)!==host(feed.hostname))return null;
 link.hash="";link.search="";
 return link.href.length<=1024?link.href:null;
}
function feedItems(body){
 if(typeof body!=="string"||Buffer.byteLength(body,"utf8")>MAX_BYTES||
   /<!DOCTYPE|<!ENTITY/iu.test(body)||
   !/^\s*(?:<\?xml[^>]*>\s*)?<(?:rss|feed|rdf:RDF)\b/iu.test(body))return null;
 return [...body.matchAll(/<(?:[\w.-]+:)?(item|entry)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?\1>/giu)]
   .slice(0,40).map(x=>x[2]);
}
function extract(block,source,now){
 const headline=clean(tag(block,"title"));
 if(headline.length<8||headline.length>300)return null;
 const published=validClock(tag(block,"pubDate")??tag(block,"published")??tag(block,"date"),now);
 if(!published)return null;
 let href=clean(tag(block,"link"));
 if(!href){
  const link=[...block.matchAll(/<(?:(?:[\w.-]+):)?link\b([^>]*?)\/?>/giu)]
   .find(x=>!/\brel=["'](?:self|enclosure)["']/iu.test(x[1]));
  href=link?.[1].match(/\bhref=["']([^"']{1,2048})["']/iu)?.[1]??"";
 }
 const articleUrl=samePublisherPermalink(href,source.url);
 if(!articleUrl)return {missingPermalink:true};
 const candidate_corridor_ids=ROUTES.filter(([id,re])=>re.test(headline)).map(([id])=>id);
 return {id:createHash("sha256").update(source.id+"\x1f"+articleUrl+"\x1f"+published).digest("hex"),
   source_id:source.id,original_publisher_url:source.url,article_url:articleUrl,
   published_at:published,source_title_sha256:createHash("sha256").update(headline).digest("hex"),
   categories:[...source.categories],source_region_refs:[...source.corridors],
   candidate_corridor_ids,attribution:"FIRST_PARTY_NATIVE_FEED_METADATA",
   source_time_is_not_event_time:true,corridor_impact_verified:false,
   original_article_verified:false,independent_corroboration_verified:false,
   article_content_acquired:false,commercial_rights_verified:false,customer_delivery_enabled:false};
}
async function load(spec,fetchImpl){
 let response;
 try{response=await fetchImpl(spec.url,{method:"GET",redirect:"error",
   signal:AbortSignal.timeout(8000),
   headers:{accept:"application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9"}})}
 catch{return {state:"FEED_NETWORK_UNAVAILABLE",body:null}}
 if([401,403,429].includes(response.status))return {state:"DENIED_NO_RETRY",body:null};
 if(response.status!==200||(response.url&&response.url!==spec.url))
   return {state:"FEED_HTTP_UNAVAILABLE",body:null};
 if(Number(response.headers?.get?.("content-length")??0)>MAX_BYTES||!response.body)
   return {state:"FEED_BODY_UNAVAILABLE",body:null};
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{
   for(;;){const {done,value}=await reader.read();if(done)break;
     size+=value.byteLength;
     if(size>MAX_BYTES)return {state:"FEED_BODY_OVERSIZED",body:null};
     chunks.push(value);
   }
 }catch{return {state:"FEED_READ_FAILED",body:null}}
 finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 try{
   const bytes=new Uint8Array(size);let offset=0;
   for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength}
   return {state:"FEED_OBSERVED",body:new TextDecoder("utf-8",{fatal:true}).decode(bytes)};
 }catch{return {state:"FEED_ENCODING_INVALID",body:null}}
}
export async function collectDirectCorridorNativeNews({sources,fetchImpl=fetch,
 now=new Date(),concurrency=3}={}){
 if(!Array.isArray(sources)||sources.length>12||typeof fetchImpl!=="function"||
   !(now instanceof Date)||!Number.isFinite(now.getTime())||
   !Number.isInteger(concurrency)||concurrency<1||concurrency>4||
   sources.some(s=>s.format!=="rss"||
     !["EXISTING_DIRECT_FEED","POLL_DIRECT_FEED"].includes(s.state)||
     !s.url.startsWith("https://")||!Array.isArray(s.categories)||
     !Array.isArray(s.corridors)||s.channel!=="CORRIDOR_ONLY"||
     s.website_intelligence_enabled!==false))
   throw Error("CORRIDOR_NATIVE_NEWS_INPUT_INVALID");
 const responses=[];
 for(let i=0;i<sources.length;i+=concurrency)
   responses.push(...await Promise.all(sources.slice(i,i+concurrency).map(s=>load(s,fetchImpl))));
 const checks=[],items=[],seen=new Set();
 for(let i=0;i<sources.length;i++){
   const source=sources[i],res=responses[i],blocks=res.body===null?null:feedItems(res.body);
   let state=res.state,dated=0,links=0,routeTagged=0,regionalOnly=0,duplicates=0;
   if(res.body!==null){
     state=blocks===null?"NOT_A_NATIVE_FEED":"NO_RECENT_NATIVE_ITEM_DATE";
     for(const b of blocks??[]){
       const candidate=extract(b,source,now);
       if(!candidate)continue;
       dated++;
       if(candidate.missingPermalink)continue;
       links++;
       if(seen.has(candidate.id)){duplicates++;continue}
       seen.add(candidate.id);
       if(candidate.candidate_corridor_ids.length)routeTagged++;
       else regionalOnly++;
       if(items.length<MAX_CANDIDATES)items.push(candidate);
     }
     if(links)state="NATIVE_NEWS_CANDIDATES_INGESTED";
     else if(dated)state="NATIVE_DATE_BUT_PERMALINK_UNVERIFIED";
   }
   checks.push({id:source.id,state,metadata_candidates:dated,
     verified_native_permalinks:links,duplicate_records:duplicates,
     candidate_corridor_records:routeTagged,regional_context_records:regionalOnly,
     event_verified:false,flow_verified:false});
 }
 return Object.freeze({schema:"geomacro.corridor-native-news-candidates.v1",
   checked_at:now.toISOString(),channel:"CORRIDOR_ONLY",feed_count:sources.length,
   source_checks:checks,candidate_count:items.length,news_candidates:items,
   website_intelligence_enabled:false,website_intelligence_writes:0,
   source_news_collector_calls:0,d1_writes:0,b2_writes:0,supabase_writes:0,
   publisher_titles_persisted:false,raw_feed_bodies_persisted:false,
   commercial_rights_verified:false,paid_delivery_enabled:false,signed_gro_generated:false});
}
