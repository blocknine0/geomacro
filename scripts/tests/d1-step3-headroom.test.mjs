import {test} from "node:test";
import assert from "node:assert/strict";
import {assessD1MigrationHeadroom,checkD1Headroom,
 HEADROOM_HOLD_CODE,STEP3_BUDGET} from "../ops/check-d1-headroom.mjs";
import {
 parseD1PaidCycleGraphQL,assessD1PaidMonthlyAdmission
} from "../lib/d1-workers-paid-monthly-governor.mjs";
import {assessOneChangedBatchDelta}
 from "../ops/verify-d1-publisher-billable-shadow.mjs";

const DAY=new Date("2026-11-08T09:00:00.000Z");
function paidProof(now=DAY){return{
 schema:"geomacro.cloudflare-workers-paid-provider-proof.v1",
 verified:true,source:"CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ",
 subscription_changed:false,billing_action_performed:false,
 observed_at:now.toISOString()
}}
function usage(read,written,at=DAY){
 return {schema:"geomacro.d1-paid-monthly-provider-usage.v1",
  source:"CLOUDFLARE_GRAPHQL_ALL_ACCOUNT_D1_DATABASES",
  provider_usage_observed:true,
  billing_cycle_start_utc:"2026-11-05",
  billing_cycle_end_exclusive_utc:"2026-12-05",
  observed_through_utc:"2026-11-08",
  observed_at_utc:at.toISOString(),
  observed_rows_read:read,observed_rows_written:written,
  database_count_observed:4,group_count_observed:6,
  telemetry_is_delayed:true};
}
const paid=(read,written)=>assessD1PaidMonthlyAdmission({
 usage:usage(read,written),paidProof:paidProof(),now:DAY,lane:"migration"
});
test("Paid migration gate ignores retired 140k/day, admits only monthly observed reserve",()=>{
 assert.equal(STEP3_BUDGET.old_daily_140k_policy_applied,false);
 assert.equal(STEP3_BUDGET.provider_included_monthly_rows_written,50_000_000);
 const current=assessD1MigrationHeadroom(paid(18_140_000,1_350_000),{now:DAY});
 assert.equal(current.status,"PASS");
 assert.equal(current.remaining_rows_written,33_650_000);
 assert.equal(current.required_migration_reserve_written,1_000_000);
 assert.equal(current.authorization_scope,"MIGRATIONS_ONLY_NOT_DEPLOYMENT_OR_PAYMENTS");
 assert.equal(current.pr_merge_authorized,false);
 // A cumulative 267k-write UTC day no longer wrongly blocks legitimate
 // remaining 5th-to-5th Paid capacity.
 assert.equal(assessD1MigrationHeadroom(paid(1_258_943,267_009),{now:DAY}).status,"PASS");
});
test("30pct reserve, missing plan and stale cycle remain NOT_YET_VERIFIED",()=>{
 for(const x of [paid(22_499_000_000,10),
  paid(100,44_990_000),null,
  {...paid(100,100),day_utc:"2026-11-07"},
  {...paid(100,100),provider_subscription_verified:false},
  {...paid(100,100),old_daily_140k_policy_applied:true}]){
  const r=assessD1MigrationHeadroom(x,{now:DAY});
  assert.equal(r.status,"NOT_YET_VERIFIED");
  assert.equal(r.code,HEADROOM_HOLD_CODE);
  assert.equal(r.hold_file_untouched,true);
  assert.equal(r.payment_activation_authorized,false);
 }
});

test("Step3 exact 30pct monthly reserve cannot be bypassed by stale 10pct receipts",()=>{
 const admission=paid(18_140_000,1_350_000);
 assert.equal(admission.status,"PASS");
 assert.equal(admission.reserve_pct,30);
 assert.equal(STEP3_BUDGET.owner_normal_monthly_rows_read,17_500_000_000);
 assert.equal(STEP3_BUDGET.owner_normal_monthly_rows_written,35_000_000);
 assert.equal(assessD1MigrationHeadroom(admission,{now:DAY}).status,"PASS");
 for(const altered of [
  {reserve_pct:10},
  {monthly_ceiling_read:22_500_000_000},
  {monthly_ceiling_written:45_000_000},
  {operational_daily_ceiling_read:140_000},
  {operational_daily_ceiling_written:140_000},
  {operational_hourly_ceiling_read:undefined},
  {operational_hourly_ceiling_written:50_000},
  {reserved_migration_rows_written:0},
  {reserved_migration_rows_read:0},
 ]){
  const blocked=assessD1MigrationHeadroom({...admission,...altered},{now:DAY});
  assert.equal(blocked.status,"NOT_YET_VERIFIED",JSON.stringify(altered));
 }
});
test("account-wide 5th-to-5th GraphQL includes every database across multiple dates",()=>{
 const input={data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[
  {dimensions:{databaseId:"production-d1-xxxx",date:"2026-11-05"},
   sum:{rowsRead:15_000_000,rowsWritten:1_000_000}},
  {dimensions:{databaseId:"shadow-db-xxxx",date:"2026-11-08"},
   sum:{rowsRead:3_140_000,rowsWritten:350_000}}
 ]}]}}};
 const total=parseD1PaidCycleGraphQL(input,{now:DAY});
 assert.equal(total.observed_rows_read,18_140_000);
 assert.equal(total.observed_rows_written,1_350_000);
 const checked=assessD1PaidMonthlyAdmission({usage:total,
  paidProof:paidProof(),now:DAY,lane:"migration"});
 assert.equal(assessD1MigrationHeadroom(checked,{now:DAY}).status,"PASS");
 input.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups[1].dimensions.date="2026-10-31";
 assert.throws(()=>parseD1PaidCycleGraphQL(input,{now:DAY}),
  /D1_PAID_MONTHLY_GRAPHQL_GROUP_INVALID/u);
});
test("failed current-cycle GraphQL yields NOT_YET_VERIFIED report, no invented zero",async()=>{
 let saved=null;
 const runtimeNow=new Date();
 const r=await checkD1Headroom({
  now:runtimeNow,readProvider:async()=>{throw Error("D1_PAID_MONTHLY_GRAPHQL_PERMISSION_MISSING")},
  reportPath:"artifacts/release/test-step3-paid-monthly.json",
  write:(_path,data)=>{saved=JSON.parse(data)}
 });
 assert.equal(r.status,"NOT_YET_VERIFIED");
 assert.equal(r.code,HEADROOM_HOLD_CODE);
 assert.equal(r.observed_rows_read,null);
 assert.equal(saved.hold_file_untouched,true);
 assert.equal(saved.account_wide_reservation_atomic,false);
});
test("50-item unchanged retry is physically zero and changed delta equals independent control",()=>{
 const run=(first,retry,one,control,individual=100)=>
  assessOneChangedBatchDelta({
   firstWrite:{rows_read:150,rows_written:first,changes:100},
   retry:{rows_read:120,rows_written:retry,changes:0},
   oneChanged:{rows_read:130,rows_written:one,changes:2},
   singleControl:{rows_read:1,rows_written:control,changes:2},
   singleItemTotal:individual
  });
 assert.equal(run(150,0,3,3).accepted,true);
 assert.equal(run(150,1,3,3).accepted,false);
 assert.equal(run(150,0,1,3).accepted,false);
 assert.equal(run(150,0,3,0).accepted,false);
});
