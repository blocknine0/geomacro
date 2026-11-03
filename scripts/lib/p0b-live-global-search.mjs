/** P0-B: free, bounded global discovery + independently resolved first-party
 * publisher metadata. GOV.UK content API is an ORIGINAL-source verification
 * lane; GDELT is DISCOVERY ONLY. Never use GDELT's index clock as publication
 * time, distribute upstream article text, or invent full worldwide coverage.
 */
import {phase2hCountry,phase2hHeadlineCountryCandidate} from
 "./phase2h-country-originals-195.mjs";
import {p0bProjectEvidenceBounded} from "./p0b-event-grounded-projection.mjs";
import {p0bFirstPartyFeedNews} from "./p0b-first-party-rss.mjs";
import {p0bReliefWebCountry} from "./p0b-reliefweb-ukraine.mjs";
import {officialItemNativePublicationMs} from "./official-native-item-publication-date.mjs";
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const SKIP=new Set(["what","why","when","which","does","did","will","latest",
 "update","news","happened","matter","matters","important","market","markets",
 "could","would","and","from","with","this","that","about","the","for",
 "are","was","were","have","impact","today","country","please","explain",
 "macro","geopolitics","geopolitical","category","breaking"]);
const limitText=(s,n)=>typeof s==="string"&&s.length<=n&&!/[<>]|\b(?:system prompt|ignore previous instructions)\b/iu.test(s);
const dateNative=(value,now)=>{
 // First-publication metadata may carry an explicit timezone offset. Use
 // the existing strict issuer-native clock parser instead of Date.parse.
 // Updated clocks, date-only data and timezone-free strings never qualify.
 const ms=officialItemNativePublicationMs(value);
 return Number.isFinite(ms)&&ms<=now+60_000&&now-ms<=72*3600_000?
  new Date(ms).toISOString():null;
};
const SAFE_PROVIDER_FAILURES=new Set(["NETWORK_TIMEOUT_OR_EGRESS","HTTP_401",
 "HTTP_403","HTTP_404","HTTP_429","HTTP_500","HTTP_502","HTTP_503",
 "HTTP_OTHER","REDIRECT_DENIED","NOT_JSON","OVERSIZE","INVALID_JSON",
 "UPSTREAM_TIMEOUT","NETWORK_FETCH_FAILED"]);
const providerFail=x=>{throw Error("P0B_UPSTREAM_"+x)};
const providerCode=error=>{
 const code=String(error?.message??"").replace(/^P0B_UPSTREAM_/u,"");
 return SAFE_PROVIDER_FAILURES.has(code)?code:"NETWORK_TIMEOUT_OR_EGRESS";
};
const getJson=async(url,fetchImpl,timeoutMs=9000)=>{
 let res;
 try{res=await fetchImpl(url,{method:"GET",redirect:"manual",
  headers:{"Accept":"application/json"},signal:AbortSignal.timeout(timeoutMs)})}
 catch(error){providerFail(error?.name==="TimeoutError"||error?.name==="AbortError"?
  "UPSTREAM_TIMEOUT":"NETWORK_FETCH_FAILED")}
 // Cloudflare Workers does not implement Request.redirect="error": it throws
 // before network I/O. Manual mode plus explicit 3xx rejection is equivalent
 // fail-closed behavior and works in both workerd and Node.
 if(res.redirected||res.status>=300&&res.status<400)providerFail("REDIRECT_DENIED");
 if(res.status!==200){
  providerFail([401,403,404,429,500,502,503].includes(res.status)?
   "HTTP_"+res.status:"HTTP_OTHER");
 }
 if(!/json/iu.test(res.headers?.get("content-type")??""))
  providerFail("NOT_JSON");
 let raw;
 try{raw=await res.text()}catch{providerFail("NETWORK_TIMEOUT_OR_EGRESS")}
 if(raw.length>240000)providerFail("OVERSIZE");
 try{return JSON.parse(raw)}catch{providerFail("INVALID_JSON")}
};
/**
 * Worker-safe static GDELT manifest probe. Actual MD5-checked Event/GKG ZIP
 * ingestion is handled by the existing governed 15-minute archive workflow.
 * A manifest is DISCOVERY INFRASTRUCTURE, never an article verification.
 */
