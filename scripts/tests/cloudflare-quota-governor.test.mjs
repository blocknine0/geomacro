import {test} from "node:test";
import assert from "node:assert/strict";
import {
  EMERGENCY_RESERVE_PERCENT, RESOURCE_LIMITS, verifyQuotaPolicy,
  verifyQuotaSnapshot, assessCloudflareQuota, sendQuotaWarning,
} from "../lib/cloudflare-quota-governor.mjs";

const now = new Date("2026-11-09T10:02:00.000Z");
const costs = () => Object.fromEntries(
  Object.keys(RESOURCE_LIMITS).map(name => [name, 0]));
const fixture = () => ({
  account_id: "a".repeat(32), provider_verified: true,
  observed_at: "2026-11-09T10:01:00.000Z",
  day_utc: "2026-11-09", hour_utc: "2026-11-09T10",
  billing_cycle_id: "2026-11-05/2026-12-05",
  metrics: Object.fromEntries(Object.entries(RESOURCE_LIMITS).map(
    ([name, lim]) => [name, {month: 0, day: 0, hour: 0, source: lim.provider}])),
});
const assess = (snapshot, reservation = costs(), lane = "background", approvedEmergency = false) =>
  assessCloudflareQuota({snapshot, costs:reservation, lane, now, approvedEmergency});

test("30 percent reserve for all six resources", () => {
  assert.equal(verifyQuotaPolicy(), true);
  assert.equal(EMERGENCY_RESERVE_PERCENT, 30);
  for (const r of Object.values(RESOURCE_LIMITS)) {
    assert.equal(r.operational_monthly + r.emergency_monthly, r.included_monthly);
    assert.equal(r.operational_monthly, r.included_monthly * 0.7);
  }
  assert.equal(RESOURCE_LIMITS.d1_rows_written.daily, 1_100_000);
  assert.equal(RESOURCE_LIMITS.d1_rows_read.daily, 580_000_000);
  assert.equal(RESOURCE_LIMITS.r2_class_a.daily, 25_000);
  assert.equal(RESOURCE_LIMITS.r2_class_b.daily, 250_000);
  assert.equal(RESOURCE_LIMITS.kv_writes.daily, 25_000);
  assert.equal(RESOURCE_LIMITS.kv_reads.daily, 250_000);
});
test("verified empty provider usage admits bounded background request", () => {
  const x = assess(fixture(), {...costs(), d1_rows_written: 20});
  assert.equal(x.status, "ADMIT");
  assert.equal(x.state, "NORMAL");
  assert.equal(x.account_wide_atomic_hard_cap_guaranteed, false);
});
test("70 percent triggers warning; 85 percent throttles background", () => {
  let x=fixture();
  x.metrics.r2_class_a.month=490_000;
  assert.equal(assess(x).state, "PROACTIVE_WARNING");
  assert.equal(assess(x).alert_webhook_required, true);
  x.metrics.r2_class_a.month=595_000;
  assert.equal(assess(x).state, "BACKGROUND_THROTTLE");
  assert.equal(assess(x).status, "HOLD");
  assert.equal(assess(x,costs(),"customer_api").status,"ADMIT");
});
test("100 percent operational ceiling holds discretionary work", () => {
  let x=fixture();
  x.metrics.d1_rows_written.month=35_000_000;
  assert.equal(assess(x).status, "HOLD");
  assert.equal(assess(x).state, "OPERATIONAL_FREEZE");
});
test("essential reserve requires explicit authorization", () => {
  let x=fixture();
  x.metrics.d1_rows_written.month=35_000_000;
  const c={...costs(),d1_rows_written:5};
  assert.equal(assess(x,c,"customer_api").status,"HOLD");
  assert.equal(assess(x,c,"customer_api",true).status,"ADMIT");
});
test("daily/hourly caps never bypassed with emergency approval", () => {
  const x=fixture();
  x.metrics.d1_rows_written.hour=45_000;
  x.metrics.d1_rows_written.day=45_000;
  x.metrics.d1_rows_written.month=45_000;
  assert.equal(assess(x,{...costs(),d1_rows_written:1},"hot50",true).status,"HOLD");
});
test("zero-metric gaps, stale, fabricated, and partial telemetry fail closed", () => {
  const x=fixture();
  delete x.metrics.kv_reads;
  assert.throws(()=>verifyQuotaSnapshot(x,now),/RESOURCE_TELEMETRY_MISSING/);
  const stale=fixture();stale.observed_at="2026-11-09T09:01:00.000Z";
  assert.throws(()=>verifyQuotaSnapshot(stale,now),/STALE_OR_UNVERIFIED/);
  const falseClaim=fixture();falseClaim.provider_verified=false;
  assert.throws(()=>assess(falseClaim),/STALE_OR_UNVERIFIED/);
});
test("webhook warning never grants admission or exposes credentials",async()=>{
  const x=fixture();x.metrics.r2_class_a.month=490_000;
  const output=await sendQuotaWarning(assess(x),{webhookUrl:"https://example.test/notify",
    fetchImpl:async(url,init)=>{
      assert.equal(url,"https://example.test/notify");
      const body=JSON.parse(init.body);
      assert.equal(body.state,"PROACTIVE_WARNING");
      assert.equal(Object.keys(body).includes("account_id"),false);
      return {status:204,redirected:false};
    }});
  assert.deepEqual(output,{attempted:true,delivered:true});
});
