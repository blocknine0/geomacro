import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessMigrationOnlyPreflight}
 from "../ops/verify-protected-d1-migration-headroom.mjs";
const now=new Date("2026-11-07T00:05:00Z");
const receipt={
 schema:"geomacro.d1.zero-traffic-canary-preflight.v1",
 stage:"A_READ_ONLY",inspected_at:"2026-11-07T00:04:50.000Z",
 reason:"CANARY_ACCOUNT_D1_BUDGET_HELD",paid_subscription_verified:true,
 d1_bookmark_obtained:true,worker_baseline_verified:true,
 same_run_d1_bookmark_and_worker_version_retrieved:true,
 worker_version_uploaded:false,d1_sql_queries_issued:0,
 provider_write_operations:0,payments:0,
 normal_read_target:120000,normal_write_target:120000,
 emergency_read_reserve:20000,emergency_write_reserve:20000,
 daily_read_rows:30000,daily_written_rows:25000,
 eligible_for_zero_traffic_stage:false};
test("narrow one-time repair admission needs full provider readback, not a pacing bypass for public work",()=>{
 const x=assessMigrationOnlyPreflight(receipt,{now});
 assert.equal(x.status,"ADMITTED");
 assert.equal(x.normal_canary_eligible,false);
 assert.equal(x.authorizes_normal_canary,false);
 assert.equal(x.authorizes_traffic_promotion,false);
 assert.equal(x.authorizes_payment,false);
 assert.equal(x.authorizes_d1_emergency_spending,false);
 assert.equal(x.account_wide_atomic_hard_cap_guaranteed,false);
});
test("provider identity, day or 80k repair reserve missing always HOLD",()=>{
 const changes=[
 {paid_subscription_verified:false},{d1_bookmark_obtained:false},
 {worker_baseline_verified:false},{provider_write_operations:1},
 {d1_sql_queries_issued:1},{reason:"CANARY_PROVIDER_DENIED"},
 {inspected_at:"2026-11-06T23:55:00Z"},
 {inspected_at:"2026-11-07T00:00:00Z"},
 {daily_read_rows:40000},{daily_written_rows:40000},
 {daily_read_rows:NaN},{payments:1},{worker_version_uploaded:true},
 {normal_read_target:180000}
 ];
 for(const change of changes)
  assert.equal(assessMigrationOnlyPreflight({...receipt,...change},{now}).status,"HOLD");
});
test("migration runner may admit only a verified hourly-pace HOLD with actual headroom",async()=>{
 const {evaluateMigrationBudget}=await import("../ops/verify-protected-d1-migration-gate.mjs");
 const plan={day_utc:"2026-11-07",workers_paid_subscription_verified:true,
 observed_rows_read:30000,observed_rows_written:25000,
 critical:false,reason:"GEOMACRO_OWNER_D1_PACED_BURN_RATE_HELD",
 owner_d1_normal_envelope:{held:true,reason:"OWNER_D1_HOURLY_BURN_RATE_HELD"},
 owner_d1_utc_daily_targets:{rows_read:140000,normal_rows_read:120000,normal_rows_written:120000,emergency_rows_read:20000,emergency_rows_written:20000,
 emergency_auto_admission:false}};
 assert.equal(evaluateMigrationBudget(plan,now).admitted,true);
 for(const change of [{reason:"GEOMACRO_OWNER_D1_NORMAL_DAILY_BUDGET_HELD"},
 {owner_d1_normal_envelope:{held:true,reason:"OWNER_D1_120K_NORMAL_CEILING_HELD"}},
 {observed_rows_read:40000},{observed_rows_written:40000}])
 assert.equal(evaluateMigrationBudget({...plan,...change},now).admitted,false);
});
test("separate UTC migration headroom never changes ordinary Stage A exit semantics",()=>{
 const y=readFileSync(new URL("../../.github/workflows/geomacro-protected-d1-canary-preflight.yml",import.meta.url),"utf8");
 assert.match(y,/provider-migration-headroom:/);
 assert.match(y,/needs: provider-migration-headroom/);
 assert.ok(y.includes("node scripts/ops/verify-protected-d1-migration-headroom.mjs"));
 assert.ok(y.includes('cron: "4 0 * * *"'));
 assert.ok(y.includes("node scripts/ops/verify-protected-d1-zero-canary-preflight.mjs"));
 assert.ok(y.includes("config/d1-hotspot-v2-canary.hold"));
 assert.ok(!y.includes("versions deploy"));
});

test("protected migration uses only two near-reset UTC schedules, never 72 all-day API checks",()=>{
 const yaml=readFileSync(new URL(
  "../../.github/workflows/geomacro-protected-d1-canary-preflight.yml",import.meta.url),"utf8");
 const cron=[...yaml.matchAll(/^\s+- cron: "([^"]+)"$/gmu)].map(m=>m[1]);
 assert.deepEqual(cron,["4 0 * * *","9 0 * * *"]);
 assert.doesNotMatch(yaml,/15,35,55 \* \* \* \*/u);
 assert.match(yaml,/workflow_dispatch: \{\}/u);
 assert.match(yaml,/needs\.provider-migration-headroom\.result == 'success'/u);
 assert.match(yaml,/group: geomacro-d1-control-plane-production/u);
 assert.match(yaml,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.doesNotMatch(yaml,/continue-on-error: true/u);
});
