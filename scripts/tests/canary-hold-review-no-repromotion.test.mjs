import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {admitCompletedCanaryForHoldReview}
 from "../canary-promoter.ts";

// OFFLINE FICTITIOUS shape fixtures only; never considered provider evidence.
const SHA="a".repeat(40),BASE="11111111-1111-4111-8111-111111111111";
const CAND="22222222-2222-4222-8222-222222222222";
const RUN="42812345678";
const phases=[0,1,5,25,50,100];
function fixture(){
 const stages=phases.map(p=>({
  stage_percent:p,verified_minutes:p===1?30:15,intervals:30,
  worker_script_version:p===0?BASE:CAND,
  worker_requests:1100,host_requests:1100,worker_errors:0,
  worker_error_ratio:0,http_5xx_ratio:0,worker_wall_time_p95_ms:2,
  worker_wall_time_p99_ms:3,
  http_5xx_under_0_5pct:true,version_errors_under_0_5pct:true,
  p99_under_50ms:true,
  host_http_5xx_not_version_isolated:true,
  worker_metrics_version_isolated:true,
  observed_d1_hourly_pace:{status:"PASS_OBSERVED_PAID_MONTHLY_PACE",
   reads_per_hour:100,writes_per_hour:10,observed_window_ms:900000},
  latest_d1_provider_observation:{rows_read:1000,
   rows_written:100,observed_at_ms:Date.parse("2026-11-10T00:00:00Z")+p*60000+1000,
   cycle_start_utc:"2026-11-05"}
 }));
 const stageReceipts=stages.map(stage=>({
  schema:"geomacro.hot50.canary-slo.v1",status:"PASS",
  source_sha:SHA,baseline_version:BASE,candidate_version:CAND,
  no_funds:true,...structuredClone(stage)
 }));
 const promotion={
  schema:"geomacro.hot50.promotion.v1",status:"PASS",
  source_sha:SHA,stages,hold_still_present:true,
  payments_authorized:false,no_funds:true,
  baseline_version:BASE,candidate_version:CAND,
  approved_stage2_run:RUN,signed_stage2_receipt_sha256:"f".repeat(64),
  independent_hot50_gate_acceptance_not_inferred:true
 };
 return {promotion,stageReceipts,headSha:SHA,
  baseline:BASE,candidate:CAND,stage2RunId:RUN};
}
test("six individually verified prior stage shapes admit a READ-ONLY review only",()=>{
 const a=admitCompletedCanaryForHoldReview(fixture());
 assert.equal(a.status,"PASS_SIGNED_PROMOTION_SHAPE");
 assert.equal(a.fully_verified_stages,6);
 assert.equal(a.independent_provider_readback_and_signatures_required,true);
 assert.equal(a.traffic_mutated,false);
 assert.equal(a.remote_hold_removed,false);
});
test("fabricated, short, mismatched, missing and stale-identity shapes always HOLD",()=>{
 const bad=[
  x=>{x.promotion.stages.pop();},
  x=>{x.stageReceipts[5].worker_script_version=BASE;},
  x=>{x.stageReceipts[1].verified_minutes=1;x.promotion.stages[1].verified_minutes=1;},
  x=>{x.stageReceipts[4].p99_under_50ms=false;x.promotion.stages[4].p99_under_50ms=false;},
  x=>{x.stageReceipts[3].observed_d1_hourly_pace.status="INSUFFICIENT_INTERVAL";
       x.promotion.stages[3].observed_d1_hourly_pace.status="INSUFFICIENT_INTERVAL";},
  x=>{x.stageReceipts[2].worker_requests=3;x.promotion.stages[2].worker_requests=3;},
  x=>{x.stageReceipts[0].source_sha="b".repeat(40);},
  x=>{x.stageReceipts[5].worker_errors=1;},
  x=>{x.promotion.approved_stage2_run="42812345677";},
  x=>{x.promotion.hold_still_present=false;},
  x=>{x.promotion.payments_authorized=true;},
  x=>{x.promotion.signed_stage2_receipt_sha256="invalid";},
  x=>{x.promotion.candidate_version=BASE;},
  x=>{x.stage2RunId="0";},
 ];
 for(const fn of bad){
  const x=fixture();fn(x);
  assert.throws(()=>admitCompletedCanaryForHoldReview(x),
   /CANARY_HOLD_REVIEW_/);
 }
});
test("release-hold uses separate signed successful prior promotion, never a second 0-100 rollout",()=>{
 const flow=readFileSync(".github/workflows/canary-promotion.yml","utf8");
 const promoter=readFileSync("scripts/canary-promoter.ts","utf8");
 assert.match(flow,/promotion_run_id:/);
 assert.match(flow,/CANARY_HOLD_PRIOR_PROMOTION_RUN_ID_REQUIRED/);
 assert.match(flow,/CANARY_HOLD_PRIOR_PROTECTED_PROMOTION_JOB_NOT_VERIFIED/);
 assert.match(flow,/name: geomacro-five-gate-provider-receipts/);
 assert.match(flow,/inputs.operation == 'release-hold'/);
 assert.match(flow,/canary-promoter\.ts --review-hold/);
 assert.doesNotMatch(flow,/canary-promoter\.ts --promote --release-hold/);
 assert.match(promoter,/args\[0\]==='--review-hold'/);
 assert.match(promoter,/CANARY_ARGS_INVALID_OR_UNSAFE_REPROMOTION/);
 assert.match(promoter,/verifyDistribution\(active,\[\{version_id:candidate,percentage:100\}\]\)/);
 assert.match(promoter,/admitSignedClosedD1DayForCanary/);
 assert.match(promoter,/checkLiveD1Budget\(\)/);
 assert.match(promoter,/signedReport\('artifacts\/release\/hold-release-review\.json'/);
 assert.doesNotMatch(promoter,/unlinkSync\(/);
 assert.doesNotMatch(promoter,/if\(process\.argv\.includes\('--release-hold'\)\)/);
 assert.match(promoter,/remote_main_hold_not_removed:true/);
});
