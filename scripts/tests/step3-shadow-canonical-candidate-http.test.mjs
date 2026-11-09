import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertCandidateScope,pinnedVersionHost,publicProbe,verifyCandidateHttp}
 from "../ops/verify-step3-shadow-canonical-candidate-http.mjs";

const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const SHA="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const TOKEN="a".repeat(64);
const PREFIX="3bc9a11e";
const W=[
 {name:"geomacro-step3-shadow",old:"48680b70-c41c-4af9-9e70-497213471dbb",
  candidate:"565118e5-781f-4a3a-ad73-d304d4876e8a",r2:true},
 {name:"geomacro-step3-shadow-legacy",old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  candidate:"214742c7-bc20-4ff8-bbed-cc3b41604aff",r2:false}
];
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"b".repeat(40),
 SHADOW_CANDIDATE_HTTP_APPROVAL:"VERIFY_TWO_CANONICAL_SHADOW_CANDIDATES_READ_ONLY",
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"c".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
 GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:TOKEN,
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:W[0].name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:W[1].name+".daspallab202391.workers.dev"
});
function mock({untrustedUrl=false,noUrl=false,adminBad=false,wrongDb=false,
 missingVersion=false,routeDisabled=false,deployedCandidate=false}={}){
 const calls=[];
 const fetchImpl=async (url,opts)=>{
  const u=new URL(url);calls.push({host:u.hostname,path:u.pathname,method:opts.method,
   query:u.search,hasAuth:!!opts.headers?.Authorization});
  assert.equal(opts.method,"GET");
  assert(!opts.body);
  if(u.hostname==="api.cloudflare.com"){
   const p=u.pathname;
   if(p.includes("/d1/database/")){
    const id=p.split("/").at(-1);
    return Response.json({success:true,result:{uuid:id,
     name:id===PROD?"geomacro-control-plane":"geomacro-d1-publisher-shadow"}});
   }
   const w=W.find(x=>p.includes("/workers/scripts/"+x.name+"/")||
    p.includes("/workers/workers/"+x.name+"/"));
   assert(w,"provider API must be confined to two pinned Shadow Workers");
   if(p.endsWith("/deployments"))return Response.json({success:true,
    result:{deployments:[{versions:[{version_id:deployedCandidate?w.candidate:w.old,
     percentage:100}]}]}});
   if(p.endsWith("/subdomain"))return Response.json({success:true,result:{
     enabled:!routeDisabled,previews_enabled:true}});
   const v=p.endsWith(w.candidate);
   if(p.includes("/workers/workers/")&&v)return Response.json({success:true,
    result:{id:missingVersion?w.old:w.candidate,
     main_module:"index.js",urls:noUrl?[]:[
      untrustedUrl?"https://untrusted.example.com":
      "https://"+PREFIX+"-"+w.name+".daspallab202391.workers.dev"]}});
   if(p.includes("/workers/scripts/")&&v){
    const bindings=[
     {name:"DB",type:"d1",database_id:wrongDb?PROD:SHADOW},
     {name:"CONTROL_PLANE_TOKEN",type:"secret_text"},
     ...(w.r2?[{name:"PHASE2H_PRIVATE_R2",type:"r2_bucket",
      bucket_name:"geomacro-step3-shadow-private"}]:[]),
     {name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:SHA}
    ];
    return Response.json({success:true,result:{id:w.candidate,
     resources:{bindings,script_runtime:{compatibility_date:"2026-10-03"}}}});
   }
   throw Error("unexpected provider path "+p);
  }
  assert(W.some(w=>u.hostname===PREFIX+"-"+w.name+
   ".daspallab202391.workers.dev"));
  assert.equal(u.search,u.pathname==="/v1/internal/p0b/status"?"?deep=invalid":"");
  const auth=opts.headers.Authorization;
  if(u.pathname==="/v1/public/intelligence-publications")
   return Response.json({ok:false,error:"NOT_FOUND"},{status:404});
  if(u.pathname==="/v1/internal/p0b/status"){
   if(auth==="Bearer invalid")
    return Response.json({ok:false,error:adminBad?"NOT_FOUND":"UNAUTHORIZED"},
     {status:adminBad?404:401});
   assert.equal(auth,"Bearer "+TOKEN);
   return Response.json({ok:false,error:"P0B_STATUS_QUERY_INVALID"},{status:400});
  }
  throw Error("unexpected external probe "+u.pathname);
 };
 return {fetchImpl,calls};
}
test("rejects wrong account, host, ref, event, missing hold or approval",()=>{
 assert.equal(assertCandidateScope(env(),true),true);
 assert.throws(()=>assertCandidateScope(env(),false),/OWNER_APPROVAL_NOT_VERIFIED/);
 for(const patch of [
  {GITHUB_REF:"refs/heads/audit"},
  {GITHUB_EVENT_NAME:"pull_request"},
  {SHADOW_CANDIDATE_HTTP_APPROVAL:"BYPASS"},
  {D1_DATABASE_ID:SHADOW},
  {GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:"api.geomacro.live"}
 ])assert.throws(()=>assertCandidateScope({...env(),...patch},true),
  /OWNER_APPROVAL_NOT_VERIFIED/);
});
test("only exact version-ID API returned pinned workers.dev host is eligible",()=>{
 const host="https://"+PREFIX+"-"+W[0].name+".daspallab202391.workers.dev";
 assert.equal(pinnedVersionHost([host],W[0]).ok,true);
 assert.equal(pinnedVersionHost(["https://other.example.com"],W[0]).ok,false);
 assert.equal(pinnedVersionHost([host+"?redirect=1"],W[0]).ok,false);
 assert.equal(pinnedVersionHost([host,host],W[0]).ok,false);
 assert.equal(pinnedVersionHost([],W[0]).ok,false);
 assert.equal(pinnedVersionHost(new Array(9).fill(host),W[0]).ok,false);
});
test("both exact canonical candidate versions prove JSON 404, 401 and 400 without D1 or traffic",async()=>{
 const m=mock();
 const r=await verifyCandidateHttp({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
   headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"PASS_CANDIDATES_HTTP_VERIFIED_NOT_PROMOTED");
 assert.equal(r.workers.length,2);
 assert(r.workers.every(w=>w.probes.length===3&&w.probes.every(p=>p.verified)));
 assert(r.workers.every(w=>w.previous_deployment_100pct_unchanged));
 assert(r.workers.every(w=>w.candidate_source_sha_pinned));
 assert.equal(r.production_d1_mutated,false);
 assert.equal(r.shadow_d1_mutated,false);
 assert.equal(r.shadow_traffic_changed,false);
 assert.equal(r.canary_hold_removed,false);
 assert(!m.calls.some(c=>c.method!=="GET"||c.path.endsWith("/query")));
 assert(!JSON.stringify(r).includes(TOKEN));
 assert(!JSON.stringify(r).includes(env().CLOUDFLARE_API_TOKEN));
 assert(!JSON.stringify(r).includes(PREFIX));
});
test("do not accept untrusted provider URL or probe untrusted host",async()=>{
 const m=mock({untrustedUrl:true});
 const r=await verifyCandidateHttp({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
   headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert(r.workers.every(w=>w.probes.length===0));
 assert(!m.calls.some(c=>c.host==="untrusted.example.com"));
});
test("missing provider version URL is explicit HOLD; never guess it from UUID",async()=>{
 const m=mock({noUrl:true});
 const r=await verifyCandidateHttp({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
   headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert(r.workers.every(w=>w.version_url_status==="NO_PROVIDER_PINNED_VERSION_HOST"));
 assert(!m.calls.some(c=>c.host.endsWith(".workers.dev")));
});
test("invalid bearer 404 cannot be called authentication PASS",async()=>{
 const m=mock({adminBad:true});
 const r=await verifyCandidateHttp({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
   headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert(r.workers.every(w=>w.probes[1].verified===false));
});
test("missing owner valid bearer prevents full HTTP PASS without revealing it",async()=>{
 const m=mock();
 const e={...env(),GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:""};
 const r=await verifyCandidateHttp({env:e,fetchImpl:m.fetchImpl,holdPresent:true,
   headCheck:()=>e.GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert(r.workers.every(w=>w.probes[2].verified===false));
 assert(!JSON.stringify(r).includes(TOKEN));
});
test("production DB bound to candidate must HOLD before any public host request",async()=>{
 const m=mock({wrongDb:true});
 const r=await verifyCandidateHttp({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
   headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/CANDIDATE_D1_NOT_ISOLATED/);
 assert(!m.calls.some(c=>c.host.endsWith(".workers.dev")));
});
test("candidate deployed early, route disabled, or version ID drift must HOLD",async()=>{
 for(const patch of [{deployedCandidate:true},{routeDisabled:true},{missingVersion:true}]){
  const m=mock(patch);
  const r=await verifyCandidateHttp({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
    headCheck:()=>env().GITHUB_SHA});
  assert.equal(r.status,"HOLD");
 }
});
test("direct public probe refuses invented external hostname",async()=>{
 await assert.rejects(()=>publicProbe("evil.example",W[0],"invalid_admin",{
  fetchImpl:()=>{throw Error("network must not be used")}}),/HOST_NOT_PINNED/);
});
test("workflow is manual exact main, read-only, retains existing canary hold",()=>{
 const y=readFileSync(".github/workflows/step3-shadow-canonical-candidate-http.yml","utf8");
 assert.match(y,/workflow_dispatch:/);
 assert.match(y,/VERIFY_TWO_CANONICAL_SHADOW_CANDIDATES_READ_ONLY/);
 assert.match(y,/environment: production/);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(y,/git ls-remote/);
 assert.doesNotMatch(y,/wrangler deploy|versions deploy|migrations apply|continue-on-error: true/);
});