const GDELT_LASTUPDATE="https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
const staticManifest=async(fetchImpl,timeoutMs=5500,now=Date.now())=>{
 let response;
 try{
  response=await fetchImpl(GDELT_LASTUPDATE,{
   method:"GET",redirect:"manual",headers:{Accept:"text/plain"},
   signal:AbortSignal.timeout(timeoutMs)
  });
 }catch(error){providerFail(error?.name==="TimeoutError"||error?.name==="AbortError"?
  "UPSTREAM_TIMEOUT":"NETWORK_FETCH_FAILED")}
 if(response.redirected||response.status>=300&&response.status<400)
  providerFail("REDIRECT_DENIED");
 if(response.status!==200)providerFail([401,403,404,429,500,502,503].includes(response.status)?
  "HTTP_"+response.status:"HTTP_OTHER");
 const raw=await response.text();
 if(raw.length>4096)providerFail("OVERSIZE");
 const lines=raw.trim().split(/\r?\n/u).filter(Boolean);
 if(lines.length!==3)providerFail("INVALID_JSON");
 const kinds=new Set();
 for(const line of lines){
  const m=/^(\d+)\s+([a-f0-9]{32})\s+https?:\/\/data\.gdeltproject\.org\/gdeltv2\/(\d{14})\.(export\.CSV|mentions\.CSV|gkg\.csv)\.zip$/iu.exec(line);
  if(!m||Number(m[1])<=0)providerFail("INVALID_JSON");
  const date=m[3],ms=Date.parse(date.slice(0,4)+"-"+date.slice(4,6)+"-"+
   date.slice(6,8)+"T"+date.slice(8,10)+":"+date.slice(10,12)+":"+
   date.slice(12,14)+"Z");
  if(!Number.isFinite(ms)||ms>now+300000||now-ms>3*3600000)
   providerFail("INVALID_JSON");
  if(kinds.has(m[4]))providerFail("INVALID_JSON");
  kinds.add(m[4]);
 }
 if(kinds.size!==3)providerFail("INVALID_JSON");
 return Object.freeze({manifest_verified:true,archives:kinds.size});
};
export const getGdeltStaticManifestWithRecovery=async(fetchImpl,now=Date.now())=>{
 try{return await staticManifest(fetchImpl,5500,now)}
 catch(error){
  const transient=new Set(["UPSTREAM_TIMEOUT","NETWORK_FETCH_FAILED","HTTP_502","HTTP_503"]);
  if(!transient.has(providerCode(error)))throw error;
  return staticManifest(fetchImpl,3500,now);
 }
};
const terms=(question,countryName)=>{
 const countryWords=new Set(countryName.toLowerCase().split(/\s+/u));
 return [...new Set((question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[])
  .filter(x=>!SKIP.has(x)&&!countryWords.has(x)&&x.length<=28))].slice(0,5);
};
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",
 new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,"0")).join("");
