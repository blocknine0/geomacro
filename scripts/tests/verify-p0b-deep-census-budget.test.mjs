import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessP0bDeepCensusBudget,checkP0bDeepCensusBudget}
 from "../ops/verify-p0b-deep-census-budget.mjs";
const now=new Date("2026-11-08T13:34:40.000Z");
const baseline={
 schema:"geomacro.d1-paid-monthly-headroom.v1",status:"PASS",lane:"research",
 day_utc:"2026-11-08",cycle_start_utc:"2026-11-05",
 cycle_end_exclusive_utc:"2026-12-05",checked_at_utc:now.toISOString(),
 provider_subscription_verified:true,
 old_daily_140k_policy_applied:false,
 paid_included_rows_read:25_000_000_000,
 paid_included_rows_written:50_000_000,
 monthly_ceiling_read:22_500_000_000,
 monthly_ceiling_written:45_000_000,reserve_pct:10,
 observed_rows_read:18_376_573,observed_rows_written:1_364_568,
 remaining_rows_read:22_481_623_427,remaining_rows_written:43_635_432,
 monthly_paced_ceiling_read:2_100_000_000,
 monthly_paced_ceiling_written:5_000_000
};
const check=x=>assessP0bDeepCensusBudget(x,{now});
test("real current Paid month receipt admits bounded B2 parity, not old 140k/day",()=>{
 const r=check(baseline);
 assert.equal(r.allowed,true);
 assert.equal(r.code,"P0B_PAID_MONTHLY_PARITY_PROBE_ADMITTED");
 assert.equal(r.old_daily_140k_policy_applied,false);
 assert.equal(r.minimum_read_headroom_rows,20_200_000);
 assert.equal(r.minimum_write_headroom_rows,1_010_000);
 assert.equal(r.d1_sql_queries,0);
 assert.equal(r.b2_requests,0);
 assert.equal(r.payments,0);
});
test("stale, fake, missing Paid, close-to-included and near-pacing each HOLD",()=>{
 const patches=[
 {status:"HOLD"},{lane:"migration"},
 {provider_subscription_verified:false},{day_utc:"2026-11-07"},
 {checked_at_utc:"2026-11-08T13:30:00.000Z"},
 {old_daily_140k_policy_applied:true},
 {monthly_ceiling_read:25_000_000_000},{reserve_pct:0},
 {observed_rows_read:NaN},
 {remaining_rows_read:20_200_000},
 {remaining_rows_written:1_010_000},
 {monthly_paced_ceiling_read:38_576_573},
 {monthly_paced_ceiling_written:2_374_568}
 ];
 for(const patch of patches){
  const r=check({...baseline,...patch});
  assert.equal(r.allowed,false,JSON.stringify(patch));
  assert.equal(r.d1_sql_queries,0);
 }
});
test("runtime only invokes read-only Paid provider call; never D1 queries itself",async()=>{
 let count=0;
 const r=await checkP0bDeepCensusBudget({now,provider:async ({lane})=>{
  count++;assert.equal(lane,"research");return baseline;
 }});
 assert.equal(count,1);assert.equal(r.allowed,true);
 const held=await checkP0bDeepCensusBudget({now,provider:async()=>null});
 assert.equal(held.allowed,false);
});
test("production parity workflow still gates expensive verified B2/D1 check before its first API call",()=>{
 const y=readFileSync(new URL(
  "../../.github/workflows/p0b-production-parity-hourly.yml",import.meta.url),"utf8");
 const before=y.indexOf("node scripts/ops/verify-p0b-deep-census-budget.mjs");
 const after=y.indexOf("Independently verify real encrypted B2 object against committed D1 record");
 assert.ok(before>0&&after>before);
 assert.match(y,/Cloudflare Paid monthly entitlement/u);
 assert.match(y,/secrets.CLOUDFLARE_BILLING_READ_TOKEN/u);
 assert.match(y,/cron: '23 0,6,12,18 \* \* \*'/u);
 assert.doesNotMatch(y,/cron: '\* \* \* \* \*'/u);
});
