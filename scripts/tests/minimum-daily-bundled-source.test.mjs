import test from "node:test";
import assert from "node:assert/strict";
import {MINIMUM_DAILY_BUNDLED_SOURCE,planSourceIntake,planD1BundledWork,
 PREDGE_D1_FREE_HEADROOM,D1_BUNDLE_LANES}
 from "../ops/plan-d1-bundled-work.mjs";
import {D1_FREE_DAILY} from "../ops/audit-d1-account-daily-quota-readonly.mjs";
const quota=(when,read,written)=>({
 schema:"geomacro.d1-account-daily-quota-readonly.v1",
 day_utc:when.toISOString().slice(0,10),provider_graphql_usage_observed:true,
 observed_rows_read:read,observed_rows_written:written,
 limits:{...D1_FREE_DAILY},
 remaining_rows_read:Math.max(0,5_000_000-read),
 remaining_rows_written:Math.max(0,100_000-written),
});
test("minimum Free D1 account plan reserves all three bounded 10-minute D1 producers without extra five-minute source writes",()=>{
 const at=new Date("2026-10-31T00:00:00.000Z"),snapshot=quota(at,0,0);
 const plan=planD1BundledWork(snapshot,{now:at});
 const budget=plan.source_intake_budget_to_utc_reset;
 assert.equal(plan.source_intake,true);
 assert.equal(plan.source_intake_interval_minutes,10);
 assert.equal(plan.source_intake_max_new_rows,3);
 assert.equal(plan.minimum_daily_bundled_source_admitted,true);
 assert.equal(plan.minimum_daily_bundled_source_policy.no_paid_capacity,true);
 assert.equal(budget.remaining_source_slots,144);
 assert.equal(budget.rows_read,1482400);
 assert.equal(budget.rows_written,40016);
 assert.equal(MINIMUM_DAILY_BUNDLED_SOURCE.maximum_original_records_per_slot,3);
 assert.equal(MINIMUM_DAILY_BUNDLED_SOURCE.producers_per_slot,3);
 assert.equal(MINIMUM_DAILY_BUNDLED_SOURCE.expected_categories,3);
 assert.ok(budget.rows_read+PREDGE_D1_FREE_HEADROOM.rows_read+750000<
  D1_FREE_DAILY.rows_read);
 assert.ok(budget.rows_written+PREDGE_D1_FREE_HEADROOM.rows_written+15000<
  D1_FREE_DAILY.rows_written);
 assert.equal(plan.d1_queries,0);assert.equal(plan.d1_rows_written,0);
 assert.equal(plan.b2_requests,0);assert.equal(plan.paid_calls,0);
});
test("strict account-wide Free reserve leaves PREDGE and critical capacity untouched",()=>{
 const at=new Date("2026-10-31T23:45:00.000Z");
 const readBudget=119200,writeBudget=2528;
 const exactRead=quota(at,5_000_000-(1_250_000+readBudget),0);
 const exactWrite=quota(at,0,100_000-(23_000+writeBudget));
 assert.equal(planSourceIntake(exactRead,at),null);
 assert.equal(planSourceIntake(exactWrite,at),null);
 assert.equal(planSourceIntake(quota(at,5_000_000-(1_250_000+readBudget+1),0),at)?.max_new_rows,3);
 assert.equal(planSourceIntake(quota(at,0,100_000-(23_000+writeBudget+1)),at)?.interval_minutes,10);
 assert.equal(D1_BUNDLE_LANES.critical.read_reserve,1_250_000);
 assert.equal(D1_BUNDLE_LANES.critical.write_reserve,23_000);
});
test("late D1 provider budget exhaustion truthfully holds ingestion; no fake success",()=>{
 const at=new Date("2026-10-31T21:10:00.000Z");
 const held=planD1BundledWork(quota(at,4_224_242,61_224),{now:at});
 assert.equal(held.source_intake,false);
 assert.equal(held.source_intake_max_new_rows,0);
 assert.equal(held.critical,false);
 assert.equal(held.predge_request_governor_is_separate_and_unchanged,true);
 assert.equal(held.predge_account_headroom_planning_reserve.rows_read,500000);
 assert.equal(held.budget_is_nonatomic_provider_snapshot,true);
 assert.equal(held.d1_queries,0);
});
test("daily budget recalculates only from true UTC time and never admits unknown metrics",()=>{
 const at=new Date("2026-10-31T12:00:00.000Z");
 assert.equal(planSourceIntake(null,at),null);
 assert.equal(planSourceIntake({},at),null);
 assert.equal(planD1BundledWork({...quota(at,1_000_000,1_000),day_utc:"2026-10-30"},{now:at}).source_intake,false);
 const admitted=planD1BundledWork(quota(at,1_000_000,1_000),{now:at});
 assert.equal(admitted.source_intake_budget_to_utc_reset.remaining_source_slots,72);
 assert.equal(admitted.source_intake_budget_to_utc_reset.rows_read,791200);
 assert.equal(admitted.source_intake_budget_to_utc_reset.rows_written,21008);
});
