import test from "node:test";
import assert from "node:assert/strict";
import {planD1BundledWork,checkD1BundledWork,d1LanePacedCeiling} from "../ops/plan-d1-bundled-work.mjs";
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
test("paced bundles preserve critical work while research/maintenance yield first",()=>{
 const p=planD1BundledWork(quota(2_100_000,30_000),{now});
 assert.equal(p.state,"CRITICAL_ONLY");
 assert.equal(p.maintenance,false);
 assert.equal(p.research,false);
 assert.equal(p.critical,true);
 const q=planD1BundledWork(quota(3_900_000,50_000),{now});
 assert.equal(q.state,"HELD");
 assert.equal(q.critical,false);
});
test("write reserve stops discretionary lanes before daily write cap",()=>{
 const q=planD1BundledWork(quota(1_000,40_000),{now});
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
test("UTC paced watermarks bound early-day spikes without paying or minting new requests",()=>{
 const morning=new Date("2026-10-27T06:45:00.000Z");
 const early=planD1BundledWork(quota(1_720_587,17_836),{now:morning});
 assert.equal(early.state,"CRITICAL_ONLY");
 assert.equal(early.critical,true);
 assert.equal(early.research,false);
 assert.equal(early.maintenance,false);
 assert.equal(early.admission_paced_to_utc_day,true);
 const mid=planD1BundledWork(quota(2_900_000,50_000),{now});
 assert.equal(mid.state,"HELD");
 const start=d1LanePacedCeiling("critical",new Date("2026-10-27T00:00:00.000Z"));
 const finish=d1LanePacedCeiling("critical",new Date("2026-10-27T23:59:59.999Z"));
 assert.equal(start.rows_read,1_000_000);
 assert.equal(start.rows_written,10_000);
 assert.ok(finish.rows_read<4_250_000 && finish.rows_read>4_249_900);
 assert.ok(finish.rows_written<85_000 && finish.rows_written>84_990);
 assert.ok(d1LanePacedCeiling("maintenance",morning).rows_read<
   d1LanePacedCeiling("research",morning).rows_read);
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
test('observed production pacing hold still admits only a full-day budgeted small source bundle',()=>{
 const at=new Date('2026-10-27T09:17:28.000Z');
 const result=planD1BundledWork(quota(2825556,21330),{now:at});
 assert.equal(result.critical,false);assert.equal(result.research,false);assert.equal(result.maintenance,false);
 assert.equal(result.source_intake,true);
 const budget=result.source_intake_budget_to_utc_reset;
 assert.ok(budget.rows_read<=4000*288+100000);assert.ok(budget.rows_written<=104*288+2000);
 assert.ok(result.remaining_rows_read-budget.rows_read>750000);
 assert.ok(result.remaining_rows_written-budget.rows_written>15000);
 assert.equal(result.source_intake_does_not_admit_signing_or_audits,true);
});
test('bounded source intake cannot consume the protected reserve or use unknown quota counters',()=>{
 for(const [read,written]of [[4300000,10000],[1000,86000],[5000000,100000]])assert.equal(planD1BundledWork(quota(read,written),{now}).source_intake,false);
 assert.equal(planD1BundledWork(null,{now}).source_intake,false);
 assert.equal(planD1BundledWork({...quota(1000,100),day_utc:'2026-10-26'},{now}).source_intake,false);
});
