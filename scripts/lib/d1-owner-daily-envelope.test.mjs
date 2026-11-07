import test from "node:test";
import assert from "node:assert/strict";
import {evaluateOwnerD1DailyEnvelope} from "./d1-owner-daily-envelope.mjs";
import policy from "../../config/geomacro-cloudflare-five-usd-budget.json" with {type:"json"};
const p=policy.d1_budget_policy;
const at=(utc)=>new Date("2026-11-07T"+utc+"Z");
const check=(r,w,now=at("10:00:00"))=>evaluateOwnerD1DailyEnvelope({
 observedRowsRead:r,observedRowsWritten:w,now,policy:p
});
test("live provider row counts, not SQL statement counts, govern admission",()=>{
 const ok=check(50000,40000);
 assert.equal(ok.held,false);
 assert.equal(ok.quota_is_provider_observed_not_reserved,true);
 assert.equal(ok.admission_is_global_atomic,false);
 assert.equal(ok.emergency_writes_admitted,false);
});
test("UTC early burst catches 11k read spike and 9k write spike",()=>{
 assert.equal(check(11000,1000,at("01:00:00")).reason,"OWNER_D1_HOURLY_BURN_RATE_HELD");
 assert.equal(check(1000,9000,at("01:00:00")).held,true);
 assert.equal(check(100,100,at("01:00:00")).held,false);
});
test("normal read and write are each below 140k even when emergency reserve exists",()=>{
 assert.equal(check(136000,2000,at("23:59:59")).held,true);
 assert.equal(check(2000,138000,at("23:59:59")).held,true);
 assert.equal(check(140000,0).held,true);
 assert.equal(check(0,140000).held,true);
});
test("counters, policy, time or broken limit fail closed",()=>{
 assert.equal(check(NaN,0).held,true);
 assert.equal(check(-1,0).held,true);
 assert.equal(check(1.3,0).held,true);
 assert.equal(evaluateOwnerD1DailyEnvelope({observedRowsRead:10,observedRowsWritten:10,now:new Date("invalid"),policy:p}).held,true);
 assert.equal(evaluateOwnerD1DailyEnvelope({observedRowsRead:10,observedRowsWritten:10,now:at("10:00:00"),policy:{...p,account_wide_atomic_hard_cap_guaranteed:true}}).held,true);
});
