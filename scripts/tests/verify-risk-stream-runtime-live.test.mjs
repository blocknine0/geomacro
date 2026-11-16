import test from "node:test";
import assert from "node:assert/strict";
import {verifyRiskStreamRuntimeLive} from "../ops/verify-risk-stream-runtime-live.mjs";

const sha="80cef83c0dc9e6e9f71d34f61978ac25863a295d";
const ready={ok:true,schema:"geomacro.risk-stream-runtime-status.v1",ready:true,
 deployed_source_sha:sha,research_flags:{active:true,ingestion_enabled:true,
 production_mode:true,hot50_research_enabled:true},queue_binding_present:true,
 d1_binding_present:true,auth_configured:true};
const response=(status,body)=>({status,ok:status>=200&&status<300,json:async()=>body});

test("live runtime acceptance checks commit, all flags, Queue, D1, and auth",async()=>{
 let calls=0;
 const result=await verifyRiskStreamRuntimeLive({controlPlaneUrl:"https://control.example",
  controlPlaneToken:"t".repeat(64),expectedSourceSha:sha,sleepImpl:async()=>{},
  fetchImpl:async(url,options)=>{calls++;assert.equal(new URL(url).pathname,"/v1/internal/risk-stream/runtime");
   assert.equal(options.headers.Authorization,"Bearer "+"t".repeat(64));return response(200,ready)}});
 assert.equal(result.status,"PASS");assert.equal(result.source_sha,sha);assert.equal(calls,1);
});

test("live runtime retries only propagation and transient service responses",async()=>{
 let calls=0,sleeps=0;
 const result=await verifyRiskStreamRuntimeLive({controlPlaneUrl:"https://control.example",
  controlPlaneToken:"t".repeat(64),expectedSourceSha:sha,sleepImpl:async()=>{sleeps++},
  fetchImpl:async()=>++calls===1?response(404,{}):response(200,ready)});
 assert.equal(result.status,"PASS");assert.equal(calls,2);assert.equal(sleeps,1);
});

test("missing runtime route fails explicitly without masking a stale deployment",async()=>{
 await assert.rejects(()=>verifyRiskStreamRuntimeLive({controlPlaneUrl:"https://control.example",
  controlPlaneToken:"t".repeat(64),expectedSourceSha:sha,fetchImpl:async()=>response(405,{})}),
  /RISK_STREAM_LIVE_RUNTIME_RUNTIME_ROUTE_NOT_DEPLOYED/);
});

test("live runtime fails closed for missing Queue, D1, auth, flags, or source SHA",async()=>{
 for(const [field,body,pattern] of [
  ["queue",{...ready,queue_binding_present:false},/QUEUE_BINDING_MISSING/],
  ["d1",{...ready,d1_binding_present:false},/D1_BINDING_MISSING/],
  ["auth",{...ready,auth_configured:false},/AUTH_NOT_CONFIGURED/],
  ["flags",{...ready,research_flags:{...ready.research_flags,hot50_research_enabled:false}},/RESEARCH_FLAGS_NOT_READY/],
  ["readiness",{...ready,ready:false},/CONTROL_PLANE_NOT_READY/],
  ["sha",{...ready,deployed_source_sha:"0".repeat(40)},/DEPLOYED_SOURCE_SHA_MISMATCH/]]){
  await assert.rejects(()=>verifyRiskStreamRuntimeLive({controlPlaneUrl:"https://control.example",
   controlPlaneToken:"t".repeat(64),expectedSourceSha:sha,
   fetchImpl:async()=>response(200,body)}),pattern,field);
 }
});
