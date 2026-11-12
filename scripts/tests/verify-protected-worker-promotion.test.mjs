import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessWorkerPromotion,readBindings,verifyCanaryPaidMonthQuota}
 from "../ops/verify-protected-worker-promotion.mjs";
import {assessD1PaidMonthlyAdmission}
 from "../lib/d1-workers-paid-monthly-governor.mjs";
const A="11111111-1111-4111-8111-111111111111";
const B="22222222-2222-4222-8222-222222222222";
const SHA="a".repeat(40);
const NOW=new Date("2026-11-09T10:00:00Z");
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
 {name:"GEOMACRO_P1_BUNDLED_LEASES_ENABLED",type:"plain_text",text:"1"},
 {name:"GEOMACRO_COMMERCIAL_STREAM_RELEASE",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_CANARY_HOLD_CLEARED",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED",type:"plain_text",text:"0"}
];
const version=(id,message="")=>({
 id,annotations:{"workers/message":message},resources:{bindings}
});
const paidProof=(now=NOW)=>({
 schema:"geomacro.cloudflare-workers-paid-provider-proof.v1",
 verified:true,source:"CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ",
 subscription_changed:false,billing_action_performed:false,
 observed_at:now.toISOString()
});
const usage=(now=NOW)=>({
 schema:"geomacro.d1-paid-monthly-provider-usage.v1",
 source:"CLOUDFLARE_GRAPHQL_ALL_ACCOUNT_D1_DATABASES",
 provider_usage_observed:true,billing_cycle_start_utc:"2026-11-05",
 billing_cycle_end_exclusive_utc:"2026-12-05",
 observed_through_utc:now.toISOString().slice(0,10),
 observed_at_utc:now.toISOString(),observed_rows_read:21_000_000,
 observed_rows_written:1_700_000,database_count_observed:4,
 group_count_observed:10,telemetry_is_delayed:true
});
const quota=assessD1PaidMonthlyAdmission({
 usage:usage(),paidProof:paidProof(),now:NOW,lane:"canary"
});
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
 quota,now:NOW,spendPolicyEnforced:false,
 ...overrides
});

test("physical Paid monthly provider receipt admits the canary stage, never old Free status",()=>{
 assert.equal(quota.status,"PASS");
 assert.equal(verifyCanaryPaidMonthQuota(quota,NOW).verified,true);
 assert.equal(check(0,0).eligible,true);
 assert.equal(check(0,0).no_funds,true);
 assert.equal(check(0,0).monthly_write_headroom,quota.remaining_rows_written);
 assert.equal(check(1,0,{quota:{
  state:"ADMITTED",day_utc:"2026-11-09",observed_rows_read:100,
  observed_rows_written:100,workers_paid_subscription_verified:true
 }}).reason,"PROVIDER_PAID_MONTHLY_PLAN_OR_ADMISSION_UNVERIFIED");
});

