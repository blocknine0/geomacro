#!/usr/bin/env node
import {pathToFileURL} from "node:url";

const fail=code=>{throw Error("RISK_STREAM_LIVE_RUNTIME_"+code)};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Confirm that the just-deployed Worker is serving the reviewed source and
 * has the protected research, Queue, D1, and authentication bindings ready.
 * The endpoint is internal and intentionally performs no D1 read. */
export async function verifyRiskStreamRuntimeLive({controlPlaneUrl,controlPlaneToken,
 expectedSourceSha,fetchImpl=fetch,sleepImpl=pause,retries=15}={}){
 if(typeof controlPlaneUrl!=="string"||!controlPlaneToken)fail("CONFIGURATION_MISSING");
 if(!/^[a-f0-9]{40}$/u.test(String(expectedSourceSha??"")))fail("EXPECTED_SOURCE_SHA_INVALID");
 const endpoint=new URL("/v1/internal/risk-stream/runtime",controlPlaneUrl);
 if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||endpoint.hash)fail("HTTPS_REQUIRED");
 let lastStatus=0;
 for(let attempt=0;attempt<=retries;attempt++){
  let response;
  try{response=await fetchImpl(endpoint.href,{method:"GET",redirect:"error",
   headers:{Authorization:"Bearer "+controlPlaneToken,Accept:"application/json"},
   signal:AbortSignal.timeout(15000)});
  }catch{
   if(attempt===retries)fail("HTTP_UNAVAILABLE");
   await sleepImpl(Math.min(8000,500*2**attempt));continue;
  }
  lastStatus=response.status;
  if(response.ok){
   let runtime;try{runtime=await response.json()}catch{fail("JSON_INVALID")}
   if(runtime?.schema!=="geomacro.risk-stream-runtime-status.v1")fail("SCHEMA_INVALID");
   if(runtime.deployed_source_sha!==expectedSourceSha)fail("DEPLOYED_SOURCE_SHA_MISMATCH");
   const flags=runtime.research_flags??{};
   if(flags.active!==true||flags.ingestion_enabled!==true||flags.production_mode!==true||
      flags.hot50_research_enabled!==true||runtime.ready!==true)
    fail("RESEARCH_FLAGS_NOT_READY");
   if(runtime.queue_binding_present!==true)fail("QUEUE_BINDING_MISSING");
   if(runtime.d1_binding_present!==true)fail("D1_BINDING_MISSING");
   if(runtime.auth_configured!==true)fail("AUTH_NOT_CONFIGURED");
   return {status:"PASS",source_sha:runtime.deployed_source_sha,
    queue_binding_present:true,d1_binding_present:true,auth_configured:true,
    research_flags:flags};
  }
  if(response.status===401||response.status===403)fail("AUTH_REJECTED_"+response.status);
  if(response.status===405)fail("RUNTIME_ROUTE_NOT_DEPLOYED");
  if((response.status===404||response.status===429||response.status>=500)&&attempt<retries){
   await sleepImpl(Math.min(8000,500*2**attempt));continue;
  }
  fail("HTTP_REJECTED_"+response.status);
 }
 fail("HTTP_RETRIES_EXHAUSTED_"+lastStatus);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await verifyRiskStreamRuntimeLive({controlPlaneUrl:process.env.CONTROL_PLANE_URL,
  controlPlaneToken:process.env.CONTROL_PLANE_TOKEN,
  expectedSourceSha:process.env.GITHUB_SHA});
 console.log(JSON.stringify(result));
}
