import test from "node:test";
import assert from "node:assert/strict";
import {planD1BundledWork,checkD1BundledWork} from "../ops/plan-d1-bundled-work.mjs";
import {D1_FREE_DAILY} from "../ops/audit-d1-account-daily-quota-readonly.mjs";

const now=new Date("2026-10-27T12:00:00.000Z");
const quota=(read,written)=>({
  schema:"geomacro.d1-account-daily-quota-readonly.v1",
  day_utc:"2026-10-27",provider_graphql_usage_observed:true,
  observed_rows_read:read,observed_rows_written:written,
  limits:{...D1_FREE_DAILY},
  remaining_rows_read:Math.max(0,5_000_000-read),
  remaining_rows_written:Math.max(0,100_000-written),
});

test("one account-wide observation decides all three bounded lanes",()=>{
 const p=planD1BundledWork(quota(1_000_000,10_000),{now});
 assert.equal(p.state,"NORMAL");
 assert.equal(p.critical,true);assert.equal(p.research,true);
 assert.equal(p.maintenance,true);
 assert.equal(p.d1_queries,0);assert.equal(p.paid_calls,0);
});
test("max bundled work yields to critical ingestion instead of burning whole free D1 account",()=>{
 const p=planD1BundledWork(quota(3_900_000,50_000),{now});
 assert.equal(p.state,"CRITICAL_ONLY");
 assert.equal(p.maintenance,false);
 assert.equal(p.research,false);
 assert.equal(p.critical,true);
 const q=planD1BundledWork(quota(4_300_000,50_000),{now});
 assert.equal(q.state,"HELD");
 assert.equal(q.critical,false);
});
test("write reserve stops discretionary lanes before daily write cap",()=>{
 const q=planD1BundledWork(quota(1_000,81_000),{now});
 assert.equal(q.state,"CRITICAL_ONLY");
 assert.equal(q.critical,true);
 assert.equal(q.research,false);
 assert.equal(q.maintenance,false);
 assert.equal(planD1BundledWork(quota(1000,86_000),{now}).state,"HELD");
});
test("stale partial impossible or forged counter state cannot authorize D1",()=>{
 for(const a of [
   {...quota(2,1),day_utc:"2026-10-26"},
   {...quota(2,1),remaining_rows_read:5_000_000},
   {...quota(2,1),provider_graphql_usage_observed:false},
   {...quota(2,1),observed_rows_read:-1},
   {...quota(2,1),limits:{rows_read:50_000_000,rows_written:100_000}},
   null,
 ]){
  const p=planD1BundledWork(a,{now});
  assert.equal(p.state,"HELD");
  assert.equal(p.critical,false);
 }
});
test("provider error or denied GraphQL is safe HOLD with no writes",async()=>{
 const x=await checkD1BundledWork({
   env:{CLOUDFLARE_API_TOKEN:"x".repeat(24),CLOUDFLARE_ACCOUNT_ID:"a".repeat(32)},
   fetchImpl:async()=>({ok:false}),
   now,
 });
 assert.equal(x.state,"HELD");
 assert.equal(x.reason,"D1_ACCOUNT_QUOTA_PROBE_FAILED");
 assert.equal(x.d1_rows_written,0);
});
