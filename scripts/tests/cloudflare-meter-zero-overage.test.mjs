import test from "node:test";
import assert from "node:assert/strict";
import {COST_METERS,cloudflareCycleId,validateMonthlyMeters,
 assessMeterTicket} from "../../src/middleware/cloudflareMeterBudget.mjs";

const ticket=(meter,extra={})=>assessMeterTicket({meter,
 observed:0,normalReserved:0,emergencyReserved:0,units:1,lane:"normal",...extra});

test("all metered products have independent included-only total and emergency capacity",()=>{
 for(const [meter,limit] of Object.entries(COST_METERS)){
  assert.ok(limit.normal>0&&limit.emergency>0&&limit.included>=limit.normal+limit.emergency,meter);
  assert.equal(ticket(meter).admitted,true,meter);
  assert.equal(ticket(meter,{observed:limit.normal,units:1}).admitted,false,meter);
  assert.equal(ticket(meter,{observed:limit.normal,units:1,lane:"emergency"}).admitted,true,meter);
  assert.equal(ticket(meter,{observed:limit.normal+limit.emergency,units:1,lane:"emergency"}).admitted,false,meter);
  assert.equal(ticket(meter,{emergencyReserved:limit.emergency,units:1,lane:"emergency"}).admitted,false,meter);
 }
});
test("operations cannot borrow another product budget or fake the 20k D1 emergency",()=>{
 assert.equal(ticket("r2_standard_class_a",{observed:800000}).admitted,false);
 assert.equal(ticket("queues_standard_operations",{observed:800000}).admitted,false);
 assert.equal(ticket("d1_rows_written",{observed:3720000}).admitted,false);
 assert.equal(ticket("d1_rows_written",{observed:3720000,lane:"emergency"}).admitted,true);
});
test("daily D1 140k remains a separate, stronger per-UTC-day policy",()=>{
 assert.equal(COST_METERS.d1_rows_read.normal,120000*31);
 assert.equal(COST_METERS.d1_rows_written.emergency,20000*31);
 assert.equal(COST_METERS.d1_rows_written.included,50000000);
});
test("monthly cycle follows real 5th UTC billing anchor, never naive calendar month",()=>{
 assert.equal(cloudflareCycleId(new Date("2026-11-04T23:59:59Z")),"2026-10-05");
 assert.equal(cloudflareCycleId(new Date("2026-11-05T00:00:00Z")),"2026-11-05");
 assert.equal(cloudflareCycleId(new Date("2026-12-04T23:59:59Z")),"2026-11-05");
 assert.equal(cloudflareCycleId(new Date("2026-12-05T00:00:00Z")),"2026-12-05");
});
test("missing, partial or forged provider counters cannot prove monthly headroom",()=>{
 const full=Object.fromEntries(Object.keys(COST_METERS).map(x=>[x,0]));
 assert.equal(Object.keys(validateMonthlyMeters(full)).length,Object.keys(COST_METERS).length);
 for(const o of [{},[],null,{...full,unknown:0},{...full,kv_reads:-1},
  {...full,workers_cpu_ms:NaN},{...full,r2_standard_class_a:0.3}]){
  assert.throws(()=>validateMonthlyMeters(o),/COMPLETENESS/);
 }
});
test("invalid, underbounded or unknown operations fail closed",()=>{
 for(const extra of [{units:0},{units:-1},{units:5001},{units:1.5},
  {meter:"backblaze_b2_class_a"},{meter:"r2_infrequent_access"},
  {observed:NaN},{normalReserved:-1},{lane:"arbitrary"}]){
  assert.equal(ticket("workers_requests",extra).admitted,false);
 }
});
