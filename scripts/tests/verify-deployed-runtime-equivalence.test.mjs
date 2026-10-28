import test from "node:test";
import assert from "node:assert/strict";
import {assessDeployedRuntimeCompare,verifyDeployedRuntimeEquivalence}
 from "../ops/verify-deployed-runtime-equivalence.mjs";
const base="a".repeat(40),head="b".repeat(40);
const diff={status:"ahead",ahead_by:2,behind_by:0,total_commits:2,files:[
 {filename:"scripts/ops/d1-launch-hourly-observer.mjs",status:"added"},
 {filename:".github/workflows/d1-launch-72h-observatory.yml",status:"added"},
 {filename:"scripts/ops/verify-deployed-runtime-equivalence.mjs",status:"added"},
]};
test("strict GitHub ancestry plus exact observability-only file list proves unchanged Worker",()=>{
 const x=assessDeployedRuntimeCompare(diff,base,head);
 assert.equal(x.verified,true);
 assert.equal(x.source_runtime_unchanged_by_all_intervening_commits,true);
 assert.equal(x.exact_sha_equal,false);
 assert.equal(x.observability_only_changed_files,3);
});
test("no Worker, PREDGE, runtime config or unknown code modification can be hidden",()=>{
 for(const f of ["workers/control-plane/src/index.mjs",
  "workers/control-plane/src/predge-research-derived-news.mjs",
  ".github/workflows/deploy-d1-control-plane.yml",
  "scripts/ops/plan-d1-bundled-work.mjs","package.json"]){
   const value=assessDeployedRuntimeCompare({...diff,files:[
    ...diff.files,{filename:f,status:"modified"}]},base,head);
   assert.equal(value.verified,false,f);
  }
});
test("shallow/truncated/ambiguous GitHub comparison fails closed",()=>{
 for(const v of [
  {...diff,status:"diverged"},{...diff,behind_by:1},
  {...diff,ahead_by:101},{...diff,total_commits:3},
  {...diff,files:[diff.files[0],diff.files[0]]},
  {...diff,files:[{filename:"config/github-workflow-inventory.v1.json",status:"added"}]}
 ])assert.equal(assessDeployedRuntimeCompare(v,base,head).verified,false);
});
test("authenticated remote compare verifies unchanged source without D1 calls",async()=>{
 let calls=0;
 const fetchImpl=async(u,options)=>{calls++;
  assert.ok(u.includes("/compare/"+base+"..."+head));
  assert.ok(options.headers.Authorization.startsWith("Bearer "));
  return Response.json(diff);
 };
 const x=await verifyDeployedRuntimeEquivalence({fetchImpl,env:{GH_TOKEN:"x".repeat(30)},
  deployedSha:base,mainSha:head});
 assert.equal(x.verified,true);
 assert.equal(calls,1);
 assert.equal((await verifyDeployedRuntimeEquivalence({env:{},deployedSha:base,mainSha:head})).verified,false);
 assert.equal((await verifyDeployedRuntimeEquivalence({env:{},deployedSha:base,mainSha:base})).verified,true);
});
