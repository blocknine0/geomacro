import test from "node:test";
import assert from "node:assert/strict";
import {assessProviderWorkersPaidSubscription,readCloudflareWorkersPaidProof,
 WORKERS_PAID_PROOF_SCHEMA} from "../lib/cloudflare-workers-paid-plan-proof.mjs";
import {planD1BundledWork,checkD1BundledWork} from "../ops/plan-d1-bundled-work.mjs";
import {D1_FREE_DAILY} from "../ops/audit-d1-account-daily-quota-readonly.mjs";
import {assessFiveUsdSpendPolicies} from "../lib/cloudflare-five-usd-spend-guard.mjs";

const now=new Date("2026-10-27T18:00:00.000Z");
const paid={success:true,errors:[],result:[{
 state:"Paid",rate_plan:{id:"workers_paid",scope:"account",public_name:"Workers Paid"},
 current_period_end:"2026-11-27T00:00:00.000Z",
}]};
const usage=(read,written)=>({
 schema:"geomacro.d1-account-daily-quota-readonly.v1",
 day_utc:"2026-10-27",provider_graphql_usage_observed:true,
 observed_rows_read:read,observed_rows_written:written,
 limits:{...D1_FREE_DAILY},
 remaining_rows_read:Math.max(0,5_000_000-read),
 remaining_rows_written:Math.max(0,100_000-written),
});
test("only active account-scoped Workers Paid subscription is accepted",()=>{
 const proof=assessProviderWorkersPaidSubscription(paid,now);
 assert.equal(proof.schema,WORKERS_PAID_PROOF_SCHEMA);
 assert.equal(proof.verified,true);
 assert.equal(proof.subscription_changed,false);
 for(const row of [
  {state:"Cancelled",rate_plan:{id:"workers_paid",scope:"account"}},
  {state:"Trial",rate_plan:{id:"workers_paid",scope:"account"}},
  {state:"Paid",rate_plan:{id:"workers_paid",scope:"zone"}},
  {state:"Paid",rate_plan:{id:"free",scope:"account"}},
  {state:"Paid",rate_plan:{id:"workers_paid",scope:"account"},
   current_period_end:"2026-10-20T00:00:00.000Z"},
 ]){
  assert.throws(()=>assessProviderWorkersPaidSubscription({success:true,result:[row]},now),
   /ACTIVE_PLAN_NOT_PROVEN/);
 }
 assert.throws(()=>assessProviderWorkersPaidSubscription({success:true,result:[]},now));
 assert.throws(()=>assessProviderWorkersPaidSubscription({
  ...paid,result:[...paid.result,...paid.result]},now));
});
test("Free cap stays hard fail-closed without real paid proof",()=>{
 const snapshot=usage(5_763_167,25_745);
 const free=planD1BundledWork(snapshot,{now});
 assert.equal(free.critical,false);
 assert.equal(free.state,"HELD");
 for(const proof of [
  null,{schema:WORKERS_PAID_PROOF_SCHEMA,verified:true,source:"USER_ENV_FLAG",
    observed_at:now.toISOString(),subscription_changed:false,billing_action_performed:false},
  {...assessProviderWorkersPaidSubscription(paid,now),
   observed_at:"2026-10-27T16:00:00.000Z"},
  {...assessProviderWorkersPaidSubscription(paid,now),subscription_changed:true},
 ]){
  assert.equal(planD1BundledWork(snapshot,{now,paidProof:proof}).critical,false);
 }
});
test("fresh authentic Workers Paid proof admits ONLY critical source work under account daily soft limit",()=>{
 const proof=assessProviderWorkersPaidSubscription(paid,now);
 const spendGuardProof=assessFiveUsdSpendPolicies({success:true,result:[
  ...["workers","durable_objects"].map((product_id,i)=>({
   id:"lock-"+i,product_id,action:"usage_block",enabled:true,
   threshold_cents:1,version:1,current_state:{status:"below_limit"},
  })),
 ]},now);
 assert.equal(planD1BundledWork(usage(5_763_167,25_745),
  {now,paidProof:proof}).critical,false);
 const grant=planD1BundledWork(usage(5_763_167,25_745),
  {now,paidProof:proof,spendGuardProof});
 assert.equal(grant.critical,true);
 assert.equal(grant.state,"CRITICAL_ONLY");
 assert.equal(grant.paid_capacity_verified_by_provider,true);
 assert.equal(grant.source_intake,true);
 assert.ok(grant.source_intake_max_new_rows>=3&&grant.source_intake_max_new_rows<=100);
 assert.equal(grant.phase2h_raw_archive,true);
 assert.equal(grant.phase2h_raw_archive_requires_atomic_b2_quota,true);
 assert.equal(grant.research,false);
 assert.equal(grant.maintenance,false);
 assert.equal(grant.snapshot_refresh,false);
 assert.equal(grant.structural_snapshot,false);
 assert.ok(grant.daily_account_soft_limit_read<=18_000_000);
 assert.ok(grant.daily_account_soft_limit_write<=180_000);
 assert.equal(grant.paid_subscription_change_performed,false);
 const reset=new Date("2026-10-27T00:00:00.000Z");
 const atReset=planD1BundledWork(usage(0,0),{now:reset,
  paidProof:{...proof,observed_at:reset.toISOString()},
  spendGuardProof:{...spendGuardProof,observed_at:reset.toISOString()}});
 assert.equal(atReset.source_intake,true);
 assert.ok(atReset.source_intake_max_new_rows>=3);
 assert.equal(atReset.phase2h_raw_archive,true);
 const tight=planD1BundledWork(usage(5_763_167,140_000),
  {now,paidProof:proof,spendGuardProof});
 assert.equal(tight.critical,true);
 assert.equal(tight.source_intake,false);
 assert.equal(tight.source_intake_max_new_rows,0);
 assert.equal(tight.phase2h_raw_archive,false);
 assert.equal(planD1BundledWork(usage(19_000_000,50_000),
  {now,paidProof:proof,spendGuardProof}).critical,false);
 assert.equal(planD1BundledWork(usage(5_763_167,181_000),
  {now,paidProof:proof,spendGuardProof}).critical,false);
});
test("Billing Read uses account-scoped Cloudflare GET and never updates a subscription",async()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
  CLOUDFLARE_BILLING_READ_TOKEN:"b".repeat(32)};
 let seen=0;
 const proof=await readCloudflareWorkersPaidProof({env,now,fetchImpl:async(url,config)=>{
  seen++;
  assert.equal(url,"https://api.cloudflare.com/client/v4/accounts/"+
   env.CLOUDFLARE_ACCOUNT_ID+"/subscriptions");
  assert.equal(config.method,"GET");
  assert.equal(config.redirect,"error");
  return {status:200,json:async()=>paid};
 }});
 assert.equal(seen,1);
 assert.equal(proof.verified,true);
 await assert.rejects(()=>readCloudflareWorkersPaidProof({
  env:{...env,CLOUDFLARE_BILLING_READ_TOKEN:undefined},now,
  fetchImpl:async()=>{throw Error("MUST_NOT_FETCH")}}),/PERMISSION_REQUIRED/);
});
test("live planner with paid-provider proof is still no-D1-query and refuses forged Billing data",async()=>{
 const account="a".repeat(32),env={
  CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:"b".repeat(32),
  CLOUDFLARE_BILLING_READ_TOKEN:"c".repeat(32),
 };
 const graphql={data:{viewer:{accounts:[{
  d1AnalyticsAdaptiveGroups:[{
   dimensions:{databaseId:"d1-"+account,date:"2026-10-27"},
   sum:{rowsRead:5_763_167,rowsWritten:25_745},
  }],
 }]}}};
 let reads=0;
 const fetchImpl=async(url,init)=>{
  reads++;
  if(url.endsWith("/graphql"))return {ok:true,json:async()=>graphql};
  if(url.includes("/subscriptions"))return {status:200,json:async()=>paid};
  if(url.endsWith("/billing/spend-policies"))return {status:200,json:async()=>({
   success:true,result:["workers","durable_objects"].map((product_id,i)=>({
    id:"block-"+i,product_id,enabled:true,action:"usage_block",
    threshold_cents:1,version:1,current_state:{status:"below_limit"},
   })),
  })};
  throw Error("UNEXPECTED_PROVIDER");
 };
 const granted=await checkD1BundledWork({env,now,fetchImpl});
 assert.equal(reads,3);
 assert.equal(granted.critical,true);
 assert.equal(granted.d1_queries,0);
 assert.equal(granted.paid_calls,0);
 const blocked=await checkD1BundledWork({env,now,fetchImpl:async(url,init)=>{
  if(url.endsWith("/graphql"))return {ok:true,json:async()=>graphql};
  if(url.includes("/subscriptions"))return {status:200,json:async()=>paid};
  if(url.endsWith("/billing/spend-policies"))return {status:200,json:async()=>({
   success:true,result:[{id:"not-a-lock",product_id:"workers",
    enabled:true,action:"notification",threshold_cents:1,version:1,
    current_state:{status:"below_limit"}}],
  })};
  throw Error("UNEXPECTED_PROVIDER");
 }});
 assert.equal(blocked.critical,false);
 assert.equal(blocked.state,"HELD");
 const existingToken=await checkD1BundledWork({
  env:{CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:"b".repeat(32)},
  now,fetchImpl});
 assert.equal(existingToken.critical,true);
 assert.equal(existingToken.paid_capacity_verified_by_provider,true);
 assert.equal(existingToken.paid_capacity_probe_status,"VERIFIED");
 const denied=await checkD1BundledWork({
  env,now,fetchImpl:async(url,init)=>
   url.endsWith("/graphql")?{ok:true,json:async()=>graphql}:
   {status:403,json:async()=>({})},
 });
 assert.equal(denied.critical,false);
 assert.equal(denied.paid_capacity_probe_status,"WORKERS_PAID_BILLING_READ_HTTP_403");
});
