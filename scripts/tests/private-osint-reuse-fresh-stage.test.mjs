import test from "node:test";
import assert from "node:assert/strict";
import {hasFreshProtectedSourceArtifact,main} from "../ops/private-osint-reuse-fresh-stage.mjs";
const now=Date.parse("2026-10-27T20:25:00.000Z");
const sha="a".repeat(40),token="b".repeat(32);
const repo="blocknine0/geomacro",name="geomacro-encrypted-private-osint-held";
const artifact=(opts={})=>({
 name,id:123,expired:false,size_in_bytes:61900,
 created_at:new Date(now-6*60000).toISOString(),
 workflow_run:{id:40575598220,head_branch:"main",head_sha:sha},
 ...opts,
});
const run=(opts={})=>({
 name:"Global OSINT to Website Intelligence (15-Minute Discovery)",
 conclusion:"success",head_sha:sha,head_branch:"main",
 head_repository:{full_name:repo},event:"schedule",...opts,
});
function fetcher(a=[artifact()],r=run(),responseCode=200){
 const calls=[];
 return {
  calls,
  async fetchImpl(url,init){
   calls.push({url,init});
   assert.ok(url.startsWith("https://api.github.com/repos/"+repo+"/actions/"));
   assert.equal(init.method,"GET");
   assert.equal(init.redirect,"error");
   assert.equal(init.headers.Authorization,"Bearer "+token);
   if(responseCode!==200)return {status:responseCode};
   if(url.includes("/artifacts?"))return {status:200,json:async()=>({
    total_count:a.length,artifacts:a,
   })};
   if(url.includes("/runs/40575598220"))return {status:200,json:async()=>r};
   throw Error("UNEXPECTED_GITHUB_GET");
  },
 };
}
test("same MAIN SHA current 15m sealed artifact reuses the SAME recent raw source fetch",async()=>{
 const {calls,fetchImpl}=fetcher();
 assert.equal(await hasFreshProtectedSourceArtifact({now,sha,token,fetchImpl}),true);
 assert.equal(calls.length,2);
 const receipt=await main({now,fetchImpl,
  env:{GITHUB_REPOSITORY:repo,GITHUB_REF:"refs/heads/main",
   GITHUB_SHA:sha,GH_TOKEN:token,GEOMACRO_OSINT_SPOOL_ADMISSION:"HELD",
   GITHUB_EVENT_NAME:"schedule"}});
 assert.deepEqual(receipt,{collect:false,shared:true});
 assert.equal(calls.length,4);
});
test("missing, stale, SHA mismatched, wrong actor or non-success artifact always falls back to collecting",async()=>{
 for(const cfg of [
  {a:[]},
  {a:[artifact({created_at:new Date(now-25*60000).toISOString()})]},
  {a:[artifact({workflow_run:{id:40575598220,head_branch:"main",head_sha:"b".repeat(40)}})]},
  {a:[artifact({workflow_run:{id:40575598220,head_branch:"feature",head_sha:sha}})]},
  {a:[artifact({expired:true})]},
  {a:[artifact({size_in_bytes:0})]},
  {r:run({name:"Private OSINT Encrypted Holding When D1 Quota Held"})},
  {r:run({conclusion:"failure"})},
  {r:run({head_repository:{full_name:"attacker/fork"}})},
  {r:run({head_sha:"f".repeat(40)})},
  {r:run({event:"pull_request"})},
 ]){
  const {fetchImpl}=fetcher(cfg.a??[artifact()],cfg.r??run());
  assert.equal(await hasFreshProtectedSourceArtifact({now,sha,token,fetchImpl}),false);
 }
});
test("GitHub API 403, missing token or tampered metadata can never suppress raw source intake",async()=>{
 const blocked=fetcher([artifact()],run(),403);
 assert.equal(await hasFreshProtectedSourceArtifact({now,sha,token,
  fetchImpl:blocked.fetchImpl}),false);
 for(const input of [null,{},123,"not a token"])
  assert.equal(await hasFreshProtectedSourceArtifact({
   now,sha,token:input,fetchImpl:async()=>{throw Error("SHOULD_NOT_FETCH")}
  }),false);
 const broken=fetcher([artifact({workflow_run:{id:null,head_branch:"main",head_sha:sha}})]);
 assert.equal(await hasFreshProtectedSourceArtifact({now,sha,token,
  fetchImpl:broken.fetchImpl}),false);
});
test("skip optimization cannot be invoked from fork/PR/D1 available contexts",async()=>{
 const env={GITHUB_REPOSITORY:repo,GITHUB_REF:"refs/heads/main",
  GITHUB_SHA:sha,GH_TOKEN:token,GEOMACRO_OSINT_SPOOL_ADMISSION:"HELD",
  GITHUB_EVENT_NAME:"schedule"};
 for(const bad of [
  {...env,GITHUB_REF:"refs/heads/feature"},
  {...env,GITHUB_REPOSITORY:"attacker/repo"},
  {...env,GEOMACRO_OSINT_SPOOL_ADMISSION:"CRITICAL_TRUE"},
  {...env,GITHUB_EVENT_NAME:"pull_request"},
 ])await assert.rejects(()=>main({env:bad,now}),/PRIVATE_OSINT_REUSE_PROTECTED_HELD_MAIN_ONLY/);
});
