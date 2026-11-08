import test from "node:test";
import assert from "node:assert/strict";
import {evaluateOwnerD1DailyEnvelope} from "./d1-owner-daily-envelope.mjs";
import policy from "../../config/geomacro-cloudflare-five-usd-budget.json" with {type:"json"};
const p=policy.d1_budget_policy;
const at=utc=>new Date("2026-11-07T"+utc+"Z");
const check=(r,w,now=at("10:00:00"))=>evaluateOwnerD1DailyEnvelope({
  observedRowsRead:r,observedRowsWritten:w,now,policy:p,
});
test("live provider rows, not SQL calls, govern D1 paid admission",()=>{
  const ok=check(50000,40000);
  assert.equal(ok.held,false);
  assert.equal(ok.quota_is_provider_observed_not_reserved,true);
  assert.equal(ok.admission_is_global_atomic,false);
  assert.equal(ok.monthly_emergency_reserve_pct,30);
});
test("dual read/write hourly pacing 24M/45k detects real UTC spikes",()=>{
  assert.equal(check(25000000,1000,at("01:00:00")).reason,
    "OWNER_D1_PAID_HOURLY_PACING_HELD");
  assert.equal(check(1000,48000,at("01:00:00")).held,true);
  assert.equal(check(100,100,at("01:00:00")).held,false);
});
test("daily owner caps are 580M reads and 1.1M writes independently",()=>{
  assert.equal(check(580000000,2000,at("23:59:59")).held,true);
  assert.equal(check(2000,1100000,at("23:59:59")).held,true);
  assert.equal(check(136000,138000,at("23:59:59")).held,false);
  assert.equal(p.normal_daily_reads,580000000);
  assert.equal(p.normal_daily_writes,1100000);
  assert.equal(p.emergency_write_reserve_rows,0);
});
test("invalid provider readings and modified policy HOLD",()=>{
  for(const n of [NaN,-1,1.3])assert.equal(check(n,0).held,true);
  assert.equal(evaluateOwnerD1DailyEnvelope({
    observedRowsRead:10,observedRowsWritten:10,now:new Date("invalid"),policy:p
  }).held,true);
  assert.equal(check(0,0,at("10:00:00")).held,false);
  assert.equal(evaluateOwnerD1DailyEnvelope({
    observedRowsRead:10,observedRowsWritten:10,now:at("10:00:00"),
    policy:{...p,account_wide_atomic_hard_cap_guaranteed:true}
  }).held,true);
});
