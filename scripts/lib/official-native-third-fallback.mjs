import { fetchOriginalPublisherWithRecovery } from "./official-native-network-retry.mjs";
import { fetchVerifiedPublisherPageDate, ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN } from "./official-original-article-date.mjs";

// Fixed, independently public-publisher-addressed discovery ONLY.
// These are original publishers' own official RSS URLs; neither publication
// time alone nor host admission grants source rights or story corroboration.
// The fallback is attempted ONLY if both existing publishers yield no
// timestamp+topic+host-qualified current item. No per-country fanout.
export const OFFICIAL_NATIVE_THIRD_FEEDS=Object.freeze({
  geopolitics:Object.freeze({
    url:"https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
    host:"www.gov.uk",format:"atom",
    source_id:"uk_fcdo_original_atom_pending_review",
    topics:/\b(?:war|military|conflict|ceasefire|sanctions?|security council|airstrike|border|invasion|attack|peace|displacement|refugees?|armed groups?|humanitarian crisis|nuclear|crisis|violence|peacekeeping|foreign secretary|foreign policy|diplomatic|statement)\b/iu,
  }),
  macro:Object.freeze({
    url:"https://www.ecb.europa.eu/rss/press.html",
    host:"www.ecb.europa.eu",
    source_id:"ecb_press_rss_pending_review",
    topics:/\b(?:inflation|interest rates?|monetary|euro area|central bank|economic growth|recession|sovereign|currency|foreign exchange|consumer prices?|price stability|euro|bond yields?|financial stability|rate cuts?|rate hikes?)\b/iu,
  }),
  rare_earth:Object.freeze({
    url:"https://www.usgs.gov/news/national-news-release/feed",
    host:"www.usgs.gov",
    source_id:"usgs_national_news_rss_pending_review",
    topics:/\b(?:critical minerals?|rare earths?|gallium|germanium|lithium|cobalt|nickel|graphite|neodymium|dysprosium|terbium|mineral (?:deposits?|reserve|production|trade|supply|resource)|mining|strategic minerals?|mineral commodities)\b/iu,
  }),
});
const MAX_BYTES=256*1024;
const MAX_ITEMS=80;
const DAY_MS=86_400_000;
const XML_TYPE=/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;
function exactUrl(value,host) {
  try {
    const u=new URL(value);
    return u.protocol==="https:" && !u.username && !u.password &&
      u.hostname.toLowerCase()===host && u.href.length<=2048 &&
      !u.hash ? u.href:null;
  } catch {return null;}
}
function unescape(value) {
  return String(value??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1")
    .replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([a-f0-9]+));/giu,
      (full,dec,hex)=>{
        const named={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&apos;":"'"};
        if(Object.hasOwn(named,full.toLowerCase()))return named[full.toLowerCase()];
        const cp=dec?Number(dec):Number.parseInt(hex,16);
        return Number.isInteger(cp) && cp>0 && cp<=0x10FFFF?
          String.fromCodePoint(cp):"";
      }).replace(/<[^>]*>/gu," ").replace(/\s+/gu," ").trim();
}
// Parse only fixed-origin Atom article links; feed/entry updated and publisher
// feed retrieval timestamps can NEVER substitute for original published.
function originalAtomHref(block,host) {
  const matches=[...block.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)];
  for(const [,attrs] of matches){
    const rel=attrs.match(/\brel\s*=\s*["']([^"']+)["']/iu)?.[1]??"alternate";
    const href=attrs.match(/\bhref\s*=\s*["']([^"']+)["']/iu)?.[1]??"";
    if(rel==="alternate"||rel==="canonical"){
      const validated=exactUrl(unescape(href),host);
      if(validated)return validated;
    }
  }
  return null;
}
function field(block,name) {
  const m=block.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","iu"));
  return m?unescape(m[1]):"";
}

