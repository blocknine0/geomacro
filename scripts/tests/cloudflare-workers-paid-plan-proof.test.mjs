import test from "node:test";
import assert from "node:assert/strict";
import {
 assessProviderWorkersPaidSubscription,readCloudflareWorkersPaidProof,
 WORKERS_PAID_PROOF_SCHEMA
} from "../lib/cloudflare-workers-paid-plan-proof.mjs";
import {planD1BundledWork,checkD1BundledWork}
 from "../ops/plan-d1-bundled-work.mjs";
import {D1_FREE_DAILY}
 from "../ops/audit-d1-account-daily-quota-readonly.mjs";
import {assessD1PaidMonthlyAdmission}
 from "../lib/d1-workers-paid-monthly-governor.mjs";

const now=new Date("2026-10-27T18:00:00.000Z");
const paid={success:true,errors:[],result:[{
 state:"Paid",rate_plan:{id:"workers_paid",scope:"account"},
 current_period_end:"2026-11-05T00:00:00.000Z",
}]};
const providerPaid=assessProviderWorkersPaidSubscription(paid,now);
const usage=(read,written)=>({
 schema:"geomacro.d1-account-daily-quota-readonly.v1",
 day_utc:"2026-10-27",provider_graphql_usage_observed:true,
 observed_rows_read:read,observed_rows_written:written,
 limits:{...D1_FREE_DAILY},
 remaining_rows_read:Math.max(0,5_000_000-read),
 remaining_rows_written:Math.max(0,100_000-written),
});
function monthly(read,written,proof=providerPaid,at=now){
 return assessD1PaidMonthlyAdmission({now:at,lane:"hot50_source",
  paidProof:proof,usage:{
   schema:"geomacro.d1-paid-monthly-provider-usage.v1",
   source:"CLOUDFLARE_GRAPHQL_ALL_ACCOUNT_D1_DATABASES",
   provider_usage_observed:true,
   billing_cycle_start_utc:"2026-10-05",
   billing_cycle_end_exclusive_utc:"2026-11-05",
   observed_through_utc:"2026-10-27",observed_at_utc:now.toISOString(),
   observed_rows_read:read,observed_rows_written:written,
   database_count_observed:4,group_count_observed:4,
   telemetry_is_delayed:true
  }});
}
test("only real account-scoped active Paid subscription qualifies",()=>{
 assert.equal(providerPaid.schema,WORKERS_PAID_PROOF_SCHEMA);
 assert.equal(providerPaid.verified,true);
 for(const bad of ["Cancelled","Trial","Free"]){
  const x={success:true,result:[{state:bad,rate_plan:{id:"workers_paid",scope:"account"}}]};
  assert.throws(()=>assessProviderWorkersPaidSubscription(x,now),
   /ACTIVE_PLAN_NOT_PROVEN/u);
 }
});
test("Paid Billing Read uses GET only and rejects missing privileges",async()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  CLOUDFLARE_BILLING_READ_TOKEN:"b".repeat(32)};
 let count=0;
 const r=await readCloudflareWorkersPaidProof({env,now,fetchImpl:async(url,config)=>{
  count++;assert.equal(config.method,"GET");
  assert(url.endsWith("/subscriptions"));
  return {status:200,json:async()=>paid};
 }});
 assert.equal(count,1);assert.equal(r.verified,true);
 await assert.rejects(()=>readCloudflareWorkersPaidProof({
  env:{...env,CLOUDFLARE_BILLING_READ_TOKEN:""},
  now,fetchImpl:async()=>{throw Error("unexpected request")}
 }),/PERMISSION_REQUIRED/u);
});
test("without real paid proof Free physical caps remain conservative",()=>{
 assert.equal(planD1BundledWork(usage(5_763_167,25_745),{now}).critical,false);
 assert.equal(planD1BundledWork(usage(5_763_167,25_745),{
  now,paidProof:{...providerPaid,verified:false},
  paidMonthly:monthly(5_763_167,25_745)}).critical,false);
});
test("Workers Paid sees 25B/50M monthly inclusion, not the abolished 140k/day cap",()=>{
 const paidMonthly=monthly(18_140_000,1_350_000);
 assert.equal(paidMonthly.status,"PASS");
 const grant=planD1BundledWork(usage(1_258_943,267_009),{
  now,paidProof:providerPaid,paidMonthly});
 assert.equal(grant.critical,true);
 assert.equal(grant.source_intake,true);
 assert.equal(grant.phase2h_raw_archive,true);
 assert.equal(grant.source_intake_interval_minutes,20);
 assert(grant.source_intake_max_new_rows>=3&&
  grant.source_intake_max_new_rows<=50);
 assert.equal(grant.old_daily_140k_policy_applied,false);
 assert.equal(grant.monthly_included_read_quota,25_000_000_000);
 assert.equal(grant.monthly_included_write_quota,50_000_000);
 assert.equal(grant.research,false);
 assert.equal(grant.snapshot_refresh,false);
 assert.equal(grant.paid_calls,0);
});
test("No fresh month-wide GraphQL = HOLD, even if subscription and day's D1 are good",()=>{
 const quota=usage(1500,1500);
 assert.equal(planD1BundledWork(quota,{
  now,paidProof:providerPaid,paidMonthly:null}).state,"HELD");
 assert.equal(planD1BundledWork(quota,{
  now,paidProof:providerPaid,paidMonthly:{...monthly(1500,1500),
   status:"PASS",day_utc:"2026-10-26"}}).state,"HELD");
 const spent=monthly(18_140_000,45_000_000);
 assert.equal(spent.status,"HOLD");
 assert.equal(planD1BundledWork(quota,{
  now,paidProof:providerPaid,paidMonthly:spent}).critical,false);
});
test("Live planner fetches daily and full billing cycle, verifies Paid and never issues SQL",async()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  CLOUDFLARE_API_TOKEN:"b".repeat(32)};
 let graphQLCalls=0,paidCalls=0,requests=0;
 const fetchImpl=async(url,init)=>{
  requests++;
  if(url.endsWith("/graphql")){
   graphQLCalls++;assert.equal(init.method,"POST");
   const vars=JSON.parse(init.body).variables;
   assert.equal(vars.end,"2026-10-27");
   if(vars.start!=="2026-10-27")assert.equal(vars.start,"2026-10-05");
   const data={data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:[
    {dimensions:{databaseId:"db-a-000000000000",date:"2026-10-27"},
     sum:{rowsRead:1_258_943,rowsWritten:267_009}},
   ]}]}}};
   return {status:200,ok:true,json:async()=>data};
  }
  if(url.endsWith("/subscriptions")){
   paidCalls++;assert.equal(init.method,"GET");
   return {status:200,json:async()=>paid};
  }
  if(url.endsWith("/billing/spend-policies")){
   return {status:200,json:async()=>({success:true,result:
    ["workers","durable_objects"].map((product_id,i)=>({
     id:"policy-"+i,product_id,enabled:true,action:"usage_block",
     threshold_cents:1,version:1,current_state:{status:"below_limit"}
    }))})};
  }
  throw Error("unrecognized");
 };
 const result=await checkD1BundledWork({env,now,fetchImpl,monthlyProviderClock:()=>now});
 assert.equal(graphQLCalls,2);
 assert.equal(paidCalls,2);
 assert.equal(requests,5);
 assert.equal(result.source_intake,true);
 assert.equal(result.workers_paid_subscription_verified,true);
 assert.equal(result.paid_monthly_account_wide_verified,true);
 assert.equal(result.old_daily_140k_policy_applied,false);
 assert.equal(result.payments,undefined);
 assert.equal(result.paid_calls,0);
});
