import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {diagnoseShadowAfterPromotion,probeHost}
 from "../ops/diagnose-step3-shadow-failed-promotion-readonly.mjs";

const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const W=[
 {name:"geomacro-step3-shadow",old:"48680b70-c41c-4af9-9e70-497213471dbb",
  target:"1a49e55d-7c82-42b6-9f30-250423d9732c"},
 {name:"geomacro-step3-shadow-legacy",old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  target:"f72738eb-40ff-4e48-ba67-1d5c004a989d"}
];
const BEARER="a".repeat(64);
const DEPLOY="844e8352-2dd1-45ef-bd81-73ca2903e30f";
const UNKNOWN="7c735673-81be-4bbe-9495-5c5f101c76c7";
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"push",
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"c".repeat(40),
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"s".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:W[0].name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:W[1].name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:BEARER
});
function mock({modern="unknown",legacy="old",differentAcrossRead=false,wrongDb=false}={}){
 const calls=[],listCount=new Map();
 const fetchImpl=async (url,opts)=>{
  const u=new URL(url);calls.push({host:u.hostname,path:u.pathname,method:opts.method});
  assert.equal(opts.method,"GET");
  assert(!opts.body);
  if(u.hostname==="api.cloudflare.com"){
   const p=u.pathname;
   if(p.includes("/d1/database/")){
    const id=p.split("/").at(-1);
    return Response.json({success:true,result:{uuid:id,name:
      id===PROD?"geomacro-control-plane":"geomacro-d1-publisher-shadow"}});
   }
   const w=W.find(x=>p.includes("/workers/scripts/"+x.name+"/"));
   assert(w,"only isolated Worker scripts can be read");
   const mode=w.name===W[0].name?modern:legacy;
   const id=mode==="new"?w.target:mode==="old"?w.old:UNKNOWN;
   if(p.endsWith("/deployments")){
    const cnt=(listCount.get(w.name)??0)+1;
    listCount.set(w.name,cnt);
    return Response.json({success:true,result:{deployments:[{
      id:DEPLOY,created_on:"2026-11-09T08:04:19.000Z",
      versions:[{version_id:differentAcrossRead&&cnt>1?w.old:id,percentage:100}]
    }]}});
   }
   if(p.endsWith("/deployments/"+DEPLOY)){
    const cnt=listCount.get(w.name);
    return Response.json({success:true,result:{
      id:DEPLOY,created_on:"2026-11-09T08:04:19.000Z",
      versions:[{version_id:differentAcrossRead&&cnt>1?w.old:id,percentage:100}]
    }});
   }
   if(p.endsWith("/subdomain"))return Response.json({success:true,result:
     {enabled:true,previews_enabled:true}});
   if(p.endsWith("/settings"))return Response.json({success:true,result:{bindings:[
     {name:"DB",type:"d1",database_id:wrongDb?PROD:SHADOW},
     {name:"CONTROL_PLANE_TOKEN",type:"secret_text"}
   ]}});
   throw Error("unexpected GET "+p);
  }
  assert(W.some(w=>u.hostname===w.name+".daspallab202391.workers.dev"));
  if(u.pathname==="/v1/public/intelligence-publications")
   return Response.json({ok:false,error:"NOT_FOUND"},{status:404});
  if(opts.headers.Authorization==="Bearer invalid")
   return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  assert.equal(opts.headers.Authorization,"Bearer "+BEARER);
  return Response.json({ok:false,error:"P0B_STATUS_QUERY_INVALID"},{status:400});
 };
 return {fetchImpl,calls};
}
test("post-failure snapshot reveals unexpected modern active version and untouched legacy",async()=>{
 const m=mock();
 const r=await diagnoseShadowAfterPromotion({env:env(),fetchImpl:m.fetchImpl,
  headCheck:()=>env().GITHUB_SHA,holdPresent:true,sleep:async()=>{}});
 assert.equal(r.status,"OBSERVED_READONLY");
 assert.equal(r.incident_state,"MANUAL_REVIEW_REQUIRED");
 assert.equal(r.workers[0].provider_state,"UNEXPECTED_OR_SPLIT_VERSION_REVIEW");
 assert.equal(r.workers[1].provider_state,"OLD_ORIGINAL_AT_100");
 assert.equal(r.workers[0].current_version_id,UNKNOWN);
 assert(r.workers.every(w=>w.live_http_probes.length===3));
 assert(!m.calls.some(x=>x.method!=="GET"));
 assert(!JSON.stringify(r).includes(BEARER));
 assert(!JSON.stringify(r).includes(env().CLOUDFLARE_API_TOKEN));
 assert.equal(r.canary_hold_removed,false);
 assert.equal(r.production_d1_mutated,false);
});
test("both old deployments return state identified with read-only receipt",async()=>{
 const m=mock({modern:"old",legacy:"old"});
 const r=await diagnoseShadowAfterPromotion({env:env(),fetchImpl:m.fetchImpl,
  headCheck:()=>env().GITHUB_SHA,holdPresent:true,sleep:async()=>{}});
 assert.equal(r.status,"OBSERVED_READONLY");
 assert.equal(r.incident_state,"STATE_IDENTIFIED_NO_MUTATION");
 assert(r.workers.every(w=>w.provider_state==="OLD_ORIGINAL_AT_100"));
});
test("new canonical modern and old legacy do not claim dual promotion pass",async()=>{
 const m=mock({modern:"new",legacy:"old"});
 const r=await diagnoseShadowAfterPromotion({env:env(),fetchImpl:m.fetchImpl,
  headCheck:()=>env().GITHUB_SHA,holdPresent:true,sleep:async()=>{}});
 assert.equal(r.status,"OBSERVED_READONLY");
 assert.equal(r.workers[0].provider_state,"NEW_CANONICAL_AT_100");
 assert.equal(r.workers[1].provider_state,"OLD_ORIGINAL_AT_100");
 assert.equal(r.shadow_traffic_changed_by_audit,false);
});
test("changing deployment list between consecutive reads is incident HOLD",async()=>{
 const m=mock({modern:"new",legacy:"old",differentAcrossRead:true});
 const r=await diagnoseShadowAfterPromotion({env:env(),fetchImpl:m.fetchImpl,
  headCheck:()=>env().GITHUB_SHA,holdPresent:true,sleep:async()=>{}});
 assert.equal(r.incident_state,"MANUAL_REVIEW_REQUIRED");
 assert.equal(r.workers[0].provider_state,"UNSTABLE_PROVIDER_READBACK");
});
test("prod D1 bound to isolated Shadow script is flagged and not hidden",async()=>{
 const m=mock({wrongDb:true});
 const r=await diagnoseShadowAfterPromotion({env:env(),fetchImpl:m.fetchImpl,
  headCheck:()=>env().GITHUB_SHA,holdPresent:true,sleep:async()=>{}});
 assert.equal(r.incident_state,"MANUAL_REVIEW_REQUIRED");
 assert(r.workers.every(w=>w.shadow_d1_isolated===false));
});
test("invalid exact-main, missing canary HOLD or unexpected account refuses provider requests",async()=>{
 const m=mock();
 for(const changes of [
  {GITHUB_REF:"refs/heads/feature"},
  {CLOUDFLARE_ACCOUNT_ID:"other"},
  {D1_DATABASE_ID:SHADOW},
  {GITHUB_SHA:"notsha"},
  {GITHUB_EVENT_NAME:"pull_request"}
 ]){
  const r=await diagnoseShadowAfterPromotion({env:{...env(),...changes},
   fetchImpl:m.fetchImpl,headCheck:()=>env().GITHUB_SHA,
   holdPresent:true,sleep:async()=>{}});
  assert.equal(r.status,"HOLD");
 }
 const r=await diagnoseShadowAfterPromotion({env:env(),fetchImpl:m.fetchImpl,
  headCheck:()=>env().GITHUB_SHA,holdPresent:false,sleep:async()=>{}});
 assert.equal(r.status,"HOLD");
 assert.equal(m.calls.length,0);
});
test("probes do not touch unknown host/path; absent owner bearer is UNKNOWN",async()=>{
 const m=mock();
 const r=await probeHost(W[0],"valid",{fetchImpl:m.fetchImpl,shadowBearer:""});
 assert.equal(r.status,"UNVERIFIED");
 await assert.rejects(()=>probeHost(W[0],"not_allowed",{fetchImpl:m.fetchImpl}),
  /PROBE_PATH_NOT_ALLOWED/);
 assert(m.calls.length===0);
});
test("workflow requires direct-on-main read-only provider audit and full receipt",()=>{
 const y=readFileSync(".github/workflows/step3-shadow-failed-promotion-readonly.yml","utf8");
 assert.match(y,/push:/);
 assert.match(y,/pull_request:/);
 assert.match(y,/environment: production/);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(y,/git ls-remote/);
 assert.doesNotMatch(y,/continue-on-error: true|wrangler deploy|versions deploy|migrations apply|POST|PUT/);
});
