import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assertPromotionScope,strictVersionHost,probeHttp,promoteShadowOnly}
 from "../ops/promote-step3-shadow-verified-canonical.mjs";

const ACCOUNT="fddd57d28199bad07a768445e7237693";
const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const SOURCE="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const TOKEN="a".repeat(64);
const W=[
 {name:"geomacro-step3-shadow",
  old:"48680b70-c41c-4af9-9e70-497213471dbb",
  next:"1a49e55d-7c82-42b6-9f30-250423d9732c",r2:true},
 {name:"geomacro-step3-shadow-legacy",
  old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  next:"f72738eb-40ff-4e48-ba67-1d5c004a989d",r2:false}
];
const env=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"b".repeat(40),
 SHADOW_PROMOTION_APPROVAL:"PROMOTE_TWO_PINNED_CANONICAL_SHADOW_VERSIONS_ONLY",
 CLOUDFLARE_ACCOUNT_ID:ACCOUNT,CLOUDFLARE_API_TOKEN:"c".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED:"YES",
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:W[0].name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:W[1].name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:TOKEN
});
function bindings(w,{wrongDb=false}={}){
 return [
  {name:"DB",type:"d1",database_id:wrongDb?PROD:SHADOW},
  {name:"CONTROL_PLANE_TOKEN",type:"secret_text"},
  {name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:SOURCE},
  ...(w.r2?[{name:"PHASE2H_PRIVATE_R2",type:"r2_bucket",
   bucket_name:"geomacro-step3-shadow-private"}]:[])
 ];
}
function fake({wrongDb=false,maliciousUrl=false,
 failSecondPost=false,badPublicAfter=false,missingToken=false,
 oldDeploymentChanged=false,concurrentChange=false}={}){
 const deployed=new Map(W.map(w=>[w.name,oldDeploymentChanged?w.next:w.old]));
 const calls=[],writes=[],counts=new Map();
 const fetchImpl=async (url,opts)=>{
  const u=new URL(url);
  calls.push({host:u.hostname,path:u.pathname,method:opts.method});
  if(u.hostname==="api.cloudflare.com"){
   const p=u.pathname,db=p.split("/").at(-1);
   if(p.includes("/d1/database/")){
    assert.equal(opts.method,"GET");
    return Response.json({success:true,result:{uuid:db,name:
     db===PROD?"geomacro-control-plane":"geomacro-d1-publisher-shadow"}});
   }
   const w=W.find(x=>p.includes("/workers/scripts/"+x.name+"/")||
      p.includes("/workers/workers/"+x.name+"/"));
   assert(w,"Cloudflare API may only access pinned Shadow scripts");
   if(opts.method==="POST"){
    assert(p.endsWith("/deployments"));
    const b=JSON.parse(opts.body);
    assert.equal(b.strategy,"percentage");
    assert.equal(b.versions.length,1);
    assert.equal(b.versions[0].percentage,100);
    assert([w.old,w.next].includes(b.versions[0].version_id));
    writes.push({name:w.name,id:b.versions[0].version_id});
    if(failSecondPost&&w.name===W[1].name&&b.versions[0].version_id===w.next)
      return Response.json({success:false,result:null},{status:409});
    deployed.set(w.name,b.versions[0].version_id);
    return Response.json({success:true,result:{id:"4cb62b74-3b93-4697-9e01-a985345c38ae"}});
   }
   assert.equal(opts.method,"GET");
   if(p.endsWith("/deployments")){
    const n=(counts.get(w.name)??0)+1;counts.set(w.name,n);
    if(concurrentChange&&w.name===W[1].name&&n===2)
      deployed.set(w.name,"d846f11a-24e8-40c7-bb11-489b794a1cb9");
    return Response.json({success:true,result:{deployments:[{id:"74d6e80c-d3a2-4f41-b4cb-52b213d6e56a",
     versions:[{version_id:deployed.get(w.name),percentage:100}]}]}});
   }
   if(p.endsWith("/subdomain"))return Response.json({success:true,result:{enabled:true,previews_enabled:true}});
   if(p.endsWith("/settings"))return Response.json({success:true,result:{bindings:bindings(w)}});
   if(p.includes("/workers/workers/")&&p.endsWith("/versions/"+w.next)){
    return Response.json({success:true,result:{id:w.next,main_module:"index.js",
     urls:[maliciousUrl?"https://untrusted.example.com":
      "https://cafe1234-"+w.name+".daspallab202391.workers.dev"]}});
   }
   if(p.endsWith("/versions/"+w.next))return Response.json({success:true,
    result:{id:w.next,resources:{bindings:bindings(w,{wrongDb}),
     script_runtime:{compatibility_date:"2026-10-03"}}}});
   if(p.endsWith("/versions/"+w.old))return Response.json({success:true,
    result:{id:w.old,resources:{bindings:bindings(w)}}});
   throw Error("Unmocked provider path "+p);
  }
  assert.equal(opts.method,"GET");
  const immutable=u.hostname.startsWith("cafe1234-");
  const w=W.find(x=>u.hostname===(immutable?"cafe1234-":"")+x.name+
   ".daspallab202391.workers.dev");
  assert(w,"never call untrusted host");
  const aligned=immutable||deployed.get(w.name)===w.next;
  const kind=u.pathname==="/v1/public/intelligence-publications"?"pub":
    opts.headers.Authorization==="Bearer invalid"?"invalid":"valid";
  if(kind==="valid")assert.equal(opts.headers.Authorization,"Bearer "+TOKEN);
  if(badPublicAfter&&!immutable&&w.name===W[0].name)
    return new Response("not found",{status:404,headers:{"content-type":"text/plain"}});
  if(!aligned)return new Response("old worker 404",{status:404,headers:{"content-type":"text/plain"}});
  if(kind==="pub")return Response.json({ok:false,error:"NOT_FOUND"},{status:404});
  if(kind==="invalid")return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  return Response.json({ok:false,error:"P0B_STATUS_QUERY_INVALID"},{status:400});
 };
 return {fetchImpl,deployed,calls,writes};
}
test("requires exact protected main, owner approval, separated D1 and shadow bearer",()=>{
 assert.equal(assertPromotionScope(env(),true),true);
 for(const patch of [
  {GITHUB_REF:"refs/heads/test"},
  {SHADOW_PROMOTION_APPROVAL:"NO"},
  {D1_DATABASE_ID:SHADOW},
  {GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:"x"},
  {GITHUB_EVENT_NAME:"pull_request"},
  {CLOUDFLARE_ACCOUNT_ID:"invalid"}
 ])assert.throws(()=>assertPromotionScope({...env(),...patch},true),
  /EXACT_MAIN_OWNER_APPROVAL/);
 assert.throws(()=>assertPromotionScope(env(),false),/EXACT_MAIN_OWNER_APPROVAL/);
});
test("immutable version URLs reject external origins, redirects and duplicates",()=>{
 const h="https://cafe1234-"+W[0].name+".daspallab202391.workers.dev";
 assert.equal(strictVersionHost(W[0],[h]).ok,true);
 for(const urls of [[h+"?bad=1"],["https://evil.example.com"],[h,h],
  new Array(9).fill(h)]){
   assert.equal(strictVersionHost(W[0],urls).ok,false);
 }
});
test("both Shadow-only deployments promote to pinned 100% after candidate auth, ordinary host 404/401/400",async()=>{
 const m=fake();
 const r=await promoteShadowOnly({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
  headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"PASS_BOTH_SHADOW_ONLY_WORKERS_CANONICAL_LIVE");
 assert.deepEqual(m.writes,W.map(w=>({name:w.name,id:w.next})));
 assert(r.workers.every(w=>w.live_404_401_400_verified&&w.promoted_100_percent));
 assert.equal(r.production_worker_changed,false);
 assert.equal(r.production_d1_mutated,false);
 assert.equal(r.b2_or_r2_written,false);
 assert.equal(r.canary_hold_removed,false);
 assert.equal(r.shadow_traffic_changed,true);
 assert(m.calls.every(c=>c.method==="GET"||c.method==="POST"));
 assert(m.calls.filter(c=>c.method==="POST").every(c=>
  W.some(w=>c.path==="/client/v4/accounts/"+ACCOUNT+
   "/workers/scripts/"+w.name+"/deployments")));
 assert(!JSON.stringify(r).includes(TOKEN));
 assert(!JSON.stringify(r).includes(env().CLOUDFLARE_API_TOKEN));
});
test("wrong Shadow D1 binding blocks before any Worker deployment",async()=>{
 const m=fake({wrongDb:true});
 const r=await promoteShadowOnly({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
  headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/SHADOW_VS_PRODUCTION_D1_ISOLATION_FAILURE/);
 assert.equal(m.writes.length,0);
});
test("malicious version URL cannot trigger external request nor deployment",async()=>{
 const m=fake({maliciousUrl:true});
 const r=await promoteShadowOnly({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
  headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert.equal(m.writes.length,0);
 assert(!m.calls.some(c=>c.host==="untrusted.example.com"));
});
test("second Worker deployment error rolls first Worker back to exact old version",async()=>{
 const m=fake({failSecondPost:true});
 const r=await promoteShadowOnly({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
  headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert.equal(r.rollback_fully_verified,true);
 assert.equal(r.shadow_traffic_changed,false);
 assert.equal(m.deployed.get(W[0].name),W[0].old);
 assert.equal(m.deployed.get(W[1].name),W[1].old);
 assert(m.writes.some(x=>x.name===W[0].name&&x.id===W[0].old));
});
test("bad ordinary hostname HTTP contract triggers rollback, never PASS",async()=>{
 const m=fake({badPublicAfter:true});
 const r=await promoteShadowOnly({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
  headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert.equal(r.rollback_fully_verified,true);
 assert.equal(m.deployed.get(W[0].name),W[0].old);
 assert.equal(m.writes.length,2);
 assert.equal(r.canary_hold_removed,false);
});
test("unreviewed active Worker deployment drift aborts before mutating second Worker",async()=>{
 const m=fake({concurrentChange:true});
 const r=await promoteShadowOnly({env:env(),fetchImpl:m.fetchImpl,holdPresent:true,
  headCheck:()=>env().GITHUB_SHA});
 assert.equal(r.status,"HOLD");
 assert.equal(r.rollback_fully_verified,true);
 assert.equal(m.deployed.get(W[0].name),W[0].old);
 assert(!m.writes.some(x=>x.name===W[1].name));
});
test("HTTP probe only checks 404/401/400 paths and safe allowlisted host",async()=>{
 await assert.rejects(()=>probeHttp(W[0],{host:"evil.example.com",kind:"PUBLIC_404",
  fetchImpl:()=>{throw Error("network must not happen")}}),/HTTP_PROBE_HOST_NOT_PINNED/);
});
test("workflow requires explicit protected main approval and no production deploy",()=>{
 const y=readFileSync(".github/workflows/step3-shadow-canonical-protected-promote.yml","utf8");
 assert.match(y,/workflow_dispatch:/);
 assert.match(y,/PROMOTE_TWO_PINNED_CANONICAL_SHADOW_VERSIONS_ONLY/);
 assert.match(y,/environment: production/);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(y,/git ls-remote/);
 assert.doesNotMatch(y,/continue-on-error: true|migrations apply|wrangler deploy|versions deploy/);
});
