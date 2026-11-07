import test from "node:test";
import assert from "node:assert/strict";
import {assessActualD1Deploy}
 from "../ops/verify-actual-d1-deploy-receipt.mjs";
const sha="a".repeat(40);
const event={
 action:"completed",workflow_run:{
  conclusion:"success",event:"push",head_branch:"main",
  head_repository:{full_name:"blocknine0/geomacro"},head_sha:sha,
 },
};
const jobs=[{name:"d1-v2-canary-release-hold",
 status:"completed",conclusion:"success"},
 {name:"bootstrap-deploy-accept",status:"completed",conclusion:"success"}];
test("real exact-main successful bootstrap deploy alone opens B2 parity gate",()=>{
 assert.deepEqual(assessActualD1Deploy({event,jobs,mainSha:sha}),
  {admitted:true,reason:"EXACT_MAIN_BOOTSTRAP_DEPLOY_JOB_SUCCESS"});
});
test("green workflow with held/skipped Worker deploy never opens expensive B2 jobs",()=>{
 for(const status of ["skipped","failure","cancelled",null]){
  const p=assessActualD1Deploy({event,jobs:[
   jobs[0],{...jobs[1],conclusion:status}],mainSha:sha});
  assert.equal(p.admitted,false);
  assert.equal(p.reason,"PRODUCTION_BOOTSTRAP_DEPLOY_SKIPPED_OR_FAILED");
 }
});
test("PR, stale SHA, wrong repository, missing API page or duplicate job is denied",()=>{
 const altered=[
  {event:{...event,workflow_run:{...event.workflow_run,event:"pull_request"}},jobs,mainSha:sha},
  {event,jobs,mainSha:"b".repeat(40)},
  {event:{...event,workflow_run:{...event.workflow_run,
    head_repository:{full_name:"outsider/fork"}}},jobs,mainSha:sha},
  {event,jobs:[...jobs,jobs[1]],mainSha:sha},
  {event,jobs:[],mainSha:sha},
  {event:{...event,action:"requested"},jobs,mainSha:sha},
 ];
 for(const input of altered)
  assert.equal(assessActualD1Deploy(input).admitted,false);
});
