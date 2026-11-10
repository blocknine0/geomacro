import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 planOwnerIssueDispatch,assertLiveOwnerIssue,assertExactRemoteMain,
 OWNER_ISSUE_DISPATCH_TITLE,OWNER_ISSUE_DISPATCH_SCHEMA
} from "../lib/owner-issue-dispatch-contract.mjs";
import {executeOwnerIssueDispatch} from "../ops/owner-issue-dispatch-gateway.mjs";

const SHA="f".repeat(40),OTHER="e".repeat(40);
const NOW=new Date("2026-11-10T16:00:00.000Z");
const env=()=>({
 GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"issues",
 GITHUB_ACTOR:"blocknine0",GITHUB_SHA:SHA,GITHUB_RUN_ID:"123456789"
});
function fixture(intent="gateway-handshake"){
 const auth={
  "gateway-handshake":"OWNER_AUTHORIZE_NO_FUNDS_GATEWAY_HANDSHAKE",
  "shadow-rehearsal":"OWNER_AUTHORIZE_SHADOW_ONLY_NO_PRODUCTION_SQL",
  "stage2-production":"OWNER_AUTHORIZE_REAL_PRODUCTION_D1_0204_0211_0212_0213_NO_FUNDS"
 };
 return {
  action:"opened",repository:{full_name:"blocknine0/geomacro"},
  sender:{login:"blocknine0",type:"User"},
  issue:{
   id:12345,number:4611,state:"open",
   created_at:"2026-11-10T15:58:00.000Z",
   updated_at:"2026-11-10T15:58:00.000Z",
   author_association:"OWNER",user:{login:"blocknine0",type:"User"},
   title:OWNER_ISSUE_DISPATCH_TITLE,
   body:JSON.stringify({
    schema:OWNER_ISSUE_DISPATCH_SCHEMA,intent,source_sha:SHA,
    authorization:auth[intent],
    verify_hot50:intent==="stage2-production"
   })
  }
 };
}
function prep(type){
 return planOwnerIssueDispatch({event:fixture(type),env:env(),now:NOW});
}
test("strict one-shot fixed targets and explicit OWNER-approved production authorization",()=>{
 const handshake=prep("gateway-handshake");
 assert.equal(handshake.target,"owner-dispatch-handshake.yml");
 assert.deepEqual(handshake.inputs,{approved_main_sha:SHA,request_issue:"4611"});
 assert.equal(handshake.no_funds,true);
 const shadow=prep("shadow-rehearsal");
 assert.equal(shadow.target,"production-rollout-orchestrator.yml");
 assert.equal(shadow.inputs.execute_stage2,"false");
 assert.equal(shadow.inputs.verify_hot50,"false");
 const prod=prep("stage2-production");
 assert.equal(prod.target,"production-rollout-orchestrator.yml");
 assert.equal(prod.inputs.execute_stage2,"true");
 assert.equal(prod.inputs.verify_hot50,"true");
 assert.equal(prod.inputs.approval,"REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL");
 assert.equal(prod.target_protected_admission_required,true);
 assert.equal(prod.direct_prod_sql_authorized,false);
 // Source authorization cannot reuse older v1 Stage2 or arbitrary targets.
 const bad=fixture("gateway-handshake");
 const source={schema:"geomacro.owner-issue-dispatch.v2",
  intent:"registered-original-source-intake",source_sha:SHA,
  authorization:"OWNER_AUTHORIZE_VERIFIED_ORIGINAL_SOURCE_B2_FIRST_NO_FUNDS",
  verify_hot50:false};
 bad.issue.body=JSON.stringify(source);
 const approved=planOwnerIssueDispatch({event:bad,env:env(),now:NOW});
 assert.equal(approved.target,"all-source-reusable-news-json.yml");
 assert.deepEqual(approved.inputs,{approved_main_sha:SHA});
 assert.equal(approved.no_funds,true);
 const injection=structuredClone(bad);
 const r=JSON.parse(injection.issue.body);r.authorization="OWNER_AUTHORIZE_REAL_PRODUCTION_D1_0204_0211_0212_0213_NO_FUNDS";
 injection.issue.body=JSON.stringify(r);
 assert.throws(()=>planOwnerIssueDispatch({event:injection,env:env(),now:NOW}),/OWNER_DISPATCH_/u);
});
test("reject non-owner, unauthorized, injection, wrong SHA and stale issues BEFORE GitHub IO",()=>{
 const attacks=[
  x=>{x.event.sender.login="attacker";},
  x=>{x.event.issue.user.login="attacker";},
  x=>{x.event.sender.type="Bot";},
  x=>{x.event.issue.user.type="Bot";},
  x=>{x.event.issue.author_association="CONTRIBUTOR";},
  x=>{x.event.issue.title="GitHub Actions run anything";},
  x=>{x.event.issue.state="closed";},
  x=>{x.event.issue.pull_request={url:"https://github.com/..."};},
  x=>{x.event.repository.full_name="other/repo";},
  x=>{x.event.issue.created_at="2026-11-08T00:00:00.000Z";},
  x=>{x.event.action="edited";},
  x=>{x.event.issue.body="{}";},
  x=>{x.event.issue.body="{bad";},
  x=>{x.event.issue.body=JSON.stringify({...JSON.parse(x.event.issue.body),workflow_id:"evil.yml"});},
  x=>{x.event.issue.body=JSON.stringify({...JSON.parse(x.event.issue.body),intent:"shell-command"});},
  x=>{x.event.issue.body=JSON.stringify({...JSON.parse(x.event.issue.body),source_sha:OTHER});},
  x=>{x.event.issue.body=JSON.stringify({...JSON.parse(x.event.issue.body),verify_hot50:true});},
  x=>{x.event.issue.body=JSON.stringify({...JSON.parse(x.event.issue.body),authorization:"BYPASS"});},
  x=>{x.event.issue.body='{"__proto__":true}';},
  x=>{x.env.GITHUB_ACTOR="attacker";},
  x=>{x.env.GITHUB_SHA=OTHER;},
  x=>{x.env.GITHUB_REF="refs/pull/1/merge";},
  x=>{x.env.GITHUB_EVENT_NAME="issue_comment";},
  x=>{x.env.GITHUB_REPOSITORY="evil/repo";}
 ];
 for(const attack of attacks){
  const x={event:fixture(),env:env()};
  attack(x);
  assert.throws(()=>planOwnerIssueDispatch({...x,now:NOW}),/OWNER_DISPATCH_/u);
 }
});
test("live edit/close and moved main cannot be used to replay a request",()=>{
 const event=fixture(),plan=prep("gateway-handshake");
 assert.equal(assertLiveOwnerIssue({current:event.issue,plan}),true);
 for(const change of [
  x=>{x.body="{}";},x=>{x.state="closed";},
  x=>{x.user.login="attacker";},x=>{x.title="changed";},
  x=>{x.number=11;},x=>{x.created_at="2026-11-09T00:00:00.000Z";},
  x=>{x.updated_at="2026-11-10T15:59:59.000Z";}
 ]){
  const x=structuredClone(event.issue);change(x);
  assert.throws(()=>assertLiveOwnerIssue({current:x,plan}),/OWNER_DISPATCH_/u);
 }
 assert.equal(assertExactRemoteMain({remote:{name:"main",commit:{sha:SHA}},plan,env:env()}),true);
 for(const remote of [{name:"main",commit:{sha:OTHER}},
  {name:"dev",commit:{sha:SHA}},{name:"main",commit:{sha:null}}]){
  assert.throws(()=>assertExactRemoteMain({remote,plan,env:env()}),/OWNER_DISPATCH_/u);
 }
});
function fakeApi(event,{remoteSha=SHA,liveIssue=event.issue,dispatchFails=false}={}){
 const calls=[];
 const api=async(method,path,body)=>{
  calls.push({method,path,body});
  if(path.endsWith("/branches/main")&&method==="GET")
   return {name:"main",commit:{sha:remoteSha}};
  if(path.endsWith("/issues/4611")&&method==="GET")return liveIssue;
  if(path.endsWith("/issues/4611")&&method==="PATCH")
   return {...liveIssue,state:"closed",state_reason:"completed"};
  if(path.endsWith("/dispatches")&&method==="POST"){
   if(dispatchFails)throw Error("OWNER_DISPATCH_GITHUB_POST_HTTP_NOT_EXPECTED");
   return {status:204};
  }
  if(path.endsWith("/comments")&&method==="POST")return {id:555};
  throw Error("UNEXPECTED_MOCK_GITHUB_REQUEST");
 };
 return {calls,api};
}
test("real request executor consumes issue BEFORE dispatch and posts one receipt, no provider work",async()=>{
 const event=fixture("stage2-production"),f=fakeApi(event);
 const result=await executeOwnerIssueDispatch({
  event,env:env(),now:NOW,request:f.api});
 assert.equal(result.status,"DISPATCH_ACCEPTED_NOT_WORKFLOW_SUCCESS");
 assert.equal(result.http_204_verified,true);
 assert.equal(result.d1_sql_in_gateway,0);
 assert.equal(result.payments,0);
 assert.equal(f.calls.length,5);
 assert.deepEqual(f.calls.map(x=>x.method),["GET","GET","PATCH","POST","POST"]);
 assert.equal(f.calls[2].path,"/repos/blocknine0/geomacro/issues/4611");
 assert.equal(f.calls[3].path,
  "/repos/blocknine0/geomacro/actions/workflows/production-rollout-orchestrator.yml/dispatches");
 assert.deepEqual(f.calls[3].body,{ref:"main",
  inputs:{approval:"REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL",
   execute_stage2:"true",verify_hot50:"true",
   owner_dispatch_issue:"4611",owner_dispatch_gateway_run:"123456789"}});
 assert.match(f.calls[4].body.body,/ACCEPTED \(HTTP 204; queued only\)/u);
});
test("moved main or already-closed issue makes ZERO mutation calls",async()=>{
 for(const mode of ["moved-main","closed-issue","edited-issue"]){
  const event=fixture();
  const liveIssue=structuredClone(event.issue);
  if(mode==="closed-issue")liveIssue.state="closed";
  if(mode==="edited-issue")liveIssue.body="tampered";
  const f=fakeApi(event,{remoteSha:mode==="moved-main"?OTHER:SHA,liveIssue});
  await assert.rejects(executeOwnerIssueDispatch({
   event,env:env(),now:NOW,request:f.api}),/OWNER_DISPATCH_/u);
  assert.ok(f.calls.every(x=>x.method==="GET"));
 }
});
test("HTTP failure after reservation never retries a potentially accepted dispatch",async()=>{
 const event=fixture(),f=fakeApi(event,{dispatchFails:true});
 await assert.rejects(executeOwnerIssueDispatch({
  event,env:env(),now:NOW,request:f.api}),/OWNER_DISPATCH_/u);
 assert.equal(f.calls.filter(x=>x.path.endsWith("/dispatches")).length,1);
 assert.deepEqual(f.calls.map(x=>x.method),["GET","GET","PATCH","POST","POST"]);
 assert.match(f.calls.at(-1).body.body,/no automatic retry/u);
});
test("workflow is event-only, owner-only, strictly permissioned, and handshake has zero provider mutation",()=>{
 const w=readFileSync(".github/workflows/owner-issue-dispatch-gateway.yml","utf8");
 const ack=readFileSync(".github/workflows/owner-dispatch-handshake.yml","utf8");
 const rt=readFileSync("scripts/ops/owner-issue-dispatch-gateway.mjs","utf8");
 assert.match(w,/^  issues:\s*\n    types: \[opened\]/mu);
 assert.match(w,/github\.actor == 'blocknine0'/u);
 assert.match(w,/github\.event\.issue\.author_association == 'OWNER'/u);
 assert.match(w,/github\.event\.issue\.title == 'GeoMacro Owner Dispatch Request'/u);
 assert.match(w,/issues: write/u);
 assert.match(w,/actions: write/u);
 assert.match(w,/cancel-in-progress: false/u);
 assert.doesNotMatch(w,/^  (?:schedule|push|issue_comment|pull_request_target):/mu);
 assert.doesNotMatch(w,/secrets\.[A-Z]|wrangler deploy|--apply|git push|canary-promoter/u);
 assert.match(rt,/state:"closed",state_reason:"completed"/u);
 assert.match(rt,/dispatches/u);
 assert.doesNotMatch(rt,/CLOUDFLARE_API_TOKEN|B2_APPLICATION_KEY|SIGNING_JWK|wrangler/u);
 assert.match(ack,/workflow_dispatch:/u);
 assert.match(ack,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.doesNotMatch(ack,/CLOUDFLARE_API_TOKEN|wrangler|d1 execute|payment.*activate/iu);
});