export function parseOfficialThirdRss(xml,category,{
  now=new Date(),maxAgeMs=DAY_MS,diagnostics=null,
}={}) {
  const config=OFFICIAL_NATIVE_THIRD_FEEDS[category];
  if(!config || typeof xml!=="string" ||
     xml.length>MAX_BYTES ||
     (config.format==="atom"?!/<(?:atom:)?feed(?:\s|>)/iu.test(xml):!/<rss(?:\s|>)/iu.test(xml)) ||
     /<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error("OFFICIAL_THIRD_RSS_INVALID");
  const clock=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(clock)||!Number.isFinite(maxAgeMs)||
     maxAgeMs<60_000||maxAgeMs>DAY_MS) throw new Error("OFFICIAL_THIRD_CLOCK_INVALID");
  const entries=[...xml.matchAll(config.format==="atom"
    ? /<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu
    : /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,MAX_ITEMS);
  const seen=new Set();
  const accepted=[];
  const counts={
    third_items_seen:entries.length,
    third_native_pubdate_seen:0,
    third_atom_published_seen:0,
    third_original_current_count:0,
    third_exact_host_count:0,
    third_topic_match_count:0,
    third_private_eligible_count:0,
  };
  for(const [,block] of entries) {
    const title=field(block,"title");
    const hostUrl=config.format==="atom"
      ? originalAtomHref(block,config.host)
      : exactUrl(field(block,"link"),config.host);
    const publication=Date.parse(config.format==="atom"
      ? field(block,"published") : field(block,"pubDate"));
    const timeValid=Number.isFinite(publication);
    const current=timeValid && publication<=clock &&
      clock-publication<=maxAgeMs;
    if(timeValid)counts.third_native_pubdate_seen++;
    if(timeValid&&config.format==="atom")counts.third_atom_published_seen++;
    if(current)counts.third_original_current_count++;
    if(hostUrl)counts.third_exact_host_count++;
    if(config.topics.test(title))counts.third_topic_match_count++;
    if(!hostUrl||!current||title.length<16||title.length>500||
       !config.topics.test(title)||seen.has(hostUrl))continue;
    seen.add(hostUrl);
    counts.third_private_eligible_count++;
    accepted.push({
      title,description:"",url:hostUrl,
      publishedAt:new Date(publication).toISOString(),
      source:config.host,sourceDomain:config.host,
      discoveryProvider:"official_native_rss",
      nativePublishedAtVerified:true,
      nativeTimeEvidence:config.format==="atom"
        ?"publisher_atom_entry_published":"publisher_rss_item_pubDate",
      privateOnly:true,
      rightsVerified:false,commercialEligible:false,
    });
    if(accepted.length>=2)break; // cap classifier fanout before expensive work
  }
  if(diagnostics && typeof diagnostics==="object" && !Array.isArray(diagnostics))
    Object.assign(diagnostics,counts);
  return accepted.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}

export async function fetchOfficialThirdPublisherArticles(category,{
  now=new Date(),fetchImpl=fetch,maxAgeMs=DAY_MS,diagnostics=null,
}={}) {
  const cfg=OFFICIAL_NATIVE_THIRD_FEEDS[category];
  if(!cfg)throw new Error("OFFICIAL_THIRD_CATEGORY_INVALID");
  const response=await fetchOriginalPublisherWithRecovery(cfg.url,{
    fetchImpl,
    headers:{accept:cfg.format==="atom"
        ?"application/atom+xml, application/xml;q=0.9, text/xml;q=0.8"
        :"application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
      "user-agent":"Geomacro-Private-Original-Publisher-Discovery/1.0"},
  });
  if(!response.ok) {
    const status = response.status;
    const failure = status === 403 ? "OFFICIAL_THIRD_HTTP_FORBIDDEN" :
      status === 404 ? "OFFICIAL_THIRD_HTTP_NOT_FOUND" :
      status === 429 ? "OFFICIAL_THIRD_HTTP_RATE_LIMITED" :
      status >= 500 && status <= 599 ? "OFFICIAL_THIRD_HTTP_UPSTREAM_FAILURE" :
      "OFFICIAL_THIRD_HTTP_NOT_OK";
    // Stable reasons only: never include response bodies, article URLs,
    // upstream infrastructure messages, authentication or raw feed contents.
    throw new Error(failure);
  }
  if(!XML_TYPE.test(response.headers.get("content-type")??""))
    throw new Error("OFFICIAL_THIRD_CONTENT_TYPE_INVALID");
  if(Number(response.headers.get("content-length")||0)>MAX_BYTES||!response.body)
    throw new Error("OFFICIAL_THIRD_BODY_INVALID");
  const reader=response.body.getReader(),chunks=[];
  let size=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BYTES)throw new Error("OFFICIAL_THIRD_TOO_LARGE");
      chunks.push(Buffer.from(value));
    }
  } finally {reader.releaseLock();}
  const xml=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));
  const accepted=parseOfficialThirdRss(xml,category,{now,maxAgeMs,diagnostics});
  if(cfg.format!=="atom"||accepted.length)return accepted;
  // FCDO Atom sometimes has entry <updated> without original <published>.
  // Up to TWO exactly validated GOV.UK article URLs may be inspected for
  // authoritative datePublished. Never substitute feed updated or crawl time.
  let probes=0,admitted=0;
  const seen=new Set();
  for(const [,block] of [...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu)].slice(0,MAX_ITEMS)){
    if(/<(?:atom:)?published(?:\s[^>]*)?>/iu.test(block))continue;
    const title=field(block,"title");
    const url=originalAtomHref(block,cfg.host);
    if(!url||title.length<16||title.length>500||!cfg.topics.test(title)||seen.has(url))continue;
    seen.add(url);probes++;
    let published=null;
    try{
      published=await fetchVerifiedPublisherPageDate(url,"geopolitics",{now,fetchImpl});
    }catch{/* bounded verifier failure is not event evidence */}
    const at=Date.parse(published??"");
    if(Number.isFinite(at)&&at<=now.getTime()&&now.getTime()-at<=maxAgeMs){
      accepted.push({title,description:"",url,publishedAt:new Date(at).toISOString(),
        source:cfg.host,sourceDomain:cfg.host,
        discoveryProvider:"official_native_rss",
        nativePublishedAtVerified:true,
        nativeTimeEvidence:"publisher_original_article_datePublished",
        privateOnly:true,rightsVerified:false,commercialEligible:false});
      admitted++;
    }
    if(probes>=ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN)break;
  }
  if(diagnostics&&typeof diagnostics==="object"&&!Array.isArray(diagnostics)){
    diagnostics.third_original_page_date_checks=probes;
    diagnostics.third_original_page_date_admitted=admitted;
  }
  return accepted.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}
