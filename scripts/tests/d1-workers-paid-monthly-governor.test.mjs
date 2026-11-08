import test from "node:test";
import assert from "node:assert/strict";
import {
 D1_PAID_MONTHLY_POLICY,paidD1BillingCycle,assertPaidMonthlyPolicy,
 parseD1PaidCycleGraphQL,assessD1PaidMonthlyAdmission,
 checkD1PaidMonthlyHeadroom
} from "../lib/d1-workers-paid-monthly-governor.mjs";

const now=new Date("2026-11-08T12:35:00.000Z");
const cycle=paidD1BillingCycle(now);
const groups=[{
 dimensions:{databaseId:"db-first-00000000",date:"2026-11-05"},
 sum:{rowsRead:15_000_000,rowsWritten:1_000_000}
},{
 dimensions:{databaseId:"db-second-00000000",date:"2026-11-08"},
 sum:{rowsRead:3_140_000,rowsWritten:350_000}
}];
const gql=x=>({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:x}]}}});
const paid={
 schema:"geomacro.cloudflare-workers-paid-provider-proof.v1",
 verified:true,source:"CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ",
 subscription_changed:false,billing_action_performed:false,
 observed_at:now.toISOString()
};
function usage(){return parseD1PaidCycleGraphQL(gql(groups),{now})}
test("exact Nov5-Dec5 billing cycle and next cycle year rollover are deterministic",()=>{
 assert.equal(cycle.start_utc,"2026-11-05");
 assert.equal(cycle.end_exclusive_utc,"2026-12-05");
 assert.equal(cycle.last_inclusive_utc,"2026-12-04");
 assert.deepEqual([paidD1BillingCycle(new Date("2026-12-04T23:59:59Z")).start_utc,
  paidD1BillingCycle(new Date("2026-12-05T00:00:00Z")).start_utc],
  ["2026-11-05","2026-12-05"]);
 assert.equal(paidD1BillingCycle(new Date("2027-01-01T00:00:00Z")).start_utc,
  "2026-12-05");
});
test("only real official Paid included amounts + 10% reserve are admitted, no 140k/day",()=>{
 const p=assertPaidMonthlyPolicy();
 assert.equal(p.provider_included_monthly.rows_read,25_000_000_000);
 assert.equal(p.provider_included_monthly.rows_written,50_000_000);
 assert.equal(p.owner_normal_monthly_ceiling.rows_written,45_000_000);
 assert.equal(p.owner_normal_monthly_ceiling.rows_read,22_500_000_000);
 assert.equal(p.payment_auto_activation,false);
 assert.equal(JSON.stringify(p).includes("140000"),false);
});
test("GraphQL sums all D1 database/date groups across the exact month without Free daily limits",()=>{
 const x=usage();
 assert.equal(x.observed_rows_read,18_140_000);
 assert.equal(x.observed_rows_written,1_350_000);
 assert.equal(x.database_count_observed,2);
 assert.equal(x.group_count_observed,2);
 assert.equal(x.billing_cycle_end_exclusive_utc,"2026-12-05");
 assert.equal(x.provider_usage_observed,true);
 const r=assessD1PaidMonthlyAdmission({usage:x,paidProof:paid,now,
  estimatedMigrationRowsRead:5_000_000,estimatedMigrationRowsWritten:250_000});
 assert.equal(r.status,"PASS");
 assert.equal(r.old_daily_140k_policy_applied,false);
 assert.equal(r.account_wide_hard_cap_guaranteed,false);
 assert.equal(r.payment_activation_authorized,false);
});
test("missing today's dated group, duplicate ID/date, truncation or stale cycle is HOLD",()=>{
 const bad=[
  gql(groups.slice(0,1)),gql([groups[1],groups[1]]),
  gql(new Array(1000).fill(groups[1])),
  gql([{...groups[1],dimensions:{...groups[1].dimensions,date:"2026-11-04"}}]),
  {errors:[{message:"provider error"}]},gql([])
 ];
 for(const body of bad){
  assert.throws(()=>parseD1PaidCycleGraphQL(body,{now}),/D1_PAID_MONTHLY_/u);
 }
 const stale={...usage(),observed_through_utc:"2026-11-07"};
 assert.equal(assessD1PaidMonthlyAdmission({usage:stale,paidProof:paid,now}).status,"HOLD");
});
test("missing/expired Paid subscription fails even with large monthly headroom",()=>{
 const x=usage();
 for(const proof of [null,{...paid,verified:false},
  {...paid,observed_at:"2026-11-08T10:00:00.000Z"}]){
  const r=assessD1PaidMonthlyAdmission({usage:x,paidProof:proof,now});
  assert.equal(r.status,"HOLD");
 }
});
test("monthly 90% included ceiling, pacing and worst-case migration costs hold correctly",()=>{
 const x=usage();
 for(const mutation of [
  {...x,observed_rows_written:45_000_000},
  {...x,observed_rows_read:22_500_000_000},
  {...x,observed_rows_written:30_000_000}
 ]){
  assert.equal(assessD1PaidMonthlyAdmission({usage:mutation,paidProof:paid,now}).status,"HOLD");
 }
 const excessive=assessD1PaidMonthlyAdmission({usage:x,paidProof:paid,now,
  estimatedMigrationRowsWritten:9999999});
 assert.equal(excessive.status,"HOLD");
 assert.match(excessive.reason,/ESTIMATED_COST_EXCEEDS/u);
});
test("real provider fetch connector uses only account read and never D1 SQL",async()=>{
 let calls=[];
 const fetchImpl=async (url,req)=>{
  calls.push({url,method:req.method});
  if(url.endsWith("/graphql")){
   const request=JSON.parse(req.body);
   assert.equal(request.variables.start,"2026-11-05");
   assert.equal(request.variables.end,"2026-11-08");
   return {status:200,json:async()=>gql(groups)};
  }
  if(url.endsWith("/subscriptions")){
   return {status:200,json:async()=>({success:true,result:[{
    state:"Paid",rate_plan:{id:"workers_paid",scope:"account"},
    current_period_start:"2026-11-05T00:00:00Z",
    current_period_end:"2026-12-05T00:00:00Z"
   }]})};
  }
  throw Error("unexpected provider URL");
 };
 // This is only a unit-level simulated provider: it must never claim a
 // production rehearsal or authorize the actual GitHub release.
 const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  CLOUDFLARE_API_TOKEN:"not-real-token-for-unit-tests-only"};
 const r=await checkD1PaidMonthlyHeadroom({env,now,fetchImpl,clock:()=>now});
 assert.equal(r.status,"PASS");
 assert.deepEqual(calls.map(x=>x.method),["POST","GET"]);
 assert.equal(r.account_wide_hard_cap_guaranteed,false);
});
