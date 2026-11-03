/**
 * Bounded first-party OG/JSON-LD metadata read-through for an ALREADY selected
 * private original. These bytes are never persisted as upstream raw content,
 * exposed to the public, or treated as independent event/rights verification.
 * The actual issuer native publication timestamp remains the RSS/Atom date.
 */
const MAX_HTML_BYTES=48*1024;
const MAX_DESCRIPTION=360;
const MAX_SELECTED=20;
const SAFE_HOST=/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u;
const FETCH_HEADERS=Object.freeze({
 "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 (GeoMacro Research Bot; news-intake)",
 "Accept":"text/html,application/xhtml+xml;q=0.9",
 "Range":"bytes=0-49151",
});
const decode=x=>String(x)
 .replace(/&#x([0-9a-f]{1,6});/giu,(_,v)=>String.fromCodePoint(parseInt(v,16)))
 .replace(/&#(\d{1,7});/gu,(_,v)=>{const code=Number(v);return code>0&&code<=0x10ffff?String.fromCodePoint(code):" "})
 .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/giu,v=>({
  "&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">","&nbsp;":" "
 })[v.toLowerCase()]??" ");
const tidy=value=>decode(String(value??"").replace(/<[^>]*>/gu," "))
 .replace(/[\u0000-\u001f\u007f]/gu," ").replace(/\s+/gu," ").trim();
const acceptable=text=>text.length>=45&&text.length<=MAX_DESCRIPTION&&
 !/(?:https?:\/\/|<|>|\b(?:ignore previous instructions|system prompt|reveal secret|api key|bearer token)\b)/iu.test(text);
function hostFrom(value){
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
     !SAFE_HOST.test(u.hostname)||!u.hostname.includes(".")||
     /(?:^|\.)(?:local|localhost|internal|test|invalid)$/u.test(u.hostname)||
     /^(?:\d+\.){3}\d+$/u.test(u.hostname)||
     /^(?:127|10|192|169)\./u.test(u.hostname)||u.href.length>1800)return null;
  return u;
 }catch{return null}
}
export function firstPartyOriginalUrl(candidate){
 const article=hostFrom(candidate?.articleUrl),feed=hostFrom(candidate?.sourceUrl);
 if(!article||!feed)return null;
 const noWww=x=>x.replace(/^www\./u,"");
 const a=noWww(article.hostname),b=noWww(feed.hostname);
 if(!(a===b||a.endsWith("."+b)||b.endsWith("."+a)))return null;
 return article.href;
}
const attributes=tag=>Object.fromEntries(
 [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)]
  .map(m=>[m[1].toLowerCase(),m[2]??m[3]??""])
);
export function extractOriginalMetadata(html){
 if(typeof html!=="string"||Buffer.byteLength(html,"utf8")>MAX_HTML_BYTES||
    /<!DOCTYPE[^>]+\[/iu.test(html))return null;
 const meta=new Map();
 for(const tag of html.match(/<meta\b[^>]*>/giu)??[]){
  const a=attributes(tag);const key=(a.property??a.name??"").toLowerCase();
  if(a.content&&["og:description","twitter:description","description"].includes(key))
    meta.set(key,a.content);
 }
 const candidates=[
  meta.get("og:description"),meta.get("twitter:description"),meta.get("description"),
 ];
 const scripts=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)].slice(0,3);
 for(const [,raw] of scripts){
  if(raw.length>12_000)continue;
  try{
   const root=JSON.parse(raw);
   const graphs=Array.isArray(root)?root:[root];
   for(const node of graphs.flatMap(x=>Array.isArray(x?.["@graph"])?x["@graph"]:[x]).slice(0,20))
    for(const k of ["description","articleBody"])
     if(typeof node?.[k]==="string")candidates.push(node[k]);
  }catch{/* ignore malformed JSON-LD without failing the feed */}
 }
 for(const match of [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)].slice(0,2))
  candidates.push(match[1]);
 for(const raw of candidates){
  if(typeof raw!=="string")continue;
  const value=tidy(raw).slice(0,MAX_DESCRIPTION);
  if(acceptable(value))return value;
 }
 return null;
}
export async function hydrateSelectedOriginalMetadata(selected,{
 fetchImpl=fetch,concurrency=6,timeoutMs=12000,
}={}){
 if(!Array.isArray(selected)||selected.length>MAX_SELECTED||
   !Number.isSafeInteger(concurrency)||concurrency<1||concurrency>10||
   !Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>15000)
  throw Error("PHASE2H_METADATA_BOUNDED_INPUT_INVALID");
 const enriched=new Array(selected.length);let fetched=0,missing=0,denied=0,skipped=0;
 const run=async(c,i)=>{
  const url=firstPartyOriginalUrl(c);
  if(!url){enriched[i]=c;skipped++;return}
  try{
   const response=await fetchImpl(url,{method:"GET",redirect:"error",
    headers:FETCH_HEADERS,signal:AbortSignal.timeout(timeoutMs)});
   if(response.status===401||response.status===403||response.status===429){
    denied++;enriched[i]=c;return;
   }
   if(![200,206].includes(response.status)||response.redirected||
      !/^(?:text\/html|application\/xhtml\+xml)/iu.test(response.headers.get("content-type")??"")||
      !response.body){missing++;enriched[i]=c;return}
   const reader=response.body.getReader(),chunks=[];let bytes=0;
   try{
    for(;;){
     const part=await reader.read();if(part.done)break;
     bytes+=part.value.byteLength;
     if(bytes>MAX_HTML_BYTES)break;
     chunks.push(part.value);
    }
   }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
   const html=new TextDecoder("utf-8",{fatal:false}).decode(
    Buffer.concat(chunks.map(x=>Buffer.from(x))));
   const description=extractOriginalMetadata(html);
   if(description){enriched[i]={...c,description};fetched++}
   else {enriched[i]=c;missing++}
  }catch{missing++;enriched[i]=c}
 };
 for(let offset=0;offset<selected.length;offset+=concurrency)
  await Promise.all(selected.slice(offset,offset+concurrency).map((c,j)=>run(c,offset+j)));
 return Object.freeze({candidates:enriched,
  schema:"geomacro.phase2h.selected-original-metadata.v1",
  metadata_summaries_observed:fetched,missing_or_invalid:missing,
  denied_or_rate_limited:denied,not_first_party:skipped,
  source_full_article_stored:false,independent_event_verified:false,
  source_rights_verified:false,paid_eligible:false});
}
