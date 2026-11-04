/**
 * Queue-free, original-page-verified, NON-COMMERCIAL research risk state bridge.
 * 20m runner uses registered official GOV.UK OGL Atom publishers only.
 * A first-party page proves the publication/clock, NOT incident truth,
 * independent corroboration, a verified market score or commercial rights.
 * No original title, page, URL, feed body or signing material is persisted.
 */
import {createHash} from "node:crypto";
import {normalizeNativeFeedXml} from "./native-feed-xml-normalizer.mjs";
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";
import {pinnedGovUkContentApiUrl,verifiedGovUkContentFirstPublishedAt}
 from "./govuk-original-content-clock.mjs";
import {privateOsintCountryMention} from "./private-osint-country-mentions.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";

const FEED_LIMIT=320*1024,PAGE_LIMIT=384*1024,API_LIMIT=128*1024;
const MAX_EVENT_AGE=6*3600_000;
const CATS=Object.freeze({
 GEOPOLITICS:"geopolitics",MACRO:"macro",CRITICAL_MINERALS:"critical_minerals"
});
const action=/\b(?:announc(?:es|ed|ing)?|impos(?:es|ed|ing)?|restrict(?:s|ed|ing)?|suspend(?:s|ed|ing)?|ban(?:s|ned|ning)?|launch(?:es|ed|ing)?|confirm(?:s|ed|ing)?|approv(?:es|ed|ing)?|cut(?:s|ting)?|rais(?:es|ed|ing)?|closes?|halt(?:s|ed|ing)?|defaults?|restructur(?:es|ed|ing)?)\b/iu;
const speculative=/\b(?:might|could|may|alleged|unverified|rumou?r|denies|fact.check|proposal to consider)\b/iu;
const RULES=Object.freeze({
 geopolitics:[
  [/\b(?:sanctions?|embargo|asset freeze|export controls?|arms ban)\b/iu,82],
  [/\b(?:military strikes?|airstrikes?|armed conflict|invasion|ceasefire violations?|missile strikes?)\b/iu,85],
  [/\b(?:border closures?|diplomatic expulsions?|trade restrictions?)\b/iu,68],
 ],
 macro:[
  [/\b(?:sovereign default|debt default|debt restructuring)\b/iu,83],
  [/\b(?:central bank|interest rate|policy rate|monetary policy|currency devaluation)\b/iu,58],
  [/\b(?:capital controls?|currency restrictions?|banking crisis)\b/iu,75],
 ],
 critical_minerals:[
  [/\b(?:rare earth|critical minerals?|lithium|cobalt|nickel|copper|gallium|germanium|tungsten|graphite|antimony)\b.{0,75}\b(?:export ban|ban|restriction|halt|suspend|closure)\b/iu,80],
  [/\b(?:export ban|export restrictions?|mine closure|smelter shutdown)\b.{0,75}\b(?:rare earth|critical minerals?|lithium|cobalt|nickel|copper|gallium|germanium|tungsten|graphite|antimony)\b/iu,80],
  [/\b(?:critical minerals?|rare earth|lithium|cobalt|nickel|copper|gallium|germanium|graphite)\b/iu,55],
 ],
});
const h=s=>createHash("sha256").update(s,"utf8").digest("hex");
const deent=x=>String(x??"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1")
 .replace(/&(amp|lt|gt|quot|apos);/giu,(_,k)=>({
  amp:"&",lt:"<",gt:">",quot:'"',apos:"'"
 })[k.toLowerCase()]??"").replace(/\s+/gu," ").trim();
