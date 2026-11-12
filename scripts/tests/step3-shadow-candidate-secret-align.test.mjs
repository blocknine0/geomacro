import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {alignShadowCandidateSecrets,validateSecretCandidateScope,providerVersionHost}
 from "../ops/align-step3-shadow-candidate-secret-versions.mjs";

const PROD="db057ca9-9f6e-4957-ac28-144f3b798f9b";
const SHADOW="c4add153-229d-412a-b1bd-489526b7e02f";
const SOURCE="593a3c8b96f8a59005bee96ac76df57f07484e1e";
const TOKEN="b".repeat(64);
const W=[
 {name:"geomacro-step3-shadow",old:"48680b70-c41c-4af9-9e70-497213471dbb",
  staged:"565118e5-781f-4a3a-ad73-d304d4876e8a",r2:true,
  next:"f1e97688-0201-4cb3-8455-4bb7b582a819"},
 {name:"geomacro-step3-shadow-legacy",old:"73437c7b-83b2-44df-bbc5-87be1df25a9b",
  staged:"214742c7-bc20-4ff8-bbed-cc3b41604aff",r2:false,
  next:"c3a8d480-f55c-4233-9b2c-c33162c4072a"}
];
const e=()=>({
 GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:"a".repeat(40),
 SHADOW_SECRET_CANDIDATE_APPROVAL:
  "ALIGN_TWO_IMMUTABLE_SHADOW_CANDIDATE_SECRETS_NO_TRAFFIC",
 CLOUDFLARE_ACCOUNT_ID:"fddd57d28199bad07a768445e7237693",
 CLOUDFLARE_API_TOKEN:"r".repeat(40),
 D1_DATABASE_ID:PROD,GEOMACRO_D1_SHADOW_DATABASE_ID:SHADOW,
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"geomacro-step3-shadow-private",
 GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:TOKEN,
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:W[0].name+".daspallab202391.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:
  W[1].name+".daspallab202391.workers.dev"
});
function bindings(w,{wrongDb=false}={}){
 return [
  {name:"DB",type:"d1",database_id:wrongDb?PROD:SHADOW},
  {name:"CONTROL_PLANE_TOKEN",type:"secret_text"},
  {name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:SOURCE},
  ...(w.r2?[{name:"PHASE2H_PRIVATE_R2",type:"r2_bucket",
    bucket_name:"geomacro-step3-shadow-private"}]:[]),
  {name:"PHASE2H_R2_REFERENCE_HMAC_KEY",type:"secret_text"}
 ];
}
function mock({wrongDb=false,staleLatest=false,validBefore=false,
 activeVersion=null,
 failSecond=false,invalidAfter=false,badCandidateUrl=false}={}){
 const calls=[],writes=[],latest=new Map(W.map(w=>[w.name,w.staged]));
 const runtime={compatibility_date:"2026-10-03",compatibility_flags:["nodejs_compat"]};
 const fetchImpl=async (url,opts)=>{
  const u=new URL(url);
  calls.push({url,method:opts.method,path:u.pathname,body:opts.body});
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
   assert(w,"Unexpected provider Worker");
   if(p.endsWith("/versions")){
    return Response.json({success:true,result:{items:[
      {id:staleLatest?"ffffffff-ffff-4fff-afff-ffffffffffff":latest.get(w.name)}
    ]}});
   }
   if(p.endsWith("/deployments"))return Response.json({success:true,result:{
    deployments:[{versions:[{version_id:activeVersion??w.old,percentage:100}]}]}});
   if(p.endsWith("/versions/"+w.staged)||p.endsWith("/versions/"+w.next)){
    const id=p.split("/").at(-1);
    const resource={id,resources:{bindings:bindings(w,{wrongDb}),
      script_runtime:runtime,script:{handlers:["fetch"]}}};
    if(p.includes("/workers/workers/")){
     return Response.json({success:true,result:{
      id,main_module:"index.js",urls:badCandidateUrl?
       ["https://evil.invalid"]:[
        "https://deadbeef-"+w.name+".daspallab202391.workers.dev"]}});
    }
    return Response.json({success:true,result:resource});
   }
   throw Error("Unmocked provider endpoint "+p);
  }
  assert(u.hostname.startsWith("deadbeef-"));
  const w=W.find(x=>u.hostname==="deadbeef-"+x.name+
   ".daspallab202391.workers.dev");
  assert(w,"Never request unknown host");
  const auth=opts.headers.Authorization;
  if(u.pathname==="/v1/public/intelligence-publications"){
   return Response.json({ok:false,error:"NOT_FOUND"},{status:404});
  }
  assert.equal(u.pathname,"/v1/internal/p0b/status");
  if(auth==="Bearer invalid")return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
  assert.equal(auth,"Bearer "+TOKEN);
  const aligned=latest.get(w.name)===w.next;
  if((aligned&&!invalidAfter)||(!aligned&&validBefore))
   return Response.json({ok:false,error:"P0B_STATUS_QUERY_INVALID"},{status:400});
  return Response.json({ok:false,error:"UNAUTHORIZED"},{status:401});
 };
 const run=(bin,args,opts)=>{
  assert.equal(bin,"npx");
  assert.deepEqual(args.slice(0,5),
   ["-y","wrangler@4.136.3","versions","secret","put"]);
  assert.equal(args[5],"CONTROL_PLANE_TOKEN");
  const name=args[args.indexOf("--name")+1];
  assert(W.some(w=>w.name===name));
  assert.equal(opts.input,TOKEN+"\n");
  assert.deepEqual(opts.stdio,["pipe","pipe","pipe"]);
  assert(!args.includes("deploy"));
  writes.push(name);
  if(name===W[1].name&&failSecond)throw Error("secret input must never be printed");
  latest.set(name,W.find(w=>w.name===name).next);
 };
 return {fetchImpl,run,calls,writes,latest};
}
test("strict approved main and isolated token guards",()=>{
 assert.equal(validateSecretCandidateScope(e(),true),true);
 for(const patch of [{GITHUB_REF:"refs/heads/audit"},
  {SHADOW_SECRET_CANDIDATE_APPROVAL:"NO"},
  {D1_DATABASE_ID:SHADOW},
  {GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:"bad"},
  {GITHUB_EVENT_NAME:"pull_request"}])
  assert.throws(()=>validateSecretCandidateScope({...e(),...patch},true),
   /OWNER_SECRET_UNVERIFIED/);
 assert.throws(()=>validateSecretCandidateScope(e(),false),/OWNER_SECRET_UNVERIFIED/);
 assert.throws(()=>validateSecretCandidateScope({...e(),CONTROL_PLANE_TOKEN:TOKEN},true),
  /SECRET_REUSE_PROHIBITED/);
});
test("only matching provider URL is accepted",()=>{
 const h="https://deadbeef-"+W[0].name+".daspallab202391.workers.dev";
 assert.equal(providerVersionHost([h],W[0]).ok,true);
 assert.equal(providerVersionHost([h+"?param=1"],W[0]).ok,false);
 assert.equal(providerVersionHost(["https://evil.invalid"],W[0]).ok,false);
 assert.equal(providerVersionHost([h,h],W[0]).ok,false);
});
test("two secret-aligned immutable versions preserve all bindings and old traffic",async()=>{
 const m=mock();
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"PASS_TWO_SECRET_ALIGNED_CANONICAL_CANDIDATES_ZERO_TRAFFIC");
 assert.deepEqual(m.writes,W.map(x=>x.name));
 assert.equal(r.workers.length,2);
 assert(r.workers.every(w=>w.status==="PASS_IMMUTABLE_SECRET_ALIGNED_HTTP"));
 assert(r.workers.every(w=>w.http_probes.length===3&&w.http_probes.every(p=>p.verified)));
 assert(r.workers.every(w=>w.live_traffic_unchanged&&w.bindings_runtime_parity_verified));
 assert.equal(r.shadow_traffic_changed,false);
 assert.equal(r.production_d1_mutated,false);
 assert.equal(r.b2_or_r2_written,false);
 assert.equal(r.canary_hold_removed,false);
 assert.equal(r.payments_authorized,false);
 assert(m.calls.every(x=>x.method==="GET"&&!x.path.endsWith("/query")));
 assert(!JSON.stringify(r).includes(TOKEN));
 assert(!JSON.stringify(r).includes(e().CLOUDFLARE_API_TOKEN));
});
test("bearer-sync deployment UUID is accepted as the captured unchanged live baseline",async()=>{
 const activeVersion="f1e97688-0201-4cb3-8455-4bb7b582a819";
 const m=mock({activeVersion});
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"PASS_TWO_SECRET_ALIGNED_CANONICAL_CANDIDATES_ZERO_TRAFFIC");
 assert(m.writes.length===2);
});
test("post-upload candidate must be resolvable from provider version listing",async()=>{
 const m=mock({staleLatest:true});
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/PROVIDER_NETWORK_UNAVAILABLE/);
 assert.equal(m.writes.length,1);
});
test("wrong D1 ID is blocked before any secret write",async()=>{
 const m=mock({wrongDb:true});
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/D1_ISOLATION_VIOLATION/);
 assert.equal(m.writes.length,0);
});
test("if auth was already valid, do not rotate Shadow token unnecessarily",async()=>{
 const m=mock({validBefore:true});
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"HOLD");
 assert.match(r.code,/EXPECTED_SHADOW_BEARER_MISMATCH_NOT_PROVEN/);
 assert.equal(m.writes.length,0);
});
test("bad provider version URL holds before any secret mutation",async()=>{
 const m=mock({badCandidateUrl:true});
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"HOLD");
 assert.equal(m.writes.length,0);
});
test("partial second upload remains HOLD with first candidate receipt",async()=>{
 const m=mock({failSecond:true});
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"HOLD");
 assert.equal(r.workers.length,1);
 assert.equal(r.workers[0].status,"PASS_IMMUTABLE_SECRET_ALIGNED_HTTP");
 assert.equal(r.shadow_traffic_changed,false);
 assert.match(r.code,/VERSIONS_SECRET_PUT_REJECTED/);
 assert(!JSON.stringify(r).includes(TOKEN));
});
test("if new bearer still fails, never claim physical PASS",async()=>{
 const m=mock({invalidAfter:true});
 const r=await alignShadowCandidateSecrets({env:e(),fetchImpl:m.fetchImpl,
  run:m.run,headCheck:()=>e().GITHUB_SHA,holdPresent:true});
 assert.equal(r.status,"HOLD");
 assert.equal(r.workers.length,1);
 assert.equal(r.workers[0].status,"HOLD_HTTP_CONTRACT");
 assert.match(r.code,/NEW_VERSION_PHYSICAL_HTTP_NOT_VERIFIED/);
});
test("workflow requires protected manual dispatch, never deploy",()=>{
 const y=readFileSync(".github/workflows/step3-shadow-candidate-secret-align.yml","utf8");
 assert.match(y,/workflow_dispatch:/);
 assert.match(y,/ALIGN_TWO_IMMUTABLE_SHADOW_CANDIDATE_SECRETS_NO_TRAFFIC/);
 assert.match(y,/environment: production/);
 assert.match(y,/test -f config\/d1-hotspot-v2-canary\.hold/);
 assert.match(y,/git ls-remote/);
 assert.doesNotMatch(y,/wrangler deploy|versions deploy|continue-on-error: true|migrations apply/);
});
