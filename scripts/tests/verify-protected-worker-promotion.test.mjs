import test from "node:test";
import assert from "node:assert/strict";
import {assessWorkerPromotion,readBindings} from "../ops/verify-protected-worker-promotion.mjs";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const SHA="a".repeat(40);
const bindings=[
 {name:"DB",type:"d1"},
 {name:"INGEST_QUEUE",type:"queue"},
 {name:"SOURCE_POLL_QUEUE",type:"queue"},
 {name:"CONTROL_PLANE_TOKEN",type:"secret_text"},
 {name:"RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64",type:"secret_text"},
 {name:"RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64",type:"secret_text"},
 {name:"RISK_GATE_DECISION_ED25519_KEY_ID",type:"secret_text"},
 {name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:SHA},
 {name:"RISK_GATE_COUNTRY_SCOPE",type:"plain_text",text:"HOT50"},
 {name:"GEOMACRO_P0B_ADMISSION_ACTIVE",type:"plain_text",text:"1"},
 {name:"GEOMACRO_P1_BUNDLED_LEASES_ENABLED",type:"plain_text",text:"1"}
];
const version=(id,message="")=>({
 id,annotations:{"workers/message":message},resources:{bindings}
});
const quota={
 day_utc:"2026-11-07",workers_paid_subscription_verified:true,
 state:"ADMITTED",paid_monthly_account_wide_verified:true,
 monthly_owner_headroom:{
  schema:"geomacro.d1-paid-monthly-headroom.v1",status:"PASS",
  provider_subscription_verified:true,
  day_utc:"2026-11-07",
  cycle_start_utc:"2026-11-05",cycle_end_exclusive_utc:"2026-12-05",
  observed_rows_read:18_140_000,observed_rows_written:1_350_000,
  remaining_rows_read:22_481_860_000,remaining_rows_written:43_650_000,
  monthly_ceiling_read:22_500_000_000,
  monthly_ceiling_written:45_000_000,
  reserve_pct:10,old_daily_140k_policy_applied:false
 }
};
const at=(candidatePercent,includeZero=false)=>({
 deployments:[{versions:candidatePercent===0&&!includeZero?
  [{version_id:A,percentage:100}]:
  [{version_id:A,percentage:100-candidatePercent},
   {version_id:B,percentage:candidatePercent}]}]
});
const check=(stage,observed,overrides={})=>assessWorkerPromotion({
 deployment:at(observed,stage!==0),baselineVersion:version(A),
 candidateVersion:version(B,"geomacro-main:"+SHA),
 baselineId:A,candidateId:B,targetPercent:stage,sourceSha:SHA,
 quota,now:new Date("2026-11-07T12:00:00Z"),spendPolicyEnforced:false,
 ...overrides
});
test("ordered stages admit only exact previous-version percentage",()=>{
 for(const [stage,previous] of [[0,-1],[1,0],[5,1],[25,5],[50,25],[100,50]]){
  const ok=check(stage,Math.max(0,previous));
  assert.equal(ok.eligible,true,JSON.stringify(ok));
  assert.equal(ok.target_percent,stage);
  assert.equal(ok.previous_percent,previous);
  assert.equal(ok.provider_mutations,0);
  assert.equal(check(stage,99).eligible,false);
 }
});
test("never treat an old or unannotated Worker as same-main candidate",()=>{
 // Cloudflare's get-version response may omit upload annotations, but
 // provider-returned public SHA binding remains mandatory.
 assert.equal(check(1,0,{candidateVersion:version(B)}).eligible,true);
 assert.equal(check(1,0,{candidateVersion:version(B,"geomacro-main:"+"b".repeat(40))}).eligible,false);
 assert.equal(check(1,0,{baselineId:B}).eligible,false);
});
test("unknown, changed or missing bindings hold rollout",()=>{
 assert.equal(check(1,0,{candidateVersion:{
  ...version(B,"geomacro-main:"+SHA),resources:{bindings:[{name:"DB",type:"d1"}]}
 }}).reason,"VERSION_BINDING_PARITY_MISMATCH");
 assert.throws(()=>readBindings({resources:{bindings:[]}}),/UNREADABLE/);
});
test("account-wide Paid monthly headroom supersedes retired 140k/day guard",()=>{
 const x=quota.monthly_owner_headroom;
 assert.equal(check(1,0).eligible,true);
 assert.equal(check(1,0,{quota:{...quota,monthly_owner_headroom:
  {...x,observed_rows_written:45_000_000,remaining_rows_written:0}}}).eligible,false);
 assert.equal(check(1,0,{quota:{...quota,monthly_owner_headroom:
  {...x,status:"HOLD"}}}).reason,"D1_PAID_MONTHLY_BUDGET_HELD");
 assert.equal(check(1,0,{quota:{...quota,monthly_owner_headroom:
  {...x,old_daily_140k_policy_applied:true}}}).eligible,false);
 assert.equal(check(1,0,{quota:{...quota,workers_paid_subscription_verified:false}}).eligible,false);
});
test("spend gate cannot be bypassed when enforcement is required",()=>{
 assert.equal(check(1,0,{spendPolicyEnforced:true}).reason,"SPEND_POLICY_UNVERIFIED");
 assert.equal(check(1,0,{spendPolicyEnforced:true,quota:{
  ...quota,paid_capacity_probe_status:"VERIFIED",
  paid_capacity_verified_by_provider:true
 }}).eligible,true);
});
test("empty, split, unrelated or over-100 percent deployed states hold",()=>{
 assert.equal(check(0,1).reason,"BASELINE_NOT_100_PERCENT");
 assert.equal(check(5,0).reason,"CURRENT_SPLIT_NOT_PREVIOUS_STAGE");
 assert.equal(check(5,1,{deployment:{deployments:[{versions:[
  {version_id:A,percentage:90},{version_id:B,percentage:20}
 ]}]}}).eligible,false);
});

test("provider runtime source SHA must equal exact reviewed main",()=>{
 const wrong=bindings.map(x=>x.name==="GEOMACRO_SOURCE_SHA"?
  {...x,text:"b".repeat(40)}:x);
 assert.equal(check(1,0,{candidateVersion:{
  ...version(B),resources:{bindings:wrong}
 }}).reason,"CANDIDATE_HOT50_P1_RUNTIME_BINDING_UNVERIFIED");
});
test("0% upload alone is not a 1% readiness receipt",()=>{
 assert.equal(check(1,0,{deployment:at(0,false)}).eligible,false);
});
test("P1 and Hot50 runtime flags must be provider-readable and enabled",()=>{
 const bad=bindings.map(x=>x.name==="GEOMACRO_P1_BUNDLED_LEASES_ENABLED"?
   {...x,text:"0"}:x);
 const candidate={...version(B,"geomacro-main:"+SHA),resources:{bindings:bad}};
 assert.equal(check(1,0,{candidateVersion:candidate}).reason,
  "CANDIDATE_HOT50_P1_RUNTIME_BINDING_UNVERIFIED");
});

test("stale UTC-day provider counters can never authorize rollout",()=>{
 const stale={...quota,day_utc:"2026-11-06"};
 assert.equal(check(0,0,{quota:stale}).reason,
  "PROVIDER_UTC_DAY_RECEIPT_STALE_OR_MISSING");
});
