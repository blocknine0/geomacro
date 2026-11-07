import test from "node:test";
import assert from "node:assert/strict";
import {verifyProtectedD1CanaryPreflight}
 from "../ops/verify-protected-d1-zero-canary-preflight.mjs";
const at=new Date("2026-11-07T10:00:00.000Z");
const env={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:"a".repeat(40),
 CLOUDFLARE_ACCOUNT_ID:"b".repeat(32),
 CLOUDFLARE_API_TOKEN:"private-"+("c".repeat(50)),
 CLOUDFLARE_BILLING_READ_TOKEN:"private-"+("d".repeat(50)),
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
const allowedPlan={
 workers_paid_subscription_verified:true,
 paid_capacity_probe_status:"VERIFIED",
 paid_capacity_verified_by_provider:true,
 observed_rows_read:50000,observed_rows_written:40000,
 owner_d1_utc_daily_targets:{
  rows_read:140000,normal_rows_written:140000,rows_written:180000,
  emergency_rows_written:40000,emergency_auto_admission:false,
  safety_buffer_rows_read:4000,safety_buffer_rows_written:2000,
 },
};
test("canary preflight only reads provider metadata, never promotes Worker or D1",async()=>{
 calls.length=0;
 const r=await verifyProtectedD1CanaryPreflight({
  env,now:at,fetchImpl:mockFetch,plan:async()=>allowedPlan
 });
 assert.equal(r.eligible_for_zero_traffic_stage,true);
 assert.equal(r.worker_version_uploaded,false);
 assert.equal(r.d1_sql_queries_issued,0);
 assert.equal(r.provider_write_operations,0);
 assert.equal(r.traffic_percent,0);
 assert.equal(r.d1_migration_state_verified,false);
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>x.startsWith("https://api.cloudflare.com/")));
 const out=JSON.stringify(r);
 assert.ok(!out.includes(id));
 assert.ok(!out.includes(ver));
 assert.ok(!out.includes(env.CLOUDFLARE_ACCOUNT_ID));
 assert.ok(!out.includes(env.CLOUDFLARE_API_TOKEN));
});
test("spend-policy 404 is advisory while owner daily cap still HOLDS without spending emergency",async()=>{
 const base={env,now:at,fetchImpl:mockFetch};
 const spend=await verifyProtectedD1CanaryPreflight({...base,
  plan:async()=>({...allowedPlan,paid_capacity_probe_status:
   "CLOUDFLARE_FIVE_USD_SPEND_POLICIES_HTTP_404_CF_CODE_1003",
   paid_capacity_verified_by_provider:false})
 });
 assert.equal(spend.eligible_for_zero_traffic_stage,true);
 assert.equal(spend.spend_policy_verified,false);
 assert.equal(spend.spend_policy_verification_enforced,false);
 assert.equal(spend.reason,"ZERO_TRAFFIC_PREFLIGHT_READY");
 const rows=await verifyProtectedD1CanaryPreflight({...base,
  plan:async()=>({...allowedPlan,observed_rows_read:136001})
 });
 assert.equal(rows.reason,"CANARY_ACCOUNT_D1_BUDGET_HELD");
 const writes=await verifyProtectedD1CanaryPreflight({...base,
  plan:async()=>({...allowedPlan,observed_rows_written:138100})
 });
 assert.equal(writes.reason,"CANARY_ACCOUNT_D1_BUDGET_HELD");
 assert.equal(writes.emergency_write_reserve,40000);
});
test("bad baseline, unverified bookmark or provider 403 never count as canary-ready",async()=>{
 const base={env,now:at,plan:async()=>allowedPlan};
 const denied=await verifyProtectedD1CanaryPreflight({...base,
  fetchImpl:async()=>({status:403,json:async()=>({success:false})})});
 assert.equal(denied.reason,"CANARY_PROVIDER_READ_FAILED");
 const broken=await verifyProtectedD1CanaryPreflight({...base,
  fetchImpl:async url=>({status:200,json:async()=>({
   success:true,result:url.includes("/time_travel/bookmark")?
   {bookmark:""}:url.includes("/workers/scripts/")?
   {deployments:[{versions:[{version_id:ver,percentage:100}]}]}:
   [{name:"geomacro-control-plane",uuid:id}]
  })})});
 assert.equal(broken.reason,"D1_BOOKMARK_UNVERIFIED");
 const stale=await verifyProtectedD1CanaryPreflight({...base,
  fetchImpl:async url=>({status:200,json:async()=>({
   success:true,result:url.includes("/time_travel/bookmark")?
   {bookmark:"00000001-00000002-00000003-abcdefabcdef123456789abc"}:
   url.includes("/workers/scripts/")?
   {deployments:[{versions:[{version_id:ver,percentage:50}]}]}:
   [{name:"geomacro-control-plane",uuid:id}]
  })})});
 assert.equal(stale.reason,"WORKER_DEPLOYED_VERSION_UNVERIFIED");
});

test("early UTC burn-rate spike HOLDS even below 140k; emergency writes never release",async()=>{
 const early=new Date("2026-11-07T01:00:00.000Z");
 const base={env,now:early,fetchImpl:mockFetch};
 const highReads=await verifyProtectedD1CanaryPreflight({...base,
  plan:async()=>({...allowedPlan,observed_rows_read:11000,observed_rows_written:1000})
 });
 assert.equal(highReads.reason,"CANARY_ACCOUNT_D1_BUDGET_HELD");
 assert.equal(highReads.pacing_or_daily_ceiling_held,true);
 assert.equal(highReads.account_wide_atomic_140k_guaranteed,false);
 const highWrites=await verifyProtectedD1CanaryPreflight({...base,
  plan:async()=>({...allowedPlan,observed_rows_read:1000,observed_rows_written:9000})
 });
 assert.equal(highWrites.reason,"CANARY_ACCOUNT_D1_BUDGET_HELD");
 assert.equal(highWrites.emergency_write_reserve,40000);
 const safe=await verifyProtectedD1CanaryPreflight({...base,
  plan:async()=>({...allowedPlan,observed_rows_read:100,observed_rows_written:100})
 });
 assert.equal(safe.eligible_for_zero_traffic_stage,true);
});
