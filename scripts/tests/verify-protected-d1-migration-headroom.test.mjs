import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessMigrationOnlyPreflight}
 from "../ops/verify-protected-d1-migration-headroom.mjs";
const now=new Date("2026-11-07T00:05:00Z");
const receipt={
 schema:"geomacro.d1.zero-traffic-canary-preflight.v1",
 stage:"A_READ_ONLY",inspected_at:"2026-11-07T00:04:50.000Z",
 reason:"ZERO_TRAFFIC_PREFLIGHT_READY",paid_subscription_verified:true,
 d1_bookmark_obtained:true,worker_baseline_verified:true,
 same_run_d1_bookmark_and_worker_version_retrieved:true,
 worker_version_uploaded:false,d1_sql_queries_issued:0,
 provider_write_operations:0,payments:0,
 paid_monthly_headroom_verified:true,
 old_daily_140k_policy_applied:false,
 safety_reserve_percent:10,monthly_read_target:22_500_000_000,
 monthly_write_target:45_000_000,
 included_monthly_rows_read:25_000_000_000,
 included_monthly_rows_written:50_000_000,
 billing_cycle_start_utc:"2026-11-05",
 billing_cycle_end_exclusive_utc:"2026-12-05",
 monthly_read_rows:18_140_000,monthly_written_rows:1_350_000,
 eligible_for_zero_traffic_stage:true
};
test("one-time protected migration uses paid billing-month reserve, no daily 140k or 00UTC reset",()=>{
 const x=assessMigrationOnlyPreflight(receipt,{now});
 assert.equal(x.status,"ADMITTED");
 assert.equal(x.code,"MIGRATION_PAID_CYCLE_RESERVED");
 assert.equal(x.reserved_write_headroom_min,1_000_000);
 assert.equal(x.reserved_read_headroom_min,20_000_000);
 assert.equal(x.authorizes_payment,false);
 assert.equal(x.authorizes_traffic_promotion,false);
 assert.equal(x.old_daily_140k_policy_applied,false);
 assert.equal(x.account_wide_atomic_hard_cap_guaranteed,false);
});
test("missing provider/bookmark/usage or delayed receipt remains HOLD",()=>{
 const alterations=[
 {paid_subscription_verified:false},{d1_bookmark_obtained:false},
 {worker_baseline_verified:false},{provider_write_operations:1},
 {d1_sql_queries_issued:1},{reason:"CANARY_ACCOUNT_D1_BUDGET_HELD"},
 {inspected_at:"2026-11-06T23:55:00Z"},
 {monthly_read_rows:22_499_999_999},{monthly_written_rows:44_999_999},
 {monthly_written_rows:NaN},{payments:1},{worker_version_uploaded:true},
 {monthly_write_target:50_000_000},{safety_reserve_percent:0},
 {old_daily_140k_policy_applied:true}
 ];
 for(const alteration of alterations)
  assert.equal(assessMigrationOnlyPreflight({...receipt,...alteration},{now}).status,"HOLD");
});
test("protected 0204/0211 DDL budget accepts only real monthly receipt",async()=>{
 const {evaluateMigrationBudget}=await import("../ops/verify-protected-d1-migration-gate.mjs");
 const plan={workers_paid_subscription_verified:true,
  monthly_owner_headroom:{
   schema:"geomacro.d1-paid-monthly-headroom.v1",
   status:"PASS",provider_subscription_verified:true,
   old_daily_140k_policy_applied:false,
   day_utc:"2026-11-07",cycle_start_utc:"2026-11-05",
   cycle_end_exclusive_utc:"2026-12-05",
   monthly_ceiling_read:22_500_000_000,
   monthly_ceiling_written:45_000_000,
   reserve_pct:10,observed_rows_read:18_140_000,
   observed_rows_written:1_350_000,
   remaining_rows_read:22_481_860_000,
   remaining_rows_written:43_650_000
  }};
 assert.equal(evaluateMigrationBudget(plan,now).admitted,true);
 for(const change of [
  {status:"HOLD"},{day_utc:"2026-11-06"},
  {remaining_rows_read:1},{remaining_rows_written:10},
  {old_daily_140k_policy_applied:true},
  {monthly_ceiling_written:50_000_000}
 ]){
  const invalid={...plan,monthly_owner_headroom:
   {...plan.monthly_owner_headroom,...change}};
  assert.equal(evaluateMigrationBudget(invalid,now).admitted,false);
 }
});
test("existing protected workflow still enforces HOLD and does not deploy on a migration admission",()=>{
 const y=readFileSync(new URL(
  "../../.github/workflows/geomacro-protected-d1-canary-preflight.yml",
  import.meta.url),"utf8");
 assert.match(y,/provider-migration-headroom:/u);
 assert.match(y,/needs: provider-migration-headroom/u);
 assert.match(y,/verify-protected-d1-migration-headroom\.mjs/u);
 assert.match(y,/config\/d1-hotspot-v2-canary\.hold/u);
 assert.doesNotMatch(y,/versions deploy/u);
 assert.doesNotMatch(y,/continue-on-error: true/u);
});
