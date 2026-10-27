/**
 * User-supplied country/global source registry: production PRIVATE OSINT only.
 * UNVERIFIED_NEW_PUBLIC_ENDPOINT is a permission to attempt a bounded,
 * unauthenticated read, NOT evidence of an RSS feed, an event, or reuse rights.
 * Native RSS/Atom candidate facts may enter only the existing protected D1 lane.
 * APIs, data portals and bulk landing pages receive transport checks only.
 * Held/paid/auth-required/existing-provider rows are never fetched here.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {collectPrivateOsint15m} from "./private-osint-15m-collector.mjs";
const domains={geopolitics:"geopolitics",macro:"macro",rare_earth:"rare_earth"};
const accepted=new Set(["rss","api","bulk"]);
const ref=(s,c)=>createHash("sha256").update([s.id,s.url,c].join("\n")).digest("hex");
const sourceFile=new URL("../../config/operator-country-source-crosswalk.v1.json",import.meta.url);

export function privateUnverifiedOsintRegistry(raw=JSON.parse(readFileSync(sourceFile,"utf8")),{includeGapLane=false}={}){
 if(typeof includeGapLane!=="boolean")throw Error("UNVERIFIED_OSINT_LOCAL_GAP_OPTION_INVALID");
 if(raw?.schema!=="geomacro.operator-country-source-crosswalk.v1"||
    !Array.isArray(raw.national_primary)||!Array.isArray(raw.global_country_dim))
   throw Error("UNVERIFIED_OSINT_REGISTRY_INVALID");
 const items=[],urls=new Set(),ids=new Set();
 for(const row of [...raw.national_primary,...raw.global_country_dim]){
  if(row.source_activation_state!=="UNVERIFIED_NEW_PUBLIC_ENDPOINT")continue;
  let u;try{u=new URL(row.endpoint)}catch{throw Error("UNVERIFIED_OSINT_URL_INVALID")}
  const safe=u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&
    !/(?:^|\.)localhost$/iu.test(u.hostname)&&!/^(\d{1,3}\.){3}\d{1,3}$/u.test(u.hostname)&&
    u.hostname.includes(".")&&!u.searchParams.has("token")&&!u.searchParams.has("key")&&
    !u.searchParams.has("apikey")&&!u.searchParams.has("access_token");
  const category=domains[row.category];
  if(!safe||!category||!accepted.has(row.access)||typeof row.id!=="string"||
     !/^[a-z][a-z0-9_]{1,80}$/u.test(row.id)||
     ids.has(row.id)||urls.has(u.href)||
     row.provider_rights_verified!==false||
     row.commercial_eligible!==false||
     row.access_verified_in_production!==false)
    throw Error("UNVERIFIED_OSINT_SOURCE_SCOPE_UNSAFE");
  ids.add(row.id);urls.add(u.href);
  // Publisher's country is a routing hint, never an assertion about
  // the country of an event. The title-only 195-country resolver is separate.
  const country=Array.isArray(row.country_iso3)?row.country_iso3:[];
  if(country.some(x=>!/^[A-Z]{3}$/u.test(x)))throw Error("UNVERIFIED_OSINT_COUNTRY_INVALID");
  items.push(Object.freeze({
   id:"private_unverified_"+row.id,url:u.href,categories:[category],
   access:row.access,type:row.access==="rss"?"rss":"json",
   supported:row.access==="rss",
   publisher_countries:country,activation_state:"PRIVATE_UNVERIFIED_OBSERVATION",
   rights_verified:false,commercial_eligible:false,publicly_deliverable:false,
  }));
 }

 // Source-gap lane stays isolated from the already 511-endpoint private OSINT
 // scanner. RSS candidates are accepted only after actual live HTTP/parse and
 // publisher-native publication timestamps; never treat a lookup URL as news.
 if(includeGapLane){
 const gaps=JSON.parse(readFileSync(new URL(
  "../../config/private-osint-local-gaplane.v1.json",import.meta.url),"utf8"));
 if(gaps?.schema!=="geomacro.private-osint-local-gaplane.v1"||
    gaps.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
    !Array.isArray(gaps.sources)||gaps.sources.length>100)
  throw Error("UNVERIFIED_OSINT_LOCAL_GAP_MANIFEST_INVALID");
 for(const source of gaps.sources){
  let url,reference;
  try{url=new URL(source.url);reference=new URL(source.discovery_reference_url)}
  catch{throw Error("UNVERIFIED_OSINT_LOCAL_GAP_URL_INVALID")}
  if(!/^private_gaplane_[a-z0-9_]+$/u.test(source.id)||
     ids.has(source.id)||urls.has(url.href)||url.href!==source.url||
     url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !url.hostname.includes(".")||
     reference.protocol!=="https:"||reference.username||reference.password||
     reference.port||reference.hash||!reference.hostname.includes(".")||
     !/^[A-Z]{3}$/u.test(source.publisher_country_iso3??"")||
     source.activation_state!=="RUNTIME_PROBE_REQUIRED"||
     source.publisher_native_dates_required!==true||
     source.transport_verified_at_registration!==false||
     source.commercial_eligible!==false||source.publicly_deliverable!==false||
     !Array.isArray(source.categories)||source.categories.length!==3||
     new Set(source.categories).size!==3||
     source.categories.some(c=>!Object.hasOwn(domains,c))||
     !["rss","atom"].includes(source.type))
   throw Error("UNVERIFIED_OSINT_LOCAL_GAP_CANDIDATE_UNSAFE:"+source?.id);
  ids.add(source.id);urls.add(url.href);
  items.push(Object.freeze({
   ...source,access:"rss",supported:true,
   publisher_countries:[source.publisher_country_iso3],
   activation_state:"PRIVATE_UNVERIFIED_OBSERVATION",
   rights_verified:false,commercial_eligible:false,publicly_deliverable:false,
  }));
 }
 }
 // Nauru GIO publishes a fortnightly bulletin; KCNA is DPRK's native media.
 // Neither public website was proven to offer publisher-native RSS. ONLY
 // perform bounded unauthenticated transport status checks; HTTP 200 != news.
 if(includeGapLane){
  const doc=JSON.parse(readFileSync(new URL(
   "../../config/private-osint-official-nonrss-sources.v1.json",import.meta.url),"utf8"));
  if(doc?.schema!=="geomacro.private-osint-official-nonrss-sources.v1"||
     doc.scope!=="PROTECTED_INTERNAL_OSINT_ONLY"||
     !Array.isArray(doc.sources)||doc.sources.length!==2)
   throw Error("UNVERIFIED_OSINT_NONRSS_MANIFEST_INVALID");
  const seen=new Set();
  for(const source of doc.sources){
   let url;try{url=new URL(source.url)}catch{throw Error("UNVERIFIED_OSINT_NONRSS_URL_INVALID")}
   const allowed=(source.publisher_country_iso3==="NRU"&&
    url.href==="https://www.nauru.gov.nr/government-information-office/naoero-bulletin.aspx")||
    (source.publisher_country_iso3==="PRK"&&url.href==="https://www.kcna.kp/en");
   if(!allowed||seen.has(source.publisher_country_iso3)||
      !/^private_official_nonrss_[a-z0-9_]+$/u.test(source.id)||
      ids.has(source.id)||urls.has(url.href)||
      url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
      !Array.isArray(source.categories)||source.categories.length!==3||
      new Set(source.categories).size!==3||
      source.categories.some(c=>!Object.hasOwn(domains,c))||
      source.access!=="bulk"||source.type!=="html"||
      source.source_clock_status!=="NOT_FEED_NATIVE"||
      source.native_news_emission_enabled!==false||
      source.transport_verified_at_registration!==false||
      source.commercial_eligible!==false||source.publicly_deliverable!==false)
    throw Error("UNVERIFIED_OSINT_NONRSS_SOURCE_UNSAFE");
   seen.add(source.publisher_country_iso3);
   urls.add(url.href);ids.add(source.id);
   items.push(Object.freeze({...source,supported:false,
    publisher_countries:[source.publisher_country_iso3],
    activation_state:"PRIVATE_UNVERIFIED_OBSERVATION",
    rights_verified:false,commercial_eligible:false,publicly_deliverable:false}));
  }
  if(seen.size!==2)throw Error("UNVERIFIED_OSINT_NONRSS_COUNTRIES_INCOMPLETE");
 }
 if(!items.length||items.length>128)throw Error("UNVERIFIED_OSINT_CANDIDATES_MISSING");
 return Object.freeze(items);
}
async function unauthenticatedTransportCheck(s,fetchImpl,now){
 try{
  const response=await fetchImpl(s.url,{
   method:"GET",redirect:"manual",credentials:"omit",
   headers:{Accept:"application/json,text/html;q=0.5,*/*;q=0.1"},
   signal:AbortSignal.timeout(7000),
  });
  const status=response.status;
  try{await response.body?.cancel()}catch{}
  if([401,403,429].includes(status))return "DENIED";
  if(status===200)return "UNSUPPORTED_FORMAT"; // 200 != a dated news feed
  if(status>=300&&status<400)return "UNAVAILABLE"; // never follow redirects
  return "UNAVAILABLE";
 }catch{return "UNAVAILABLE"}
}
export async function collectPrivateUnverifiedOsint({
 now=new Date(),fetchImpl=fetch,normalize,resolveCountry,
 registry=privateUnverifiedOsintRegistry(undefined,{includeGapLane:true}),
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    typeof fetchImpl!=="function"||typeof normalize!=="function"||
    typeof resolveCountry!=="function"||!Array.isArray(registry)||
    !registry.length||registry.length>128||
    registry.some(s=>s.activation_state!=="PRIVATE_UNVERIFIED_OBSERVATION"))
  throw Error("UNVERIFIED_OSINT_COLLECTOR_CONFIG_INVALID");
 const feeds=registry.filter(s=>s.access==="rss");
 const other=registry.filter(s=>s.access!=="rss");
 const feedResult=feeds.length?await collectPrivateOsint15m({
   now,fetchImpl,registry:feeds,normalize,resolveCountry,concurrency:4,
 }):{items:[],checks:[]};
 // Bounded parallelism with at most one simultaneous request per hostname;
 // no credential, no redirect, no raw API/web content or URL in output.
 const pending=[...other],active=new Set(),hosts=new Set(),status=[];
 while(pending.length||active.size){
  while(active.size<4){
   const i=pending.findIndex(s=>!hosts.has(new URL(s.url).hostname));
   if(i<0)break;
   const s=pending.splice(i,1)[0],host=new URL(s.url).hostname;
   hosts.add(host);
   let task;
   task=unauthenticatedTransportCheck(s,fetchImpl,now)
    .then(state=>status.push(...s.categories.map(category=>({
      source_ref:ref(s,category),category,state,checked_at:now.toISOString(),
    })))).finally(()=>{hosts.delete(host);active.delete(task)});
   active.add(task);
  }
  if(active.size)await Promise.race(active);
 }
 const checks=[...feedResult.checks,...status];
 if(checks.length!==registry.reduce((n,s)=>n+s.categories.length,0))
  throw Error("UNVERIFIED_OSINT_CHECKS_INCOMPLETE");
 const unique=new Set(checks.map(x=>x.source_ref+":"+x.category));
 if(unique.size!==checks.length)throw Error("UNVERIFIED_OSINT_CHECK_DUPLICATE");
 const states=checks.reduce((a,c)=>(a[c.state]=(a[c.state]??0)+1,a),{});
 return {
  schema:"geomacro.private-osint-15m-batch.v1",
  items:feedResult.items,
  checks,
  summary:{
   schema:"geomacro.private-unverified-source-intake.v1",
   candidate_source_count:registry.length,
   native_feed_candidates:feeds.length,
   api_or_bulk_transport_only:other.length,
   source_checks:checks.length,source_states:states,
   private_d1_persistence_pending:true,
   licensed_for_commercial_use:false,
   original_page_independently_verified:false,
   source_verified_active:false,
   public_published:false,raw_source_stored:false,
   global_15_minute_completeness_guaranteed:false,
  },
 };
}
