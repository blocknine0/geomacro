import test from "node:test";
import assert from "node:assert/strict";
import {decideOneShotGriHistoryWakeup as decide,runOneShotGriHistoryWakeup as run} from "../ops/dispatch-gri-immutable-history-once.mjs";
const sha="a".repeat(40),now=Date.parse("2026-10-23T11:50:00.000Z");
const env={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_EVENT_NAME:"push",GITHUB_SHA:sha,
 GH_TOKEN:"synthetic-test-github-token-must-not-leak",
};
const receipt={
 schema:"geomacro.phase2-gri-recovery-readiness.v1",
 checked_at:"2026-10-23T11:50:00.000Z",
 phase2_inputs_preflight_complete:true,
 historical_b2_readback_needs_governed_verification:true,
 immutable_historical_b2_readback_now_verified:false,
 quota_headroom_preflight_verified:true,
 quota_allows_bounded_immutable_history_attempt:true,
 remaining_reserved_get:24,remaining_reserved_total:72,
 next_safe_action:"RUN_EXISTING_GRI_PINNED_VERSION_RECOVERY",
 current_signed_publication_verified:false,x402_real_money_authorized:false,
 b2_requests:0,b2_puts:0,d1_writes:0,payments:0,
};
test("protected main push with fresh exact D1/quota receipt wakes only existing workflow",async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  if(calls.length===1)return Response.json({ref:"refs/heads/main",object:{sha}});
  return new Response(null,{status:204});
 };
 const result=await run({env,receipt,fetcher,now});
 assert.equal(result.status,"DISPATCH_ACCEPTED_NOT_B2_READBACK");
 assert.equal(result.historical_original_bytes_verified_by_this_job,false);
 assert.equal(result.payments,0);
 assert.equal(calls.length,2);
 assert.equal(calls[0].url,"https://api.github.com/repos/blocknine0/geomacro/git/ref/heads/main");
 assert.equal(calls[1].url,"https://api.github.com/repos/blocknine0/geomacro/actions/workflows/gri-pinned-version-recovery.yml/dispatches");
 assert.equal(calls[1].init.redirect,"error");
 assert.equal(JSON.parse(calls[1].init.body).ref,"main");
 assert.equal(JSON.stringify(result).includes(env.GH_TOKEN),false);
});
test("pinned-workflow completion cannot ping-pong dispatch phase2, even with quota",async()=>{
 for(const event of ["workflow_run","workflow_dispatch","pull_request","schedule"]){
  let calls=0;const result=await run({env:{...env,GITHUB_EVENT_NAME:event},receipt,
   fetcher:async()=>{calls++;throw Error("never");},now});
  assert.equal(result.status,"SKIPPED");
  assert.equal(calls,0);
 }
});
test("stale proof, depleted quota, forged B2 readback and real-money claims refuse wakeup",async()=>{
 for(const change of [
  {checked_at:"2026-10-23T11:40:00Z"},
  {quota_allows_bounded_immutable_history_attempt:false},
  {remaining_reserved_get:2},{remaining_reserved_total:3},
  {immutable_historical_b2_readback_now_verified:true},
  {next_safe_action:"PROTECTED_GRI_PUBLISHER_MUST_REVALIDATE_ALL_EVIDENCE"},
  {x402_real_money_authorized:true},{b2_requests:1},{d1_writes:1},
 ]){
  const r=decide({env,receipt:{...receipt,...change},now});
  assert.equal(r.eligible,false,JSON.stringify(change));
 }
});
test("superseded main returns SKIPPED and never spends B2 quota or calls dispatch",async()=>{
 let calls=0;
 const result=await run({env,receipt,now,fetcher:async()=>{
   calls++;
   return Response.json({ref:"refs/heads/main",object:{sha:"b".repeat(40)}});
 }});
 assert.equal(result.status,"SKIPPED");
 assert.equal(result.reason,"CANONICAL_MAIN_SUPERSEDED");
 assert.equal(calls,1);
});
test("denied GitHub credentials fail without rerun, exposing only fixed error codes",async()=>{
 const fetcher=async()=>new Response("secret",{status:403});
 await assert.rejects(run({env,receipt,now,fetcher}),/GRI_IMMUTABLE_AUTO_WAKE_MAIN_SHA_READ_UNAVAILABLE/);
});
test("only protected correct repository main push is admitted",()=>{
 for(const patch of [
 {GITHUB_REPOSITORY:"attacker/repo"}, {GITHUB_REF:"refs/heads/feature"},
 {GITHUB_ACTIONS:"false"},{GITHUB_SHA:"not-a-sha"}
 ])assert.equal(decide({env:{...env,...patch},receipt,now}).eligible,false);
});
