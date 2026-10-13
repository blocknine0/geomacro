/**
 * Private-only bridge for exactly the additional official publishers sampled
 * by the SAME 30-minute D1 pulse. No arbitrary URLs, raw D1 storage, source
 * disclosure, model invocation, B2 action or payment.
 *
 * A novel URL digest from D1 merely authorizes fetching one pinned publisher
 * feed. We still require the same URL identity AND exact native publication
 * clock before passing an item to the existing canonical private classifier.
 */
import {select30MinPublishers} from "../ops/probe-30min-three-domain-pulse.mjs";
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";
import {privateOriginalMatchesPulse} from "./private-novel-pulse-match.mjs";

const MAX_BYTES=192*1024;
const MAX_ENTRIES=40;
const LIMIT_PER_DOMAIN=2;
const MIME=/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;
const EXTRA=Object.freeze({
  geopolitics:new Set(["uk_mod_original_defence_atom_review"]),
  macro:new Set(["uk_hmt_original_treasury_atom_review"]),
  rare_earth:new Set([
    "australia_industry_minister_original_rss_review",
    "uk_desnz_original_energy_minerals_atom_review",
  ]),
});
const GOVERNMENT_ORIGINAL=/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9][a-z0-9/-]{4,230}$/iu;
const AU_ORIGINAL=/^\/(?:t-ayres|king)\/media\/[a-z0-9][a-z0-9-]{9,190}$/iu;
function unescape(value){
  return String(value??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu,"$1")
    .replace(/&(?:amp|lt|gt|quot|apos|#([0-9]+)|#x([0-9a-f]+));/giu,
      (full,decimal,hex)=>{
        const named={"&amp;":"&","&lt;":"<","&gt;":">",
          "&quot;":'"',"&apos;":"'"};
        if(Object.hasOwn(named,full.toLowerCase()))
          return named[full.toLowerCase()];
        const number=decimal?Number(decimal):Number.parseInt(hex,16);
        return Number.isInteger(number)&&number>0&&number<=0x10ffff
          ?String.fromCodePoint(number):"";
      })
    .replace(/<[^>]*>/gu," ").replace(/\s+/gu," ").trim();
}
function tag(block,name){
  const match=block.match(new RegExp("<(?:atom:)?"+name+
    "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:atom:)?"+name+">","iu"));
  return match?unescape(match[1]):"";
}
function atomLink(block){
  for(const m of block.matchAll(/<(?:atom:)?link\b([^>]{0,1200})\/?\s*>/giu)){
    const attrs=m[1];
    const rel=/\brel\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1]??"alternate";
    if(rel!=="alternate"&&rel!=="canonical")continue;
    const href=/\bhref\s*=\s*["']([^"']{1,1800})["']/iu.exec(attrs)?.[1];
    if(href)return unescape(href);
  }
  return null;
}
function originalLink(value,source){
  if(typeof value!=="string"||value.length>1800)return null;
  try {
    const u=new URL(value);
    if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
      u.search||!source.original_hosts.includes(u.hostname))return null;
    if(source.id==="australia_industry_minister_original_rss_review"
      ?!AU_ORIGINAL.test(u.pathname):!GOVERNMENT_ORIGINAL.test(u.pathname))
      return null;
    return u.href;
  } catch {return null;}
}
export function selectedPulseRotatedScorerSources(category,checkedAt){
  if(!Object.hasOwn(EXTRA,category) ||
    typeof checkedAt!=="string"||
    !/^20\d{2}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(checkedAt))
    throw Error("PRIVATE_PULSE_EXTRA_SOURCE_CONTEXT_INVALID");
  const date=new Date(checkedAt);
  if(!Number.isFinite(date.getTime()))throw Error("PRIVATE_PULSE_EXTRA_SOURCE_CONTEXT_INVALID");
  return select30MinPublishers(date)[category]
    .filter(source=>EXTRA[category].has(source.id))
    .slice(0,LIMIT_PER_DOMAIN);
}