test("ordered stages admit only exact previous provider-version percentage",()=>{
 for(const [stage,previous] of [[0,-1],[1,0],[5,1],[25,5],[50,25],[100,50]]){
  const ok=check(stage,Math.max(0,previous));
  assert.equal(ok.eligible,true,JSON.stringify(ok));
  assert.equal(ok.previous_percent,previous);
  assert.equal(ok.provider_mutations,0);
  assert.equal(check(stage,99).eligible,false);
 }
});
test("untrusted SHA, annotations and Worker bindings never authorize promotion",()=>{
 assert.equal(check(1,0,{candidateVersion:version(B)}).eligible,true);
 assert.equal(check(1,0,{candidateVersion:version(B,"geomacro-main:"+"b".repeat(40))}).eligible,false);
 assert.equal(check(1,0,{baselineId:B}).eligible,false);
 assert.equal(check(1,0,{candidateVersion:{
  ...version(B),resources:{bindings:[{name:"DB",type:"d1"}]}
 }}).reason,"VERSION_BINDING_PARITY_MISMATCH");
 assert.throws(()=>readBindings({resources:{bindings:[]}}),/UNREADABLE/);
 const wrong=bindings.map(x=>x.name==="GEOMACRO_SOURCE_SHA"?
  {...x,text:"b".repeat(40)}:x);
 assert.equal(check(1,0,{candidateVersion:{
  ...version(B),resources:{bindings:wrong}
 }}).reason,"VERSION_BINDING_PARITY_MISMATCH");
});
test("stale, wrong-cycle and unverified provider Paid receipts HOLD",()=>{
 const altered=[
  {status:"HOLD"},
  {provider_subscription_verified:false},
  {day_utc:"2026-11-08"},
  {cycle_start_utc:"2026-10-05"},
  {cycle_end_exclusive_utc:"2026-12-06"},
  {checked_at_utc:"2026-11-09T09:57:00.000Z"},
  {lane:"research"},
  {reserve_pct:10},
  {old_daily_140k_policy_applied:true},
  {provider_metrics_may_lag:false},
  {account_wide_hard_cap_guaranteed:true},
  {payment_activation_authorized:true},
  {no_d1_sql_or_write_issued:false},
  {monthly_ceiling_written:50_000_000},
  {operational_daily_ceiling_written:140_000},
  {database_count:0},
  {remaining_rows_written:100},
  {monthly_paced_ceiling_written:quota.observed_rows_written},
  {observed_rows_written:quota.observed_rows_written+1},
 ];
 for(const item of altered){
  assert.equal(check(1,0,{quota:{...quota,...item}}).eligible,false,
   "should HOLD: "+JSON.stringify(item));
 }
});
test("monthly quota OVERAGE and pacing violation hold despite real Workers Paid plan",()=>{
 const exhausted=assessD1PaidMonthlyAdmission({
  usage:{...usage(),observed_rows_written:35_000_000},
  paidProof:paidProof(),now:NOW,lane:"canary"
 });
 assert.equal(exhausted.status,"HOLD");
 assert.equal(check(1,0,{quota:exhausted}).eligible,false);
});
test("enforced spend policy still requires independent provider proof",()=>{
 assert.equal(check(1,0,{spendPolicyEnforced:true}).reason,"SPEND_POLICY_UNVERIFIED");
 assert.equal(check(1,0,{spendPolicyEnforced:true,quota:{
  ...quota,paid_capacity_probe_status:"VERIFIED",paid_capacity_verified_by_provider:true
 }}).eligible,true);
});
test("remote split cannot be skipped and Hot50 runtime flags require physical readback",()=>{
 assert.equal(check(0,1).reason,"BASELINE_NOT_100_PERCENT");
 assert.equal(check(5,0).reason,"CURRENT_SPLIT_NOT_PREVIOUS_STAGE");
 assert.equal(check(1,0,{deployment:at(0,false)}).eligible,false);
 const bad=bindings.map(x=>x.name==="GEOMACRO_P1_BUNDLED_LEASES_ENABLED"?
  {...x,text:"0"}:x);
 assert.equal(check(1,0,{candidateVersion:{
  ...version(B),resources:{bindings:bad}
 }}).reason,"VERSION_BINDING_PARITY_MISMATCH");
});
test("only provider Paid monthly governor can admit both optimized candidate and protected promotion",()=>{
 const verifier=readFileSync(
  "scripts/ops/verify-protected-worker-promotion.mjs","utf8");
 const candidate=readFileSync(
  "scripts/ops/prepare-optimized-worker-candidate.mjs","utf8");
 const promoted=readFileSync(
  ".github/workflows/geomacro-protected-hot50-worker-rollout.yml","utf8");
 assert.match(verifier,/checkD1PaidMonthlyHeadroom/u);
 assert.match(verifier,/plan\(\{env,fetchImpl,now,lane:"canary"\}\)/u);
 assert.doesNotMatch(verifier,/plan-d1-bundled-work\.mjs|d1-owner-daily-envelope\.mjs/u);
 assert.match(candidate,/checkD1PaidMonthlyHeadroom/u);
 assert.match(candidate,/CANDIDATE_PAID_MONTHLY_PROVIDER_HEADROOM_HOLD/u);
 assert.doesNotMatch(candidate,/checkD1BundledWork/u);
 assert.match(promoted,/admitSignedStep3ProductionFile\(\)/u);
 assert.match(promoted,/config\/d1-hotspot-v2-canary\.hold/u);
});

test("protected preflight admits only explicit reviewed Hot50+secret delta, still no funds",()=>{
 const intake={RISK_GATE_COUNTRY_SCOPE:"HOT50",RISK_STREAM_ACTIVE:"1",
  STREAM_INGESTION_ENABLED:"true",RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1"};
 const base=bindings.map(x=>x.name==="RISK_GATE_COUNTRY_SCOPE"?
  {...x,text:"GLOBAL"}:x).concat([
   {name:"RISK_STREAM_ACTIVE",type:"plain_text",text:"0"},
   {name:"STREAM_INGESTION_ENABLED",type:"plain_text",text:"false"},
   {name:"RISK_STREAM_HOT50_AUTONOMOUS_ENABLED",type:"plain_text",text:"0"}]);
 const add={name:"GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",type:"secret_text"};
 const candidate=base.map(x=>Object.hasOwn(intake,x.name)?{...x,text:intake[x.name]}:x).concat([add]);
 const opts={baselineVersion:{id:A,resources:{bindings:base}},
  candidateVersion:{id:B,resources:{bindings:candidate}},
  reviewedFlagProfile:"HOT50_INTAKE_REVIEWED",
  reviewedAdditiveSecretNames:[add.name]};
 const yes=check(1,0,opts);
 assert.equal(yes.eligible,true,JSON.stringify(yes));
 assert.equal(yes.no_funds,true);
 assert.equal(check(1,0,{...opts,reviewedFlagProfile:""}).reason,
  "VERSION_BINDING_PARITY_MISMATCH");
 assert.equal(check(1,0,{...opts,reviewedAdditiveSecretNames:[]}).reason,
  "VERSION_BINDING_PARITY_MISMATCH");
 const hostile=candidate.map(x=>x.name==="GEOMACRO_COMMERCIAL_STREAM_RELEASE"?
  {...x,text:"1"}:x);
 assert.equal(check(1,0,{...opts,candidateVersion:{id:B,resources:{bindings:hostile}}}).reason,
  "VERSION_BINDING_PARITY_MISMATCH");
});
