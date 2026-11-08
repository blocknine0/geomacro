import test from "node:test";
import assert from "node:assert/strict";
import {verifyProtectedD1CanaryPreflight}
 from "../ops/verify-protected-d1-zero-canary-preflight.mjs";
const at=new Date("2026-11-07T10:00:00.000Z");
const env={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:"a".repeat(40),
 CLOUDFLARE_ACCOUNT_ID:"b".repeat(32),
 CLOUDFLARE_API_TOKEN:"private-"+"c".repeat(50),
 CLOUDFLARE_BILLING_READ_TOKEN:"private-"+"d".repeat(50),
};
const id="11111111-1111-4111-8111-111111111111";
const ver="22222222-2222-4222-8222-222222222222";
const calls=[];
const mockFetch=async url=>{
 calls.push(url);
 const data=url.includes("/workers/scripts/")?
  {deployments:[{versions:[{version_id:ver,percentage:100}]}]}:
  url.includes("/time_travel/bookmark")?
   {bookmark:"00000001-00000002-00000003-abcdefabcdef123456789abc"}:
   [{name:"geomacro-control-plane",uuid:id}];
 return {status:200,json:async()=>({success:true,result:data})};
};
const monthly={
 schema:"geomacro.d1-paid-monthly-headroom.v1",status:"PASS",
 provider_subscription_verified:true,day_utc:"2026-11-07",
 cycle_start_utc:"2026-11-05",
 cycle_end_exclusive_utc:"2026-12-05",
 observed_rows_read:18_140_000,observed_rows_written:1_350_000,
 remaining_rows_read:22_481_860_000,remaining_rows_written:43_650_000,
 monthly_ceiling_read:22_500_000_000,
 monthly_ceiling_written:45_000_000,
 paid_included_rows_read:25_000_000_000,
 paid_included_rows_written:50_000_000,
 reserve_pct:10,old_daily_140k_policy_applied:false
};
const allowedPlan={
 workers_paid_subscription_verified:true,
 paid_capacity_probe_status:"VERIFIED",
 paid_capacity_verified_by_provider:true,
 paid_monthly_account_wide_verified:true,
 monthly_owner_headroom:monthly
};
test("canary preflight checks protected provider identity only, never moves traffic",async()=>{
 calls.length=0;
 const r=await verifyProtectedD1CanaryPreflight({
  env,now:at,fetchImpl:mockFetch,plan:async()=>allowedPlan
 });
 assert.equal(r.eligible_for_zero_traffic_stage,true);
 assert.equal(r.provider_write_operations,0);
 assert.equal(r.d1_sql_queries_issued,0);
 assert.equal(r.traffic_percent,0);
 assert.equal(r.monthly_read_target,22_500_000_000);
 assert.equal(r.monthly_write_target,45_000_000);
 assert.equal(r.old_daily_140k_policy_applied,false);
 assert.equal(calls.length,3);
 const out=JSON.stringify(r);
 for(const secret of [id,ver,env.CLOUDFLARE_ACCOUNT_ID,env.CLOUDFLARE_API_TOKEN])
  assert.equal(out.includes(secret),false);
});
test("missing monthly provider proof or included reserve HOLD; advisory Spend Policy doesn't fake Paid status",async()=>{
 const base={env,now:at,fetchImpl:mockFetch};
 const spend=await verifyProtectedD1CanaryPreflight({...base,
  plan:async()=>({...allowedPlan,paid_capacity_probe_status:
   "CLOUDFLARE_FIVE_USD_SPEND_POLICIES_HTTP_404_CF_CODE_1003",
   paid_capacity_verified_by_provider:false})
 });
 assert.equal(spend.eligible_for_zero_traffic_stage,true);
 assert.equal(spend.spend_policy_verified,false);
 assert.equal(spend.spend_policy_verification_enforced,false);
 for(const change of [
  {status:"HOLD"},{day_utc:"2026-11-06"},
  {remaining_rows_written:0},
  {monthly_ceiling_written:50_000_000},
  {reserve_pct:0},{old_daily_140k_policy_applied:true}
 ]){
  const r=await verifyProtectedD1CanaryPreflight({...base,
   plan:async()=>({...allowedPlan,
    monthly_owner_headroom:{...monthly,...change}})
  });
  assert.equal(r.reason,"CANARY_ACCOUNT_D1_BUDGET_HELD");
 }
});
test("no legacy daily 140k block for a paid monthly receipt",async()=>{
 const r=await verifyProtectedD1CanaryPreflight({env,now:at,
  fetchImpl:mockFetch,
  plan:async()=>({...allowedPlan,observed_rows_read:15_000_000,
   observed_rows_written:1_000_000})});
 assert.equal(r.reason,"ZERO_TRAFFIC_PREFLIGHT_READY");
 assert.equal(r.eligible_for_zero_traffic_stage,true);
});
test("D1 bookmark, active single-version Worker and private privileges still required",async()=>{
 const base={env,now:at,plan:async()=>allowedPlan};
 const fail=await verifyProtectedD1CanaryPreflight({...base,
  fetchImpl:async()=>({status:403,json:async()=>({success:false})})});
 assert.equal(fail.reason,"CANARY_PROVIDER_READ_FAILED");
 const bad=await verifyProtectedD1CanaryPreflight({...base,
  fetchImpl:async url=>({status:200,json:async()=>({
   success:true,result:url.includes("/time_travel/bookmark")?
    {bookmark:""}:url.includes("/workers/scripts/")?
    {deployments:[{versions:[{version_id:ver,percentage:100}]}]}:
    [{name:"geomacro-control-plane",uuid:id}]
  })})});
 assert.equal(bad.reason,"D1_BOOKMARK_UNVERIFIED");
 const split=await verifyProtectedD1CanaryPreflight({...base,
  fetchImpl:async url=>({status:200,json:async()=>({
   success:true,result:url.includes("/time_travel/bookmark")?
    {bookmark:"00000001-00000002-00000003-abcdefabcdef123456789abc"}:
    url.includes("/workers/scripts/")?
    {deployments:[{versions:[{version_id:ver,percentage:25}]}]}:
    [{name:"geomacro-control-plane",uuid:id}]
  })})});
 assert.equal(split.reason,"WORKER_DEPLOYED_VERSION_UNVERIFIED");
});
