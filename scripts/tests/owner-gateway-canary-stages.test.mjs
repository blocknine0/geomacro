import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 planOwnerIssueDispatch,
 OWNER_ISSUE_DISPATCH_TITLE,
 OWNER_ISSUE_CANARY_SCHEMA,
} from "../lib/owner-issue-dispatch-contract.mjs";
import {executeOwnerIssueDispatch} from "../ops/owner-issue-dispatch-gateway.mjs";
const SHA="f".repeat(40),OTHER="e".repeat(40);
const BASELINE="11111111-1111-4111-8111-111111111111";
const CANDIDATE="22222222-2222-4222-8222-222222222222";
const NOW=new Date("2026-11-10T17:00:00.000Z");
const env=()=>({
 GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"issues",
 GITHUB_ACTOR:"blocknine0",GITHUB_SHA:SHA,GITHUB_RUN_ID:"42860000001"
});
const configs={
 "minimum-risk-facts-backup":{
  authorization:"OWNER_AUTHORIZE_BROTLI11_RISK_MINIMUM_PRIVATE_R2_NO_B2_NO_FUNDS",
  verify_hot50:false,
  target:"phase2h-private-r2-b2-quota-backup.yml",
  inputs:{approval:"BACKUP_PHASE2H_PRIVATE_R2_NO_B2_OR_FUNDS"}
 },
 "candidate-upload":{
  authorization:"OWNER_AUTHORIZE_ZERO_TRAFFIC_EXACT_MAIN_WORKER_CANDIDATE_NO_FUNDS",
  verify_hot50:false,
  target:"geomacro-optimized-worker-candidate.yml",
  inputs:{approval:"UPLOAD_EXACT_MAIN_ZERO_TRAFFIC_NO_FUNDS"}
 },
 "canary-rollout":{
  authorization:"OWNER_AUTHORIZE_PROTECTED_HOT50_0_TO_100_NO_FUNDS",
  verify_hot50:true,
  target:"geomacro-protected-hot50-worker-rollout.yml",
  inputs:{baseline_version_id:BASELINE,candidate_version_id:CANDIDATE,
   confirmation:"PROMOTE_HOT50_NO_FUNDS",stage2_run_id:"42860000010"}
 },
 "canary-hold-review":{
  authorization:"OWNER_AUTHORIZE_READ_ONLY_CANARY_HOLD_REVIEW_NO_FUNDS",
  verify_hot50:true,
  target:"canary-promotion.yml",
  inputs:{operation:"release-hold",baseline_version_id:BASELINE,
   candidate_version_id:CANDIDATE,
   confirmation:"REVIEW_HOT50_HOLD_NO_FUNDS",
   stage2_run_id:"42860000010",promotion_run_id:"42860000020"}
 }
};
function fixture(intent){
 const c=configs[intent];
 if(!c)throw Error("test config missing");
 const request={
  schema:OWNER_ISSUE_CANARY_SCHEMA,intent,source_sha:SHA,
  authorization:c.authorization,verify_hot50:c.verify_hot50,
  ...(["candidate-upload","minimum-risk-facts-backup"].includes(intent)?{}:
   {baseline_version_id:BASELINE,candidate_version_id:CANDIDATE,
    stage2_run_id:"42860000010"}),
  ...(intent==="canary-hold-review"?
   {promotion_run_id:"42860000020"}:{})
 };
 const event={
  action:"opened",repository:{full_name:"blocknine0/geomacro"},
  sender:{login:"blocknine0",type:"User"},
  issue:{
   number:3858,state:"open",created_at:"2026-11-10T16:59:00.000Z",
   updated_at:"2026-11-10T16:59:00.000Z",
   author_association:"OWNER",
   user:{login:"blocknine0",type:"User"},
   title:OWNER_ISSUE_DISPATCH_TITLE,body:JSON.stringify(request)
  }
 };
 return {event,request};
}
function plan(intent){return planOwnerIssueDispatch({
 event:fixture(intent).event,env:env(),now:NOW
})}
test("only reviewed no-funds immutable canary and private derived backup operations are addressable",()=>{
 for(const intent of Object.keys(configs)){
  const x=plan(intent),want=configs[intent];
  assert.equal(x.target,want.target);
  assert.equal(x.intent,intent);
  assert.equal(x.source_sha,SHA);
  assert.deepEqual(x.inputs,want.inputs);
  assert.equal(x.target_protected_admission_required,true);
  assert.equal(x.no_funds,true);
  assert.equal(x.direct_prod_sql_authorized,false);
 }
 assert.equal(plan("candidate-upload").inputs.approval,
  "UPLOAD_EXACT_MAIN_ZERO_TRAFFIC_NO_FUNDS");
 assert.equal(plan("canary-hold-review").inputs.operation,"release-hold");
 assert.equal(plan("canary-hold-review").inputs.confirmation,
  "REVIEW_HOT50_HOLD_NO_FUNDS");
});
test("all custom workflow, version, run, auth and SHA injection attempts fail before any API calls",()=>{
 for(const intent of Object.keys(configs)){
  const modifications=[
   r=>{r.authorization="BYPASS";},
   r=>{r.source_sha=OTHER;},
   r=>{r.workflow="evil.yml";},
   r=>{r.extra="arbitrary";},
   r=>{r.verify_hot50=!r.verify_hot50;},
   r=>{r.schema="geomacro.owner-issue-dispatch.v1";},
   r=>{r.intent="delete-hold";},
  ];
  if(["canary-rollout","canary-hold-review"].includes(intent))modifications.push(
   r=>{r.baseline_version_id="invalid";},
   r=>{r.candidate_version_id=BASELINE;},
   r=>{r.stage2_run_id="0";},
   r=>{delete r.stage2_run_id;},
   r=>{r.confirmation="PROMOTE_HOT50_NO_FUNDS";});
  if(intent==="canary-hold-review")modifications.push(
   r=>{r.promotion_run_id="0";},
   r=>{r.promotion_run_id=r.stage2_run_id;},
   r=>{delete r.promotion_run_id;});
  for(const mutate of modifications){
   const {event,request}=fixture(intent);
   mutate(request);event.issue.body=JSON.stringify(request);
   assert.throws(()=>planOwnerIssueDispatch({event,env:env(),now:NOW}),
     /OWNER_DISPATCH_/u,intent);
  }
 }
});
test("owner/non-owner, modified issue timestamp and moved main continue to fail closed",()=>{
 const {event}=fixture("canary-rollout");
 event.issue.author_association="COLLABORATOR";
 assert.throws(()=>planOwnerIssueDispatch({event,env:env(),now:NOW}),
  /OWNER_DISPATCH_/u);
 const x=fixture("canary-rollout");
 x.event.issue.updated_at="2026-11-09T00:00:00Z";
 assert.throws(()=>planOwnerIssueDispatch({event:x.event,env:env(),now:NOW}),
  /OWNER_DISPATCH_/u);
 const y=fixture("canary-rollout");
 const e=env();e.GITHUB_SHA=OTHER;
 assert.throws(()=>planOwnerIssueDispatch({event:y.event,env:e,now:NOW}),
  /OWNER_DISPATCH_/u);
});
function mockApi(event){
 const calls=[];
 const api=async(method,path,body)=>{
  calls.push({method,path,body});
  if(path.endsWith("/branches/main"))
   return {name:"main",commit:{sha:SHA}};
  if(method==="GET"&&path.endsWith("/issues/3858"))
   return event.issue;
  if(method==="PATCH")
   return {...event.issue,state:"closed"};
  if(path.endsWith("/dispatches"))return {status:204};
  if(path.endsWith("/comments"))return {id:120};
  throw Error("unexpected call "+path);
 };
 return {api,calls};
}
test("gateway always closes the exact owner issue before a single protected canary dispatch",async()=>{
 for(const intent of Object.keys(configs)){
  const {event}=fixture(intent),mock=mockApi(event);
  const result=await executeOwnerIssueDispatch({
   event,env:env(),now:NOW,request:mock.api
  });
  assert.equal(result.status,"DISPATCH_ACCEPTED_NOT_WORKFLOW_SUCCESS");
  assert.equal(result.worker_traffic_in_gateway,0);
  assert.equal(result.d1_sql_in_gateway,0);
  assert.equal(result.payments,0);
  assert.deepEqual(mock.calls.map(x=>x.method),
   ["GET","GET","PATCH","POST","POST"]);
  assert.equal(mock.calls[3].path,
   "/repos/blocknine0/geomacro/actions/workflows/"+
    configs[intent].target+"/dispatches");
  assert.deepEqual(mock.calls[3].body,
   {ref:"main",inputs:configs[intent].inputs});
 }
});
test("canonical protected workflows keep external signed proof, SLO, no-funds and HOLD gates",()=>{
 const candidate=readFileSync(".github/workflows/geomacro-optimized-worker-candidate.yml","utf8");
 const rollout=readFileSync(".github/workflows/geomacro-protected-hot50-worker-rollout.yml","utf8");
 const review=readFileSync(".github/workflows/canary-promotion.yml","utf8");
 const gateway=readFileSync(".github/workflows/owner-issue-dispatch-gateway.yml","utf8");
 assert.match(candidate,/UPLOAD_EXACT_MAIN_ZERO_TRAFFIC_NO_FUNDS/u);
 assert.match(candidate,/environment: production/u);
 assert.match(candidate,/prepare-optimized-worker-candidate\.mjs/u);
 assert.match(rollout,/PROMOTE_HOT50_NO_FUNDS/u);
 assert.match(rollout,/baseline_version_id:/u);
 assert.match(rollout,/candidate_version_id:/u);
 assert.match(rollout,/stage2_run_id:/u);
 assert.match(rollout,/environment: production/u);
 assert.match(review,/release-hold/u);
 assert.match(review,/--review-hold/u);
 assert.match(review,/environment: production/u);
 assert.match(review,/stage2_run_id:/u);
 assert.match(review,/promotion_run_id:/u);
 assert.match(gateway,/github\.actor == 'blocknine0'/u);
 assert.match(gateway,/issues: write/u);
 assert.match(gateway,/actions: write/u);
});