function eventChannels(category){
 return category==="macro"?["rates_and_bonds","fx_and_payments"]:
 category==="geopolitics"?["trade_and_logistics"]:["mineral_supply_chain"];
}
async function officialItem(hit,category,countryIso3,fetchImpl,now){
 const path=hit?.link;
 if(typeof path!=="string"||!/^\/government\/(?:news|speeches|statements|world-location-news)\/[a-z0-9-]+$/u.test(path))
  return null;
 // Content API is a publisher endpoint; never fetch a user or GDELT-supplied URL.
 const page=await getJson("https://www.gov.uk/api/content"+path,fetchImpl);
 const title=page?.title;
 const native=dateNative(page?.first_published_at??page?.details?.first_public_at,now);
 if(!native||!limitText(title,260)||title.length<18||
    phase2hHeadlineCountryCandidate(title)!==countryIso3)return null;
 const id=await digest(category+"\nhttps://www.gov.uk"+path+"\n"+native);
 const original={original_title:title,original_published_at:native,
   original_content:null,original_url:"https://www.gov.uk"+path};
 const base={schema:"geomacro.phase2h.private-five-part.v1",
   what_happened:{text:null,original_observation_id:id},
   why_it_matters:{text:null,independently_verified:false},
   market_relevance:{potential_watch_channels:eventChannels(category),
     observed_market_reaction_verified:false,confirmed_instruments:[],
     price_direction:null,price_change:null},
   what_to_watch:{event_topic:null,
     trigger:"NEXT_ORIGINAL_RELEASE_OR_INDEPENDENT_CONFIRMATION",
     confirmed_followup_at:null},
   evidence_and_confidence:{
     original_observation_id:id,source_published_at:native,date_precision:"exact",
     observed_feed_title_available:true,original_article_page_verified:false,
     independent_event_verified:false,commercial_rights_verified:false,
     paid_eligible:false,source_content_identity_sha256:await digest(title+"\n"+native)}};
 const projection=p0bProjectEvidenceBounded({record_id:id,category,original,
   analysis:base});
 if(!projection)return null;
 return Object.freeze({record_id:id,category,
   original_published_at:native,five_part:projection,
   original_page_independently_verified:false,
   first_party_content_api_metadata_verified:true,
   archive_d1_ack_present:false,p0a_evidence_limited:false,
   paid_eligible:false,commercial_rights_verified:false,
   source_title_only_research_fallback_used:false});
}
export async function p0bGlobalNewsFallback({question,countryIso3,category,
 fetchImpl=fetch,now=Date.now(),reliefwebAppname=null}={}){
 const country=phase2hCountry(countryIso3);
 if(!country||!CATEGORIES.has(category)||!limitText(question,180)||
   question.length<3||!Number.isFinite(now))
  throw Error("P0B_QUERY_INVALID");
 const topical=terms(question,country.name);
 // A generic latest-news question still merits a country + category search.
 // No invented topic is inserted as a substitute for user intent.
 const govQ=country.name+" "+topical.slice(0,3).join(" ");
 const govUrl=new URL("https://www.gov.uk/api/search.json");
 for(const [k,v] of Object.entries({q:govQ,count:"8",
  order:"-public_timestamp",filter_format:"news_article"}))govUrl.searchParams.set(k,v);
 const settled=await Promise.allSettled([
  getJson(govUrl.href,fetchImpl),getGdeltStaticManifestWithRecovery(fetchImpl,now),
  p0bFirstPartyFeedNews({category,countryIso3,countryName:country.name,
   question,fetchImpl,now}),
  category==="geopolitics"?
   p0bReliefWebCountry({appname:reliefwebAppname,countryIso3,fetchImpl,now}):
   Promise.resolve({status:"NOT_APPLICABLE",items:[],attempted:false})
 ]);
 let providerErrors=settled.filter(x=>x.status==="rejected").length;
 const providerDiagnostics={
  govuk: settled[0].status==="fulfilled"?"OK":providerCode(settled[0].reason),
  gdelt: settled[1].status==="fulfilled"?"OK":providerCode(settled[1].reason),
  rss: settled[2].status==="fulfilled"?settled[2].value.status:"FEED_UNAVAILABLE",
  reliefweb: settled[3].status==="fulfilled"?settled[3].value.status:"RELIEFWEB_UNAVAILABLE",
 };
 // Static 15m archive availability is not a verified article count.
 const discovery=0;
 const official=settled[2].status==="fulfilled"?[...settled[2].value.items]:[];
 if(settled[3].status==="fulfilled")for(const row of settled[3].value.items){
  if(official.length>=2)break;
  if(!official.some(item=>item.record_id===row.record_id))official.push(row);
 }
 if(settled[0].status==="fulfilled"){
  const hits=settled[0].value?.results;
  if(!Array.isArray(hits))providerErrors++;
  else{
   // A serial chain of 8 publisher HTTP calls exceeded the live query's
   // 20s independent acceptance window. Parallel proofs are bounded,
   // preserve each native publication clock and do not widen access policy.
   const verified=await Promise.allSettled(hits.slice(0,3).map(hit=>
    officialItem(hit,category,countryIso3,fetchImpl,now)));
   for(const result of verified){
    if(result.status==="rejected"){providerErrors++;continue;}
    const x=result.value;
    if(x&&!official.some(y=>y.record_id===x.record_id)&&official.length<2)
     official.push(x);
   }
  }
 }
 return Object.freeze({status:official.length?"FIRST_PARTY_METADATA_GROUNDED":
   discovery?"DISCOVERY_ONLY_UNVERIFIED":
   providerDiagnostics.govuk!=="OK"&&providerDiagnostics.gdelt!=="OK"?
    "GLOBAL_PROVIDER_UNAVAILABLE":"NO_VERIFIED_NEWS",
  attempted:true,first_party_matches:official,gdelt_discovery_count:discovery,
  provider_errors:providerErrors,provider_diagnostics:providerDiagnostics,
  first_party_rss_verified_count:official.filter(x=>x.first_party_feed_metadata_verified===true).length,
  exhaustive_global_search:false});
}