export function parsePulseRotatedOriginals(xml,source,{
  refs,expectedClocks,now=new Date(),
}={}){
  if(typeof xml!=="string"||Buffer.byteLength(xml,"utf8")>MAX_BYTES||
    /<!DOCTYPE|<!ENTITY/iu.test(xml)||!source||
    !Object.hasOwn(EXTRA,source.domain)||!EXTRA[source.domain].has(source.id)||
    !(refs instanceof Set)||!(expectedClocks instanceof Map)||
    !(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Array.isArray(source.original_hosts)||source.original_hosts.length===0||
    !["atom","rss"].includes(source.media))
    throw Error("PRIVATE_PULSE_EXTRA_SOURCE_UNTRUSTED");
  const isAtom=source.media==="atom";
  if(isAtom?!/<(?:atom:)?feed(?:\s|>)/iu.test(xml):!/<rss(?:\s|>)/iu.test(xml))
    throw Error("PRIVATE_PULSE_EXTRA_SOURCE_DOCUMENT_INVALID");
  const entries=[...xml.matchAll(isAtom
    ? /<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu
    : /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)]
    .slice(0,MAX_ENTRIES);
  const matched=[],seen=new Set();
  for(const [,item] of entries){
    const published=tag(item,isAtom?"published":"pubDate");
    // Feed/entry updated is never an originating publication timestamp.
    if(!published)continue;
    const epoch=officialItemNativePublicationMs(published);
    if(!Number.isFinite(epoch)||epoch>now.getTime()||
      now.getTime()-epoch>24*60*60*1000)continue;
    const title=tag(item,"title");
    if(title.length<16||title.length>500)continue;
    const original=originalLink(isAtom?atomLink(item):tag(item,"link"),source);
    if(!original||seen.has(original))continue;
    seen.add(original);
    const host=new URL(original).hostname;
    const article={
      title,description:"",url:original,publishedAt:new Date(epoch).toISOString(),
      source:host,sourceDomain:host,discoveryProvider:"official_native_rss",
      nativePublishedAtVerified:true,
      nativeTimeEvidence:isAtom?"publisher_atom_entry_published":
        "publisher_rss_item_pubDate",
      privateOnly:true,rightsVerified:false,commercialEligible:false,
    };
    // Both SHA and exact source-native clock must agree with the previous
    // independently written and read-back D1 pulse. Never use only one.
    if(!privateOriginalMatchesPulse(article,refs,now.getTime(),expectedClocks))
      continue;
    matched.push(article);
    if(matched.length===LIMIT_PER_DOMAIN)break;
  }
  return matched;
}

async function boundedXml(response) {
  if(!response?.ok||!MIME.test(response.headers.get("content-type")??"")||
    Number(response.headers.get("content-length")||0)>MAX_BYTES||
    !response.body)return null;
  let size=0;const chunks=[];const reader=response.body.getReader();
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BYTES)return null;
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock()}
  if(size===0)return null;
  try{return new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))}
  catch{return null}
}
export async function fetchPulseRotatedPrivateOriginals({
  category,checkedAt,refs,expectedClocks,now=new Date(),fetchImpl=fetch,
}={}){
  if(!(refs instanceof Set)||!(expectedClocks instanceof Map)||
    !(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("PRIVATE_PULSE_EXTRA_SOURCE_CONTEXT_INVALID");
  if(refs.size===0)return [];
  const sources=selectedPulseRotatedScorerSources(category,checkedAt);
  // Two at most; no search discovery and no fanout over 195 countries.
  const results=await Promise.all(sources.map(async source=>{
    try{
      // Single 6s try per immutable publisher: no retry on 403/429, no
      // alternate proxy, no follow-redirect behavior, and no extra network
      // on a quiet D1 pulse. This is stricter than legacy RSS retry logic.
      const response=await fetchImpl(source.url,{
        method:"GET",redirect:"error",cache:"no-store",
        headers:{
          accept:source.media==="atom"
            ?"application/atom+xml, application/xml;q=0.9, text/xml;q=0.8"
            :"application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        },
        signal:AbortSignal.timeout(6000),
      });
      const xml=await boundedXml(response);
      return xml?parsePulseRotatedOriginals(xml,source,{refs,expectedClocks,now}):[];
    }catch{return []}
  }));
  const ids=new Set();
  return results.flat().filter(article=>{
    if(ids.has(article.url))return false;
    ids.add(article.url);return true;
  }).slice(0,LIMIT_PER_DOMAIN);
}
