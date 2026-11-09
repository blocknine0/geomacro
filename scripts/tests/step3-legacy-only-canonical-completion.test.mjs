import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertLegacyScope,versionHost,promoteOnlyLegacy}
 from "../ops/promote-step3-legacy-only-after-incident.mjs";

const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const SOURCE="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const TOKEN="a".repeat(64);
const MODERN={name:"geomacro-step3-shadow",
 target:"1a49e55d-7c82-42b6-9f30-250423d9732c"};
const LEGACY={name:"geomacro-step3-shadow-legacy",
 old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
 target:"f72738eb-40ff-4e48-ba67-1d5c004a989d"};
const PROVIDER_VERSION_HOST="https://d3c12a45-"+LEGACY.name+
 ".daspallab202391.workers.dev";
const DEPLOY_ID="390d6908-2c2a-43c8-963f-fbba34790ba9";
const e=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"b".repeat(40),
 STEP3_LEGACY_APPROVAL:"PROMOTE_ONLY_VERIFIED_LEGACY_SHADOW_AFTER_MODERN_PROOF",
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"z".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:
  MODERN.name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:
  LEGACY.name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED:"YES",
 GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:TOKEN
});
function bindings(modern){
 return [
  {name:"DB",type:"d1",database_id:SHADOW},
  {name:"CONTROL_PLANE_TOKEN",type:"secret_text"},
  {name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:SOURCE},
  ...(modern?[{name:"PHASE2H_PRIVATE_R2",type:"r2_bucket",
    bucket_name:"geomacro-step3-shadow-private"}]:[])
 ];
}
function fake({modernDrift=false,legacyDrift=false,
 missingVersionUrl=false,legacyHttpFails=false,lagReads=0,
 failPost=false,neverMoves=false}={}){
 const calls=[],writes=[];
 let posted=false,readsAfterPost=0;
 const fetchImpl=async (url,opts)=>{
  const u=new URL(url);
  calls.push({host:u.hostname,method:opts.method,path:u.pathname});
  if(u.hostname==="api.cloudflare.com"){
   const path=u.pathname;
   if(path.includes("/d1/database/")){
    assert.equal(opts.method,"GET");
    const id=path.split("/").at(-1);
    return Response.json({success:true,result:{uuid:id,name:id===PROD?
      "geomacro-control-plane":"geomacro-d1-publisher-shadow"}});
   }
   const modern=path.includes("/workers/scripts/"+MODERN.name+"/");
   const legacy=path.includes("/workers/scripts/"+LEGACY.name+"/")||
      path.includes("/workers/workers/"+LEGACY.name+"/");
   assert(modern||legacy,"no production Worker API access");
   if(opts.method==="POST"){
    assert(legacy&&!modern&&path.endsWith("/deployments"));
    const body=JSON.parse(opts.body);
    assert.equal(body.strategy,"percentage");
    assert.deepEqual(body.versions,[{version_id:LEGACY.target,percentage:100}]);
    writes.push({script:LEGACY.name,version:LEGACY.target});
    if(failPost)return Response.json({success:false,result:null},{status:409});
    posted=true;
    return Response.json({success:true,result:{id:DEPLOY_ID}});
   }
   assert.equal(opts.method,"GET");
   if(path.endsWith("/deployments")){
    if(posted&&legacy)readsAfterPost++;
    const old=legacy&&(!posted||neverMoves||readsAfterPost<=lagReads);
    const id=modern?(modernDrift?LEGACY.old:MODERN.target):
      legacyDrift?MODERN.target:old?LEGACY.old:LEGACY.target;
    return Response.json({success:true,result:{deployments:[{
      id:DEPLOY_ID,versions:[{version_id:id,percentage:100}]
    }]}});
   }
   if(path.endsWith("/subdomain"))return Response.json({success:true,result:{
    enabled:true,previews_enabled:true}});
   if(path.endsWith("/settings"))return Response.json({success:true,result:{
    bindings:bindings(modern)}});
   if(path.includes("/workers/workers/")&&path.endsWith("/versions/"+LEGACY.target))
    return Response.json({success:true,result:{id:LEGACY.target,main_module:"index.js",
     urls:missingVersionUrl?[]:[PROVIDER_VERSION_HOST]}});
   if(legacy&&path.endsWith("/versions/"+LEGACY.target))
    return Response.json({success:true,result:{id:LEGACY.target,
     resources:{bindings:bindings(false)}}});
   throw Error("unmocked path: "+path);
  }
  assert.equal(opts.method,"GET");
  assert([MODERN.name+".daspallab202391.workers.dev",
   LEGACY.name+".daspallab202391.workers.dev",
   new URL(PROVIDER_VERSION_HOST).hostname].includes(u.hostname));
  if(u.hostname===LEGACY.name+".daspallab202391.workers.dev"&&
    legacyHttpFails)return new Response("old",{
      status:404,headers:{"content-type":"text/plain"}});
  if(u.pathname==="/v1/public/intelligence-publications")
   return Response.json({ok:false,error:"NOT_FOUND"},{status:404});
  if(opts.headers.Authorization==="Bearer invalid")
   return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  assert.equal(opts.headers.Authorization,"Bearer "+TOKEN);
  return Response.json({ok:false,error:"P0B_STATUS_QUERY_INVALID"},{status:400});
 };
 return {fetchImpl,writes,calls};
}
async function run(fakeOptions={},customEnv=e()){
 const m=fake(fakeOptions);
 const r=await promoteOnlyLegacy({env:customEnv,fetchImpl:m.fetchImpl,
  headCheck:()=>customEnv.GITHUB_SHA,holdPresent:true,sleep:async()=>{}});
 return {r,m};
}
test("requires exact main, explicit approval, distinct DB, canary HOLD",()=>{
 assert.equal(assertLegacyScope(e(),true),true);
 for(const change of [
  {GITHUB_REF:"refs/heads/pr"},
  {STEP3_LEGACY_APPROVAL:"SKIP"},
  {D1_DATABASE_ID:SHADOW},
  {GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:"short"},
  {GITHUB_EVENT_NAME:"push"},
  {CLOUDFLARE_ACCOUNT_ID:"incorrect"}
 ]){
  assert.throws(()=>assertLegacyScope({...e(),...change},true),
   /APPROVAL_AND_ACCOUNT_ISOLATION_REQUIRED/);
 }
 assert.throws(()=>assertLegacyScope(e(),false),/APPROVAL_AND_ACCOUNT_ISOLATION_REQUIRED/);
});
test("immutable Legacy version URL must be exactly provider-returned allowlisted host",()=>{
 assert.equal(versionHost([PROVIDER_VERSION_HOST]),new URL(PROVIDER_VERSION_HOST).hostname);
 for(const list of [[],["https://evil.example.com"],
   [PROVIDER_VERSION_HOST+"?redirect=1"],
   [PROVIDER_VERSION_HOST,PROVIDER_VERSION_HOST]]){
  assert.equal(versionHost(list),null);
 }
});
test("one and ONLY one Legacy POST promotes while Modern stays unchanged, native HTTP passes",async()=>{
 const {r,m}=await run();
 assert.equal(r.status,"PASS_BOTH_SHADOW_CANONICAL_LIVE_WITH_ONLY_LEGACY_MUTATION");
 assert.equal(r.legacy_promotion_verified,true);
 assert.deepEqual(m.writes,[{script:LEGACY.name,version:LEGACY.target}]);
 assert(r.workers[0].no_deployment_action);
 assert(r.workers[1].live_http.verified);
 assert.equal(r.production_worker_changed,false);
 assert.equal(r.production_d1_mutated,false);
 assert.equal(r.shadow_d1_mutated,false);
 assert.equal(r.canary_hold_removed,false);
 assert(!JSON.stringify(r).includes(TOKEN));
 assert(!JSON.stringify(r).includes(e().CLOUDFLARE_API_TOKEN));
 assert(m.calls.filter(x=>x.method==="POST").every(x=>
    x.path.includes("/workers/scripts/"+LEGACY.name+"/deployments")));
});
test("eventually consistent provider list is polled rather than immediate rollback",async()=>{
 const {r,m}=await run({lagReads:3});
 assert.equal(r.status,"PASS_BOTH_SHADOW_CANONICAL_LIVE_WITH_ONLY_LEGACY_MUTATION");
 assert(r.deployment_observations.length>=4);
 assert.equal(m.writes.length,1);
});
test("no write when independent Modern is no longer at expected verified version",async()=>{
 const {r,m}=await run({modernDrift:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/MODERN_VERIFIED_CANONICAL_NO_LONGER_LIVE/);
 assert.equal(m.writes.length,0);
});
test("legacy concurrent drift preflight refuses write",async()=>{
 const {r,m}=await run({legacyDrift:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/LEGACY_EXPECTED_OLD_100_NO_LONGER_ACTIVE/);
 assert.equal(m.writes.length,0);
});
test("missing immutable Legacy version URL prevents POST",async()=>{
 const {r,m}=await run({missingVersionUrl:true});
 assert.equal(r.status,"HOLD");
 assert.equal(m.writes.length,0);
});
test("POST provider denial returns HOLD, no guessed second deployment or rollback",async()=>{
 const {r,m}=await run({failPost:true});
 assert.equal(r.status,"HOLD");
 assert.equal(r.provider_post_attempted,true);
 assert.equal(r.provider_post_acknowledged,false);
 assert.equal(m.writes.length,1);
 assert.equal(r.canary_hold_removed,false);
});
test("provider remaining old after bounded reads is manual reconciliation, not blind retry",async()=>{
 const {r,m}=await run({neverMoves:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/POST_RESULT_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED/);
 assert.equal(r.deployment_observations.length,10);
 assert.equal(m.writes.length,1);
});
test("new Legacy version with non-JSON ordinary host remains HOLD, no second POST",async()=>{
 const {r,m}=await run({legacyHttpFails:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/LEGACY_ORDINARY_HOST_HTTP_NOT_VERIFIED/);
 assert.equal(m.writes.length,1);
});
test("manual protected workflow cannot deploy anything other than the scoped Legacy script",()=>{
 const y=readFileSync(".github/workflows/step3-legacy-only-canonical-completion.yml","utf8");
 assert.match(y,/workflow_dispatch:/);
 assert.match(y,/PROMOTE_ONLY_VERIFIED_LEGACY_SHADOW_AFTER_MODERN_PROOF/);
 assert.match(y,/environment: production/);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(y,/git ls-remote/);
 assert.doesNotMatch(y,/continue-on-error: true|wrangler deploy|versions deploy|migrations apply/);
});
