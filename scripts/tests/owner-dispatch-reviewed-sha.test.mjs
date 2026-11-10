import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 admitOwnerReviewedSHA,verifyOwnerDispatchReview
} from "../ops/verify-owner-dispatch-reviewed-sha.mjs";
const SHA="a".repeat(40),OTHER="b".repeat(40);
const NOW=new Date("2026-11-10T17:30:00Z");
const GW=42812345678,RUN=42812345690,ISSUE=4001;
const T0="2026-11-10T17:00:00Z",T1="2026-11-10T17:00:15Z";
const env=()=>({
 GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",
 GITHUB_EVENT_NAME:"workflow_dispatch",
 GITHUB_SHA:SHA,
 GITHUB_RUN_ID:String(RUN),
 GEOMACRO_STEP3_EXACT_SHA:OTHER,
 OWNER_DISPATCH_ISSUE:String(ISSUE),
 OWNER_DISPATCH_GATEWAY_RUN:String(GW),
 GITHUB_ENV:"/tmp/unused"
});
function fixture(){
 const payload={
  schema:"geomacro.owner-issue-dispatch.v1",
  intent:"stage2-production",source_sha:SHA,
  authorization:"OWNER_AUTHORIZE_REAL_PRODUCTION_D1_0204_0211_0212_0213_NO_FUNDS",
  verify_hot50:true
 };
 const issue={
  number:ISSUE,title:"GeoMacro Owner Dispatch Request",
  state:"closed",created_at:T0,closed_at:T1,
  closed_by:{login:"github-actions[bot]"},
  user:{login:"blocknine0",type:"User"},author_association:"OWNER",
  body:JSON.stringify(payload),pull_request:null
 };
 const gatewayRun={
  id:GW,event:"issues",status:"completed",conclusion:"success",
  path:".github/workflows/owner-issue-dispatch-gateway.yml",
  head_sha:SHA,head_branch:"main",created_at:T1,
  actor:{login:"blocknine0"}
 };
 const gatewayJobs={jobs:[{name:"owner-issue-dispatch",conclusion:"success"}]};
 const targetRun={
  id:RUN,event:"workflow_dispatch",
  path:".github/workflows/production-rollout-orchestrator.yml",
  head_sha:SHA,head_branch:"main",
  actor:{login:"github-actions[bot]"},
  created_at:"2026-11-10T17:01:00Z",
  display_title:"Step3 owner issue #"+ISSUE
 };
 const comments=[{
  user:{login:"github-actions[bot]"},
  body:"ACCEPTED (HTTP 204; queued only). \nIntent: stage2-production"+
   "\nSource SHA: "+SHA+
   "\nTarget: production-rollout-orchestrator.yml"+
   "\nGateway run: "+GW
 }];
 const recentRuns={workflow_runs:[
  targetRun,{id:321,display_title:"normal manual run",
    created_at:"2026-11-10T16:59:59Z"}]};
 const remoteMain={name:"main",commit:{sha:SHA}};
 return {env:env(),issue,comments,gatewayRun,gatewayJobs,
  targetRun,recentRuns,remoteMain,now:NOW};
}
test("owner issue with single authenticated exact-main workflow run is a sufficient alternative review pin",()=>{
 const p=admitOwnerReviewedSHA(fixture());
 assert.equal(p.status,"PASS_OWNER_ISSUE_EXACT_MAIN_SHA_REVIEW");
 assert.equal(p.reviewed_sha,SHA);
 assert.equal(p.owner_issue,ISSUE);
 assert.equal(p.target_run,RUN);
 assert.equal(p.no_funds,true);
});
test("spoofed, edited, expired, replayed and unsigned owner requests cannot substitute protected pin",()=>{
 const bad=[
  x=>{x.issue.body="{}";},
  x=>{x.issue.body=JSON.stringify({...JSON.parse(x.issue.body),verify_hot50:false});},
  x=>{x.issue.body=JSON.stringify({...JSON.parse(x.issue.body),intent:"shadow-rehearsal"});},
  x=>{x.issue.user.login="attacker";},
  x=>{x.issue.closed_by.login="attacker";},
  x=>{x.issue.author_association="COLLABORATOR";},
  x=>{x.issue.state="open";},
  x=>{x.issue.created_at="2026-11-10T12:00:00Z";},
  x=>{x.gatewayRun.conclusion="failure";},
  x=>{x.gatewayRun.head_sha=OTHER;},
  x=>{x.gatewayRun.actor.login="attacker";},
  x=>{x.gatewayJobs.jobs[0].conclusion="skipped";},
  x=>{x.comments[0].user.login="attacker";},
  x=>{x.comments[0].body="ACCEPTED";},
  x=>{x.targetRun.actor.login="blocknine0";},
  x=>{x.targetRun.head_sha=OTHER;},
  x=>{x.targetRun.id=RUN+1;},
  x=>{x.targetRun.display_title="Step3 manual";},
  x=>{x.targetRun.event="push";},
  x=>{x.recentRuns.workflow_runs.push({...x.targetRun,id:RUN+1});},
  x=>{x.recentRuns.workflow_runs.pop();},
  x=>{x.recentRuns.workflow_runs.at(-1).created_at="2026-11-10T17:01:00Z";},
  x=>{x.remoteMain.commit.sha=OTHER;},
  x=>{x.env.GITHUB_SHA=OTHER;},
  x=>{x.env.OWNER_DISPATCH_GATEWAY_RUN="0";},
  x=>{x.env.GITHUB_EVENT_NAME="issues";}
 ];
 for(const change of bad){
  const x=fixture();change(x);
  assert.throws(()=>admitOwnerReviewedSHA(x),/OWNER_SHA_REVIEW_/u);
 }
});
test("manual workflow_dispatch MUST still carry existing independently pinned SHA",async()=>{
 const x=env();delete x.OWNER_DISPATCH_ISSUE;delete x.OWNER_DISPATCH_GATEWAY_RUN;
 await assert.rejects(verifyOwnerDispatchReview({env:x,now:NOW,
  read:()=>{throw Error("provider read should not happen");}}),
  /OWNER_SHA_REVIEW_MANUAL_REVIEWED_SHA_PIN_REQUIRED/u);
 x.GEOMACRO_STEP3_EXACT_SHA=SHA;
 const p=await verifyOwnerDispatchReview({env:x,now:NOW,
  read:()=>{throw Error("provider read should not happen");}});
 assert.equal(p.status,"PASS_MANUAL_ENVIRONMENT_SHA_PIN");
});
test("owner-issued proof writes a reviewed SHA only AFTER all authenticated provider proofs",async()=>{
 const x=fixture(),paths=[];
 const repo="/repos/blocknine0/geomacro";
 const db=new Map([
  [repo+"/issues/"+ISSUE,x.issue],
  [repo+"/issues/"+ISSUE+"/comments?per_page=100",x.comments],
  [repo+"/actions/runs/"+GW,x.gatewayRun],
  [repo+"/actions/runs/"+GW+"/jobs?per_page=100",x.gatewayJobs],
  [repo+"/actions/runs/"+RUN,x.targetRun],
  [repo+"/actions/workflows/production-rollout-orchestrator.yml/runs?per_page=100",x.recentRuns],
  [repo+"/branches/main",x.remoteMain]
 ]);
 const writes=[];
 const got=await verifyOwnerDispatchReview({
  env:x.env,now:NOW,
  read:async p=>{paths.push(p);if(!db.has(p))throw Error("unplanned path");return db.get(p);},
  append:(path,content)=>writes.push({path,content})
 });
 assert.equal(got.status,"PASS_OWNER_ISSUE_EXACT_MAIN_SHA_REVIEW");
 assert.equal(paths.length,7);
 assert.deepEqual(writes,[{path:x.env.GITHUB_ENV,content:"GEOMACRO_STEP3_EXACT_SHA="+SHA+"\n"}]);
 x.issue.state="open";
 await assert.rejects(verifyOwnerDispatchReview({
  env:x.env,now:NOW,read:async p=>db.get(p),
  append:()=>{throw Error("MUTATION_WITHOUT_APPROVAL");}}),/OWNER_SHA_REVIEW_/u);
});
test("workflow reauthenticates before both protected Shadow and Stage2, preserving original safety admission",()=>{
 const w=readFileSync(".github/workflows/production-rollout-orchestrator.yml","utf8");
 const gate=readFileSync("scripts/ops/owner-issue-dispatch-gateway.mjs","utf8");
 assert.match(w,/run-name: "Step3 owner issue #/u);
 assert.match(w,/owner_dispatch_issue:/u);
 assert.match(w,/owner_dispatch_gateway_run:/u);
 assert.match(w,/actions: read/u);
 assert.match(w,/issues: read/u);
 assert.equal((w.match(/node scripts\/ops\/verify-owner-dispatch-reviewed-sha\.mjs/gu)||[]).length,2);
 assert.match(w,/test "\$\(git rev-parse HEAD\)" = "\$GEOMACRO_STEP3_EXACT_SHA"/u);
 assert.match(w,/node scripts\/ops\/run-step3-protected-d1-migrations\.mjs --apply/u);
 assert.match(w,/admitSignedStep3ShadowReceipt/u);
 assert.match(w,/node scripts\/ops\/check-d1-paid-monthly-headroom\.mjs --check/u);
 assert.match(w,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(gate,/owner_dispatch_issue:String\(plan.issue_number\)/u);
 assert.match(gate,/owner_dispatch_gateway_run:String\(env.GITHUB_RUN_ID\)/u);
 const authStep=w.split("      - name: Authenticate owner issue exact-main SHA or retain manual protected SHA pin")[1]?.split("      - name: Require reviewed main SHA")[0];
 assert.ok(authStep);
 assert.doesNotMatch(authStep,/continue-on-error:/u);
 assert.doesNotMatch(w,/rm config\/d1-hotspot-v2-canary\.hold/u);
});