const field=(chunk,name)=>{
 const pattern=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","iu");
 return deent(pattern.exec(chunk)?.[1]??"");
};
function exactPinnedSource(s){
 try{
  const u=new URL(s?.feed_url);
  return u.protocol==="https:"&&u.hostname==="www.gov.uk"&&!u.search&&
    !u.username&&!u.password&&!u.port&&!u.hash&&
    /^\/government\/organisations\/[a-z0-9-]{5,110}\.atom$/u.test(u.pathname)&&
    s.private_research_only===true&&s.telegram_content_license===false&&
    s.rights==="UK_OPEN_GOVERNMENT_LICENCE_V3_EXCEPT_THIRD_PARTY"&&
    CATS[s.category]!==undefined;
 }catch{return false}
}
export function provisionalOfficialTitleSeverity(title,category){
 if(typeof title!=="string"||title.length<18||title.length>260||
    speculative.test(title)||!action.test(title))return null;
 for(const [pattern,severity] of RULES[category]??[])
  if(pattern.test(title))return severity;
 return null;
}
export function atomOriginalResearchCandidates(xml,source,now=new Date()){
 if(!exactPinnedSource(source)||!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error("RESEARCH_OFFICIAL_SOURCE_INVALID");
 const normalized=normalizeNativeFeedXml(xml,FEED_LIMIT);
 if(!normalized||!/<feed\b/iu.test(normalized.slice(0,300)))
  throw Error("RESEARCH_OFFICIAL_ATOM_INVALID");
 const category=CATS[source.category],seen=new Set(),out=[];
 for(const m of [...normalized.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/giu)].slice(0,40)){
  const entry=m[1],title=field(entry,"title"),published=field(entry,"published");
  const hasPublished=published.length>0;
  // GOV.UK organisation Atom can omit <published>. Entry <updated> may only
  // select a candidate for a fresh independent first-party Content API read,
  // and NEVER becomes the original publication timestamp or scoring clock.
  const hinted=officialItemNativePublicationMs(hasPublished?published:field(entry,"updated"));
  if(!Number.isFinite(hinted)||hinted>now.getTime()||
     now.getTime()-hinted>MAX_EVENT_AGE)continue;
  const link=entry.match(/<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/iu)?.[1]??
    entry.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']alternate["']/iu)?.[1]??
    entry.match(/<link\b[^>]*\bhref=["']([^"']+)["']/iu)?.[1];
  const articleUrl=typeof link==="string"?deent(link):"";
  if(!pinnedGovUkContentApiUrl(articleUrl)||seen.has(articleUrl))continue;
  const severity=provisionalOfficialTitleSeverity(title,category);
  const country=privateOsintCountryMention(title,COUNTRIES_195);
  if(severity===null||!country)continue; // never equate issuer country with event country
  seen.add(articleUrl);
  out.push({title,articleUrl,
   // An absent <published> is explicitly unknown until the HTML/API proof.
   publishedAt:hasPublished?new Date(hinted).toISOString():null,
   original_clock_requires_page_proof:true,
   country_code:country,category,severity});
 }
 return out;
}
async function boundedText(url,maxBytes,fetchImpl,contentType){
 // The URL is fully pinned by the registry or a strict www.gov.uk page resolver.
 const res=await fetchImpl(url,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:contentType,"User-Agent":"GeoMacro-Research-Original-20m/1.0"},
  signal:AbortSignal.timeout(9000)});
 if(!res||res.status!==200||res.redirected||
    Number(res.headers.get("content-length")||0)>maxBytes)
  throw Error("RESEARCH_OFFICIAL_HTTP_OR_SIZE_UNAVAILABLE");
 const body=await res.arrayBuffer();
 if(body.byteLength>maxBytes)throw Error("RESEARCH_OFFICIAL_BODY_LIMIT");
 return new TextDecoder("utf-8",{fatal:true}).decode(body);
}
/**
 * Genuine bounded official feed/page intake, independent of any D1 news queue.
 * Only the injected server-side state writer performs Supabase operations.
 * Returning counters is not success evidence for a fully live global 585-cell feed.
 */
