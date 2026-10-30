/** P0-B: free, bounded global discovery + independently resolved first-party
 * publisher metadata. GOV.UK content API is an ORIGINAL-source verification
 * lane; GDELT is DISCOVERY ONLY. Never use GDELT's index clock as publication
 * time, distribute upstream article text, or invent full worldwide coverage.
 */
import {phase2hCountry,phase2hHeadlineCountryCandidate} from
 "./phase2h-country-originals-195.mjs";
import {p0bProjectEvidenceBounded} from "./p0b-event-grounded-projection.mjs";
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const SKIP=new Set(["what","why","when","which","does","did","will","latest",
 "update","news","happened","matter","matters","important","market","markets",
 "could","would","and","from","with","this","that","about","the","for",
 "are","was","were","have","impact","today","country","please","explain"]);
const limitText=(s,n)=>typeof s==="string"&&s.length<=n&&!/[<>]|\b(?:system prompt|ignore previous instructions)\b/iu.test(s);
const dateNative=(value,now)=>{
 if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(value))return null;
 const ms=Date.parse(value);
 return Number.isFinite(ms)&&ms<=now+60_000&&now-ms<=72*3600_000?
  new Date(ms).toISOString():null;
};
const SAFE_PROVIDER_FAILURES=new Set(["NETWORK_TIMEOUT_OR_EGRESS","HTTP_401",
 "HTTP_403","HTTP_404","HTTP_429","HTTP_500","HTTP_502","HTTP_503",
 "HTTP_OTHER","REDIRECT_DENIED","NOT_JSON","OVERSIZE","INVALID_JSON"]);
const providerFail=x=>{throw Error("P0B_UPSTREAM_"+x)};
const providerCode=error=>{
 const code=String(error?.message??"").replace(/^P0B_UPSTREAM_/u,"");
 return SAFE_PROVIDER_FAILURES.has(code)?code:"NETWORK_TIMEOUT_OR_EGRESS";
};
const getJson=async(url,fetchImpl)=>{
 let res;
 try{res=await fetchImpl(url,{method:"GET",redirect:"error",
  headers:{"Accept":"application/json"},signal:AbortSignal.timeout(5500)})}
 catch{providerFail("NETWORK_TIMEOUT_OR_EGRESS")}
 if(res.redirected)providerFail("REDIRECT_DENIED");
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
 fetchImpl=fetch,now=Date.now()}={}){
 const country=phase2hCountry(countryIso3);
 if(!country||!CATEGORIES.has(category)||!limitText(question,180)||
   question.length<3||!Number.isFinite(now))
  throw Error("P0B_QUERY_INVALID");
 const topical=terms(question,country.name);
 if(topical.length===0)return Object.freeze({
  status:"NO_TOPICAL_SEARCH_TERMS",attempted:false,
  first_party_matches:[],gdelt_discovery_count:0,provider_errors:0,
  exhaustive_global_search:false});
 const govQ=country.name+" "+topical.slice(0,3).join(" ");
 const govUrl=new URL("https://www.gov.uk/api/search.json");
 for(const [k,v] of Object.entries({q:govQ,count:"8",
  order:"-public_timestamp",filter_format:"news_article"}))govUrl.searchParams.set(k,v);
 const gdeltQ=country.name+" "+topical.slice(0,3).join(" ");
 const gdeltUrl=new URL("https://api.gdeltproject.org/api/v2/doc/doc");
 for(const [k,v] of Object.entries({query:gdeltQ,mode:"artlist",
  format:"json",maxrecords:"10",sort:"datedesc",timespan:"72h"}))
  gdeltUrl.searchParams.set(k,v);
 const settled=await Promise.allSettled([
  getJson(govUrl.href,fetchImpl),getJson(gdeltUrl.href,fetchImpl)
 ]);
 let providerErrors=settled.filter(x=>x.status==="rejected").length;
 const providerDiagnostics={
  govuk: settled[0].status==="fulfilled"?"OK":providerCode(settled[0].reason),
  gdelt: settled[1].status==="fulfilled"?"OK":providerCode(settled[1].reason),
 };
 let discovery=0;
 if(settled[1].status==="fulfilled"){
  const rows=settled[1].value?.articles;
  // Index titles, GDELT search hits and seen timestamps are NOT original
  // publisher verification. Count only; do not deliver or persist raw items.
  discovery=Array.isArray(rows)?Math.min(10,rows.filter(x=>
   typeof x?.url==="string"&&x.url.startsWith("https://")&&
   typeof x?.title==="string").length):0;
 }
 const official=[];
 if(settled[0].status==="fulfilled"){
  const hits=settled[0].value?.results;
  if(!Array.isArray(hits))providerErrors++;
  else for(const hit of hits.slice(0,8)){
   if(official.length>=2)break;
   try{
    const x=await officialItem(hit,category,countryIso3,fetchImpl,now);
    if(x&&!official.some(y=>y.record_id===x.record_id))official.push(x);
   }catch{providerErrors++}
  }
 }
 return Object.freeze({status:official.length?"FIRST_PARTY_METADATA_GROUNDED":
   discovery?"DISCOVERY_ONLY_UNVERIFIED":"NO_VERIFIED_NEWS",
  attempted:true,first_party_matches:official,gdelt_discovery_count:discovery,
  provider_errors:providerErrors,provider_diagnostics:providerDiagnostics,
  exhaustive_global_search:false});
}
