#!/usr/bin/env node
/**
 * Outside-in, zero-mutation production acceptance for the PRIVATE D1
 * legacy source-directory shadow. Only explicitly transient transport errors
 * and edge 502/504/520/522/523/524 receive a small bounded retry.
 *
 * Never retry 401/403/404/409/429/503, malformed responses or security
 * mismatches. No source metadata, response body, tokens or SQL in logs.
 * The shadow remains private, archival and NOT an active news source.
 */
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const COUNTS=Object.freeze({
  primary:195,statistics:194,monetary:195,critical_minerals:195,
});
const RECOVERABLE_EDGE=new Set([502,504,520,522,523,524]);
const DELAYS_MS=[500,1250];
const fail=code=>{throw Error("SOURCE_DIRECTORY_ACCEPTANCE_"+code);};
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const isSafeJsonResponse=response=>
  /^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type")??"");

export async function verifyPrivateSourceDirectoryProduction({
  env=process.env,fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),
}={}){
  const origin=String(env.CONTROL_PLANE_URL??"");
  const credential=String(env.CONTROL_PLANE_TOKEN??"");
  if(origin!==ORIGIN)fail("ORIGIN_NOT_PINNED");
  if(!/^[a-f0-9]{64}$/iu.test(credential))fail("ADMIN_TOKEN_UNAVAILABLE");
  const seenAttempts={anonymous:0,coverage:0,us:0,missing_va:0};
  async function probe(stage,path,authorized){
    for(let attempt=0;attempt<=DELAYS_MS.length;attempt++){
      seenAttempts[stage]++;
      let response;
      try{
        response=await fetchImpl(origin+path,{
          method:"GET",redirect:"error",cache:"no-store",
          headers:authorized?{
            Authorization:"Bearer "+credential,Accept:"application/json",
            "Cache-Control":"no-cache",
          }:{
            Accept:"application/json","Cache-Control":"no-cache",
          },
          signal:AbortSignal.timeout(12000),
        });
      }catch{
        // No response bytes: retry only read-only GET transport failures.
        if(attempt<DELAYS_MS.length){await sleep(DELAYS_MS[attempt]);continue;}
        fail(stage.toUpperCase()+"_TRANSPORT_EXHAUSTED");
      }
      if(response?.redirected)fail(stage.toUpperCase()+"_REDIRECT_DENIED");
      if(RECOVERABLE_EDGE.has(response?.status)&&attempt<DELAYS_MS.length){
        await sleep(DELAYS_MS[attempt]);continue;
      }
      return response;
    }
    fail(stage.toUpperCase()+"_TRANSPORT_EXHAUSTED");
  }
  const expectedStatus=(response,stage,status)=>{
    if(response?.status!==status)
      fail(stage.toUpperCase()+"_HTTP_"+String(response?.status??0)
        .replace(/[^0-9]/gu,""));
  };
  async function boundedJson(response,stage){
    if(!isSafeJsonResponse(response))fail(stage.toUpperCase()+"_CONTENT_TYPE_INVALID");
    const length=response.headers.get("content-length");
    if(length!==null&&(!/^\d{1,6}$/u.test(length)||Number(length)>50000))
      fail(stage.toUpperCase()+"_RESPONSE_TOO_LARGE");
    let raw;
    try{raw=await response.text()}catch{fail(stage.toUpperCase()+"_BODY_UNAVAILABLE")}
    if(new TextEncoder().encode(raw).byteLength>50000)
      fail(stage.toUpperCase()+"_RESPONSE_TOO_LARGE");
    try{return JSON.parse(raw)}catch{fail(stage.toUpperCase()+"_JSON_INVALID")}
  }

  // Critical: anonymous cannot see internal counts; do not issue any private
  // SQL when the Worker rejects this request upstream.
  expectedStatus(await probe("anonymous","/v1/internal/source-directory-coverage",false),
    "anonymous",401);
  const coverageResponse=await probe("coverage",
    "/v1/internal/source-directory-coverage",true);
  expectedStatus(coverageResponse,"coverage",200);
  const coverage=await boundedJson(coverageResponse,"coverage");
  if(!isObject(coverage)||coverage.ok!==true||
     coverage.schema!=="geomacro.private-source-directory-coverage.v1"||
     coverage.rows_verified_in_shadow!==779||
     !isObject(coverage.country_directory_counts)||
     Object.keys(coverage.country_directory_counts).length!==4||
     Object.keys(COUNTS).some(k=>coverage.country_directory_counts[k]!==COUNTS[k])||
     !Array.isArray(coverage.known_missing_statistics_iso2)||
     coverage.known_missing_statistics_iso2.length!==1||
     coverage.known_missing_statistics_iso2[0]!=="VA"||
     coverage.status!=="PRIVATE_METADATA_COPIED_NOT_ACTIVATED"||
     coverage.source_activated!==false||
     coverage.real_time_source_health_verified!==false||
     coverage.raw_news_delivery_enabled!==false||
     coverage.commercial_rights_verified!==false||
     coverage.supabase_requests!==0||coverage.b2_requests!==0||
     coverage.payments!==0||coverage.chargeable!==false)
    fail("COVERAGE_CONTRACT_INVALID");

  const usResponse=await probe("us",
    "/v1/internal/source-directory?dataset=primary&country_iso2=US",true);
  expectedStatus(usResponse,"us",200);
  const us=await boundedJson(usResponse,"us");
  if(!isObject(us)||us.ok!==true||
     us.schema!=="geomacro.private-legacy-source-directory.v1"||
     us.country_iso2!=="US"||us.dataset!=="primary"||
     !isObject(us.source_directory_metadata)||
     us.source_directory_metadata.country_iso2!=="US"||
     !/^[a-f0-9]{64}$/u.test(us.metadata_sha256??"")||
     us.data_origin!=="legacy-supabase-verified-d1-shadow"||
     us.source_activated!==false||
     us.original_live_retrieval_verified!==false||
     us.derivative_commercial_rights_approved!==false||
     us.partner_output_authorized!==false||us.chargeable!==false)
    fail("US_HASH_BOUND_CONTRACT_INVALID");

  const vaResponse=await probe("missing_va",
    "/v1/internal/source-directory?dataset=statistics&country_iso2=VA",true);
  expectedStatus(vaResponse,"missing_va",404);
  // 404 is an accepted explicit missing record, never a synthetic one.
  const va=await boundedJson(vaResponse,"missing_va");
  if(!isObject(va)||va.ok!==false||
     va.error!=="SOURCE_DIRECTORY_ENTRY_UNAVAILABLE"||
     va.dataset!=="statistics"||va.country_iso2!=="VA"||
     va.commercially_usable!==false)
    fail("MISSING_VA_CONTRACT_INVALID");
  return Object.freeze({
    schema:"geomacro.private-source-directory-production-acceptance.v1",
    verified:true,expected_shadow_rows:779,
    country_directory_counts:COUNTS,missing_statistics_iso2:"VA",
    anonymous_access_denied:true,hash_bound_us_sample_verified:true,
    missing_va_fail_closed:true,
    source_activated:false,commercial_rights_verified:false,
    protected_partner_endpoint_accessed:false,
    source_directory_metadata_logged:false,source_credentials_logged:false,
    source_news_fetched:0,source_news_inserted:0,
    supabase_requests:0,b2_requests:0,payments:0,d1_writes:0,
    transport_attempts_by_stage:seenAttempts,
    // A green scoped canary does not guarantee all future edge requests.
    permanent_network_availability_guaranteed:false,
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(await verifyPrivateSourceDirectoryProduction()));}
  catch(error){
    const code=error instanceof Error&&
      /^SOURCE_DIRECTORY_ACCEPTANCE_[A-Z0-9_]+$/u.test(error.message)?
      error.message:"SOURCE_DIRECTORY_ACCEPTANCE_UNCLASSIFIED";
    console.error("::error::"+code);
    process.exitCode=2;
  }
}