export async function runOfficialResearch20m({sources,now=new Date(),
 fetchImpl=fetch,ingest,perCategory=2}={}){
 if(!Array.isArray(sources)||sources.length<1||sources.length>12||
    sources.some(s=>!exactPinnedSource(s))||
    new Set(sources.map(s=>s.feed_url)).size!==sources.length||
    !Object.keys(CATS).every(k=>sources.some(s=>s.category===k))||
    typeof ingest!=="function"||!Number.isInteger(perCategory)||
    perCategory<1||perCategory>3)
  throw Error("RESEARCH_OFFICIAL_PRODUCER_INVALID");
 let sourceHealthy=0,qualified=0,verifiedPages=0,signed=0,updated=0,failed=0;
 const accepted=new Set(),categoryCounters={geopolitics:0,macro:0,critical_minerals:0};
 // Denied or malformed official pages may not trigger unbounded retries.
 const pageAttempts={geopolitics:0,macro:0,critical_minerals:0};
 for(const source of sources){
  let candidates=[];
  try{
   const xml=await boundedText(source.feed_url,FEED_LIMIT,fetchImpl,
    "application/atom+xml,application/xml");
   candidates=atomOriginalResearchCandidates(xml,source,now);
   sourceHealthy++;
  }catch{failed++;continue}
  for(const c of candidates){
   if(categoryCounters[c.category]>=perCategory||
      pageAttempts[c.category]>=Math.min(2*perCategory,4))continue;
   const key=h(c.category+"\n"+c.articleUrl+"\n"+c.publishedAt);
   if(accepted.has(key))continue;
   accepted.add(key);
   pageAttempts[c.category]++;
   qualified++;
   // Only the first-party original article and its exact same-publisher API
   // can attest the native publication instant. No title-only GRO signing.
   const api=pinnedGovUkContentApiUrl(c.articleUrl);
   if(!api)continue;
   try{
    const html=await boundedText(c.articleUrl,PAGE_LIMIT,fetchImpl,"text/html");
    const json=await boundedText(api,API_LIMIT,fetchImpl,"application/json");
    const originalAt=verifiedGovUkContentFirstPublishedAt({
     articleUrl:c.articleUrl,html,contentJson:json,articleTitle:c.title,
     now,maxAgeMs:MAX_EVENT_AGE,
    });
    if(!originalAt||
       (c.publishedAt!==null&&
        Math.abs(Date.parse(originalAt)-Date.parse(c.publishedAt))>60_000))
     continue;
    verifiedPages++;
    categoryCounters[c.category]++;
    // Durable idempotency binds the independently verified ORIGINAL clock.
    // Never bind an Atom updated hint to the evidence identity or risk score.
    const proofIdentity=h(c.category+"\n"+c.articleUrl+"\n"+originalAt);
    const event={
     country_code:c.country_code,severity:c.severity,
     confidence:60,category:c.category,
     evidence_sha256:proofIdentity,original_published_at:originalAt,
     independent_originals:1,trusted_native_originals_verified:true,
     research_use_permitted:true,commercial_eligible:false
    };
    const receipt=await ingest(event);
    if(receipt?.execution_authorized!==false||receipt?.commercial_eligible!==false)
     throw Error("RESEARCH_RISK_STATE_BOUNDARY_FAIL");
    if(receipt?.state_changed===true)updated++;
    if(receipt?.signed===true)signed++;
   }catch{failed++} // keep other publishers running; no source/body/error leakage
  }
 }
 return Object.freeze({
  schema:"geomacro.research-official-stream20m.v1",
  source_count:sources.length,source_http_healthy:sourceHealthy,
  candidate_count:qualified,first_party_original_pages_verified:verifiedPages,
  state_updated:updated,signed_readback_verified:signed,
  failures:failed,category_verified_pages:categoryCounters,
  queue_writes:0,original_content_persisted:false,
  verified_event_truth:false,commercial_eligible:false,
  research_only:true,payments:0,execution_authorized:false,
  complete_195x3_coverage_verified:false,latency_under_10ms_verified:false
 });
}
