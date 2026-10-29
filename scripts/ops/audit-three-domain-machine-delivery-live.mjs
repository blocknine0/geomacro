#!/usr/bin/env node
/**
 * Actual no-funds public-API contract test. Fixed GeoMacro origins only.
 * Exactly four successful GETs at most + one rejected query + one rejected
 * method; no credentials, checkout, D1 writes, B2, PREDGE or x402.
 */
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {projectThreeDomainStructuredDelivery} from "../../workers/control-plane/src/three-domain-structured-delivery.mjs";

export const STRUCTURED_API="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/three-domain-structured-output";
export const CONTINUITY_API="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/three-domain-continuity";
export const FACTUAL_API="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/reusable-source-news";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const DAY=86_400_000;
const UTC=/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const DATE=/^20\d{2}-\d{2}-\d{2}$/u;
const BLOCKED=new Set(["raw_article","raw_headline","original_url","source_url",
  "article_url","publisher_id","source_registry_id","signed_risk_object",
  "payment_signature","private_key"]);
const assertClock=(value,now,maxAge,context)=>{
 assert.equal(typeof value,"string",context+"_MISSING");
 assert.match(value,UTC,context+"_NOT_ORIGINAL_EXACT_CLOCK");
 const at=Date.parse(value);
 assert.ok(Number.isFinite(at)&&at<=now&&now-at<=maxAge&&
   new Date(at).toISOString().slice(0,19)===value.slice(0,19),
   context+"_FUTURE_STALE_OR_MALFORMED");
 return at;
};
const assertSafeRecord=(v,category,now,kind)=>{
 assert.ok(v&&typeof v==="object"&&!Array.isArray(v),"RECORD_INVALID");
 assert.equal(v.category,category,"CROSS_CATEGORY_RECORD");
 assert.equal(v.record_kind,kind,"RECORD_KIND_MISMATCH");
 assert.equal(v.country_iso3,null,"PUBLISHER_COUNTRY_NOT_COUNTRY_EVENT");
 assert.equal(v.commercially_qualified,false,"UNVERIFIED_COMMERCIAL_ESCALATION");
 assert.equal(v.corroboration_status,"NOT_INDEPENDENTLY_VERIFIED");
 assert.equal(v.severity,null);
 assert.equal(v.market_direction,null);
 for(const field of BLOCKED)assert.equal(Object.hasOwn(v,field),false,"RAW_OR_PROTECTED_FIELD_"+field);
 for(const field of ["what_changed","why_it_matters"]){
  assert.equal(typeof v[field],"string",field+"_NOT_TEXT");
  assert.ok(v[field].length>=25&&v[field].length<=1400,field+"_LENGTH");
  assert.equal(/https?:\/\/|www\.|[<>]/iu.test(v[field]),false,field+"_LEAKED_URL");
 }
 if(kind==="native_dated_source_release"){
  assert.ok(["exact","day"].includes(v.date_precision));
  assert.equal(v.observation_period,null);
  assert.equal(typeof v.topic,"string");
  if(v.date_precision==="exact"){
   assertClock(v.original_published_at,now,72*3600_000,"NEWS");
   assert.equal(v.original_publication_day,v.original_published_at.slice(0,10));
   assert.equal(v.clock_semantics,"issuer_native_datetime");
  }else{
   assert.equal(v.original_published_at,null);
   assert.match(v.original_publication_day,DATE);
   const day=Date.parse(v.original_publication_day+"T00:00:00.000Z");
   assert.ok(Number.isFinite(day)&&new Date(day).toISOString().slice(0,10)===v.original_publication_day&&
    day<=now&&now-day<=72*3600_000,"ORIGINAL_DAY_INVALID");
   assert.equal(v.clock_semantics,"issuer_native_day");
  }
 }else{
  assert.equal(v.original_published_at,null,"REFERENCE_FABRICATED_NEWS_CLOCK");
  assert.equal(typeof v.observation_period,"string");
  assert.ok(v.observation_period.length>0&&v.observation_period.length<=150);
  assert.ok(typeof v.clock_semantics==="string"&&v.clock_semantics.length>0);
 }
};
export function verifyStructuredDeliveryEnvelope(doc,now=Date.now()){
 assert.equal(doc?.ok,true,"STRUCTURED_NOT_OK");
 assert.equal(doc.schema,"geomacro.three-domain-structured-delivery.v1");
 assertClock(doc.generated_at,now,10*60_000,"DOCUMENT_CHECK");
 assert.equal(doc.category_count,3);
 assert.equal(doc.delivery_channel,"PUBLIC_READ_ONLY_STRUCTURED_JSON");
 assert.equal(doc.raw_upstream_delivered,false);
 assert.equal(doc.upstream_source_ids_delivered,false);
 assert.equal(doc.data_quality?.open_reference_is_not_current_news,true);
 assert.equal(doc.data_quality?.issuer_country_does_not_prove_event_country,true);
 assert.equal(doc.data_quality?.paid_store_delivery_verified,false);
 assert.equal(doc.commercial?.chargeable,false);
 assert.equal(doc.commercial?.payment_required,false);
 assert.equal(doc.commercial?.payment_authorized,false);
 assert.equal(doc.commercial?.commercially_qualified,false);
 assert.equal(doc.commercial?.paid_evidence_must_be_separately_verified,true);
 assert.deepEqual(Object.keys(doc.categories??{}).sort(),[...CATEGORIES].sort());
 const receipt={};
 const repeated=new Map();
 for(const category of CATEGORIES){
  const v=doc.categories[category];
  assert.equal(v.category,category);
  assert.ok(["NO_OBSERVATION_AVAILABLE","OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK",
    "OBSERVATIONS_WITHOUT_CURRENT_SOURCE_CHECK"].includes(v.delivery_state));
  assert.equal(v.qualified_paid_records_count,0);
  assert.equal(v.signed_risk_available,false);
  assert.equal(v.publication_window_hours,72);
  assert.equal(typeof v.source_check_current,"boolean");
  assert.ok(Array.isArray(v.native_release_records)&&v.native_release_records.length<=5);
  assert.ok(Array.isArray(v.official_reference_records)&&v.official_reference_records.length<=8);
  assert.equal(v.native_release_records_count,v.native_release_records.length);
  assert.equal(v.official_reference_records_count,v.official_reference_records.length);
  assert.equal(v.source_data_present,v.native_release_records.length+v.official_reference_records.length>0);
  assert.equal(v.delivery_state==="NO_OBSERVATION_AVAILABLE",!v.source_data_present);
  if(v.source_check_current){
   assertClock(v.last_source_check_at,now,3*3600_000,"CURRENT_SOURCE_CHECK");
   assert.equal(v.delivery_state,v.source_data_present?
    "OBSERVATIONS_WITH_CURRENT_SOURCE_CHECK":"NO_OBSERVATION_AVAILABLE");
  }else if(v.last_source_check_at!==null)
   assertClock(v.last_source_check_at,now,14*DAY,"HISTORICAL_SOURCE_CHECK");
  for(const field of BLOCKED)assert.equal(Object.hasOwn(v,field),false);
  assert.ok(Array.isArray(v.source_credits_required)&&v.source_credits_required.length<=25);
  for(const record of v.native_release_records){
   assertSafeRecord(record,category,now,"native_dated_source_release");
   // Identical explanation across independently classified release categories
   // is a regression in category-specific research, not verified market impact.
   const key=record.what_changed.trim().toLowerCase()+"|"+record.why_it_matters.trim().toLowerCase();
   if(!repeated.has(key))repeated.set(key,new Set());
   repeated.get(key).add(category);
  }
  for(const record of v.official_reference_records)
   assertSafeRecord(record,category,now,"official_statistical_or_reference_context");
  receipt[category]={native_news:v.native_release_records.length,
   official_reference:v.official_reference_records.length,
   delivery_state:v.delivery_state,source_check_current:v.source_check_current};
 }
 assert.equal([...repeated.values()].some(v=>v.size>=3),false,
  "SAME_NATIVE_NEWS_ANALYSIS_ALL_THREE_CATEGORIES");
 const all=CATEGORIES.every(c=>doc.categories[c].source_data_present);
 assert.equal(doc.delivery_state,all?
  "THREE_CATEGORIES_WITH_MEASURED_OBSERVATIONS":"PARTIAL_OR_EMPTY_SOURCE_OBSERVATIONS");
 return {categories:receipt,all_categories_with_data:all,
  all_categories_with_native_news:CATEGORIES.every(c=>receipt[c].native_news>0),
  native_news_total:CATEGORIES.reduce((n,c)=>n+receipt[c].native_news,0),
  reference_total:CATEGORIES.reduce((n,c)=>n+receipt[c].official_reference,0)};
}
async function readBoundedJson(response,stage,max=256*1024){
 assert.equal(response.status,200,stage+"_HTTP_"+response.status);
 assert.match(response.headers.get("content-type")??"",/application\/json/iu,"JSON_CONTENT_TYPE_REQUIRED");
 const declared=Number(response.headers.get("content-length")??0);
 assert.ok(Number.isFinite(declared)&&declared<=max,"CONTENT_LENGTH_LIMIT");
 assert.ok(response.body,"JSON_BODY_REQUIRED");
 const reader=response.body.getReader(),chunks=[];
 let bytes=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   bytes+=part.value.byteLength;
   assert.ok(bytes<=max,"BODY_BYTE_LIMIT");
   chunks.push(part.value);
  }
 }finally{await reader.cancel().catch(()=>{});}
 const data=new Uint8Array(bytes);let offset=0;
 for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data));
}
const get=(fetchImpl,url,headers={})=>fetchImpl(url,{
 method:"GET",redirect:"error",headers:{Accept:"application/json",...headers},
 signal:AbortSignal.timeout(12_000),
});
export async function auditThreeDomainLive({fetchImpl=fetch,now}={}){
 // A real publisher-side clock may be later than the request's START time.
 // Validate each received HTTP document at its actual RECEIPT time.
 // Offline tests can pin now for deterministic adversarial fixtures.
 const clock=()=>now===undefined?Date.now():now;
 let requests=0;
 const call=async(url,headers,method="GET")=>{
  requests++;
  if(requests>6)throw Error("UPSTREAM_REQUEST_BUDGET_EXCEEDED");
  return method==="GET"?get(fetchImpl,url,headers):
   fetchImpl(url,{method,redirect:"error",signal:AbortSignal.timeout(12_000)});
 };
 const firstResponse=await call(STRUCTURED_API);
 if(firstResponse.status!==200){
  // Root-cause a real public 503 with ONE bounded, read-only canonical
  // continuity GET and the same pure projector used by the Worker. No source
  // original or D1 credentials are ever requested or printed.
  // Only provider-cache metadata and a fixed public error code are logged,
  // never the response body, a source item, a URL, or a private account value.
  const cacheStatus=String(firstResponse.headers.get("cf-cache-status")??"NONE")
   .replace(/[^A-Za-z0-9_-]/gu,"").slice(0,18);
  const ageHeader=String(firstResponse.headers.get("age")??"NA")
   .replace(/[^0-9]/gu,"").slice(0,10)||"NA";
  const responseCachePolicy=firstResponse.headers.get("cache-control")==="no-store"?
   "NO_STORE":"OTHER";
  let sourceErrorCode="NON_JSON";
  if(Number(firstResponse.headers.get("content-length")??0)<=4096&&
    firstResponse.headers.get("content-type")?.includes("application/json")){
   try{
    const x=await firstResponse.clone().json();
    if(typeof x?.error==="string"&&/^[A-Z_]{3,80}$/u.test(x.error))
      sourceErrorCode=x.error;
   }catch{/* unknown error type must remain source-neutral */}
  }
  let diagnostic="CANONICAL_ORIGIN_UNVERIFIED", uncached="UNCACHED_NOT_TESTED";
  let cachedContinuity="CACHED_CONTINUITY_NOT_READ";
  try{
   const response=await call(CONTINUITY_API);
   if(response.status!==200){
    cachedContinuity="CACHED_CONTINUITY_HTTP_"+response.status;
    await response.body?.cancel();
   }else{
    const source=await readBoundedJson(response,"DIAGNOSTIC_CACHED_CONTINUITY");
    try{
     projectThreeDomainStructuredDelivery(source,Date.now());
     cachedContinuity="CACHED_CONTINUITY_PROJECTOR_PASS";
    }catch(error){
     const code=String(error?.message??"");
     cachedContinuity=/^THREE_DOMAIN_STRUCTURED_[A-Z_]+$/u.test(code)?
      "CACHED_CONTINUITY_"+code:"CACHED_CONTINUITY_PROJECTOR_INVALID";
    }
   }
  }catch{cachedContinuity="CACHED_CONTINUITY_READ_UNAVAILABLE";}
  try{
   const freshResponse=await call(STRUCTURED_API,{"Cache-Control":"no-cache"});
   uncached="UNCACHED_HTTP_"+freshResponse.status;
   await freshResponse.body?.cancel();
  }catch{uncached="UNCACHED_NETWORK_UNAVAILABLE";}
  try{
   const response=await call(CONTINUITY_API,{"Cache-Control":"no-cache"});
   if(response.status!==200){
    diagnostic="CONTINUITY_HTTP_"+response.status;
    await response.body?.cancel();
   }else{
    const source=await readBoundedJson(response,"DIAGNOSTIC_CONTINUITY");
    try{
     projectThreeDomainStructuredDelivery(source,Date.now());
     diagnostic="CANONICAL_PROJECTOR_PASS_ORIGIN_ROUTE_DEGRADED";
    }catch(error){
     const code=String(error?.message??"").trim();
     diagnostic=/^THREE_DOMAIN_STRUCTURED_[A-Z_]+$/u.test(code)?
      code:"CANONICAL_PROJECTOR_UNVERIFIED";
    }
   }
  }catch{diagnostic="CONTINUITY_DIAGNOSTIC_READ_UNAVAILABLE";}
  await firstResponse.body?.cancel();
  throw Error("STRUCTURED_CACHED_HTTP_"+firstResponse.status+"_"+uncached+"_"+cachedContinuity+"_"+diagnostic+"_EDGE_"+cacheStatus+"_AGE_"+ageHeader+"_POLICY_"+responseCachePolicy+"_CODE_"+sourceErrorCode);
 }
 const initial=verifyStructuredDeliveryEnvelope(
   await readBoundedJson(firstResponse,"STRUCTURED_CACHED"),clock());
 const refreshed=verifyStructuredDeliveryEnvelope(
   await readBoundedJson(await call(STRUCTURED_API,{"Cache-Control":"no-cache"}),"STRUCTURED_ORIGIN"),clock());
 // Require positive correctness on both cache and canonical D1 no-cache views,
 // but never demand identical counts across separately clocked source updates.
 const continuity=await readBoundedJson(
   await call(CONTINUITY_API,{"Cache-Control":"no-cache"}),"CANONICAL_CONTINUITY");
 assert.equal(continuity?.ok,true,"CANONICAL_CONTINUITY_NOT_OK");
 assert.equal(continuity.schema,"geomacro.three-domain-evidence-continuity.v1");
 assert.equal(continuity.chargeable,false);
 assert.equal(continuity.three_domains_returned,true);
 assert.equal(continuity.raw_upstream_delivered,false);
 assert.deepEqual(Object.keys(continuity.categories??{}).sort(),[...CATEGORIES].sort());
 const factual=await readBoundedJson(await call(FACTUAL_API),"FACTUAL_25H");
 assert.equal(factual?.ok,true,"FACTUAL_NEWS_NOT_OK");
 assert.equal(factual.schema,"geomacro.reusable-source-news-feed.v1");
 assert.equal(factual.commercial_product_ready,false);
 assert.equal(factual.public_raw_article_delivery,false);
 assert.equal(factual.article_licenses_automatically_granted,false);
 assert.equal(factual.window_hours,25);
 assert.ok(Array.isArray(factual.items)&&factual.items.length<=200);
 for(const item of factual.items){
  assert.equal(item.usage_rights?.commercial_reuse_authorized,false);
  assert.equal(item.delivery?.downstream_paid_product_authorized,false);
  assert.equal(item.delivery?.raw_article_included,false);
  assert.equal(item.verification?.independent_event_verified,false);
 }
 const invalid=await call(STRUCTURED_API+"?country=USA");
 assert.notEqual(invalid.status,200,"UNSCOPED_FILTER_MUST_NOT_SUCCEED");
 await invalid.body?.cancel();
 const post=await call(STRUCTURED_API,{},"POST");
 assert.notEqual(post.status,200,"POST_MUST_NOT_BE_FREE_DATA_WRITE");
 await post.body?.cancel();
 return {
  schema:"geomacro.three-domain-blackbox-acceptance.v1",
  status:"PASS_WITH_SOURCE_COVERAGE_REPORTED_SEPARATELY",
  tests:{
   structured_public_get:200,structured_uncached_get:200,
   canonical_continuity_get:200,registered_factual_news_get:200,
   invalid_country_query_rejected:true,post_write_rejected:true,
   payment_attempted:false,private_partner_path_accessed:false,
  },
  source_data:refreshed,
  cache_view:initial,
  source_fact_items_first_page:factual.items.length,
  source_fact_has_more:factual.has_more===true,
  total_upstream_requests:requests,
  d1_writes:0,b2_requests:0,payment_settlement_attempts:0,
  country_event_585_coverage_certified:false,paid_delivery_verified:false,
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=await auditThreeDomainLive();
  process.stdout.write(JSON.stringify(receipt)+"\n");
 }catch(error){
  process.stderr.write(JSON.stringify({
   schema:"geomacro.three-domain-blackbox-acceptance.v1",
   status:"FAIL",reason:String(error?.message??"UNKNOWN").slice(0,320),
   payment_attempted:false,paid_delivery_verified:false,
  })+"\n");
  process.exitCode=1;
 }
}
