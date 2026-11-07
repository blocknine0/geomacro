import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateMigrationBudget,inspectPendingMigrations,checkMigrationSchema,
checkTimeTravel} from "../ops/verify-protected-d1-migration-gate.mjs";
const now=new Date("2026-11-07T12:00:00Z");
const base={day_utc:"2026-11-07",workers_paid_subscription_verified:true,
 owner_d1_normal_envelope:{held:false},critical:true,
 observed_rows_read:10000,observed_rows_written:10000,
 owner_d1_utc_daily_targets:{rows_read:140000,normal_rows_written:140000,
 emergency_auto_admission:false}};
test("migration reserves 80k D1 read/write and never borrows emergency",()=>{
 assert.equal(evaluateMigrationBudget(base,now).admitted,true);
 for(const change of [{observed_rows_read:60000},{observed_rows_written:60000},
 {critical:false},{day_utc:"2026-11-06"},
 {owner_d1_normal_envelope:{held:true}},{workers_paid_subscription_verified:false},
 {owner_d1_utc_daily_targets:{...base.owner_d1_utc_daily_targets,emergency_auto_admission:true}}])
  assert.equal(evaluateMigrationBudget({...base,...change},now).admitted,false);
});
test("only exact 0204 / 0211 are admitted from Wrangler migration list",()=>{
 assert.equal(inspectPendingMigrations(
 "Migration\n0204_d1_read_hotspot_optimization.sql\n0211_p0b_daily_committed_count.sql").apply,true);
 assert.equal(inspectPendingMigrations("No migrations to apply!").apply,false);
 for(const t of ["", "incomplete data","0210_p0b_immutable_source_fk_index.sql",
 "0204_d1_read_hotspot_optimization.sql\n0001_core.sql"])
   assert.throws(()=>inspectPendingMigrations(t),/MIGRATION/);
});
test("schema readback proves only schema, not Worker/version or traffic",()=>{
 const names=["materialized_cache","idx_private_osint_country_category_clock_v2",
 "idx_private_osint_check_category_status_v2","idx_website_derived_hot_order_v2",
 "p0b_committed_day_totals","trg_p0b_day_committed_insert",
 "trg_p0b_day_committed_delete","trg_p0b_day_committed_clock_change"];
 const raw=JSON.stringify([{results:names.map(name=>({name}))}]);
 const x=checkMigrationSchema("No migrations to apply!",raw);
 assert.equal(x.schema_objects_verified,8);
 assert.equal(x.worker_uploaded,false);
 assert.equal(x.physical_row_savings_proven,false);
 assert.throws(()=>checkMigrationSchema("0211_p0b_daily_committed_count.sql",raw));
 assert.throws(()=>checkMigrationSchema("No migrations to apply!",
 JSON.stringify([{results:names.slice(1).map(name=>({name}))}])));
});
test("bookmark requires production Time Travel and never logs restoration key",()=>{
 const b="00000001-00000002-00000003-abcdefabcdef123456789abc";
 const x=checkTimeTravel(JSON.stringify({version:"production"}),JSON.stringify({bookmark:b}));
 assert.equal(x.restore_exercised,false);
 assert.ok(!JSON.stringify(x).includes(b));
 assert.throws(()=>checkTimeTravel(JSON.stringify({version:"alpha"}),
 JSON.stringify({bookmark:b})));
});
test("Stage B executes only after actual Stage A PASS and leaves canary hold",()=>{
 const y=readFileSync(new URL("../../.github/workflows/geomacro-protected-d1-canary-preflight.yml",import.meta.url),"utf8");
 assert.match(y,/needs: provider-readonly-preflight/);
 assert.match(y,/needs\.provider-readonly-preflight\.result == 'success'/);
 assert.ok(y.includes("config/d1-hotspot-v2-canary.hold"));
 assert.ok(y.includes("d1 migrations apply DB --remote"));
 assert.ok(!y.includes("d1 time-travel restore"));
 assert.ok(!y.includes("versions deploy"));
});
