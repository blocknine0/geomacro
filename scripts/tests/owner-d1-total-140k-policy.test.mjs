import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateOwnerD1DailyEnvelope} from "../lib/d1-owner-daily-envelope.mjs";
const policy=JSON.parse(readFileSync(
  new URL("../../config/geomacro-cloudflare-five-usd-budget.json",import.meta.url),"utf8"));
test("retired 140k is not an active Workers Paid operational ceiling",()=>{
  const t=policy.owner_d1_utc_daily_targets;
  assert.equal(t.rows_read,580000000);
  assert.equal(t.rows_written,1100000);
  assert.equal(t.normal_rows_read,580000000);
  assert.equal(t.normal_rows_written,1100000);
  assert.equal(t.emergency_rows_read,0);
  assert.equal(t.emergency_rows_written,0);
  assert.equal(t.emergency_auto_admission,false);
  assert.equal(policy.paid_admission.emergency_read_reserve_rows,0);
  assert.equal(policy.paid_admission.emergency_write_reserve_rows,0);
  assert.equal(policy.monthly_guardrail_targets_not_provider_hard_caps.d1_rows_read,17500000000);
  assert.equal(policy.monthly_guardrail_targets_not_provider_hard_caps.d1_rows_written,35000000);
  assert.equal(policy.d1_budget_policy.burn_rate_alert_per_hour_write,45000);
});
test("D1 provider-read daily ceiling does not imply atomic Cloudflare cap",()=>{
  const now=new Date("2026-11-07T23:59:59Z"),p=policy.d1_budget_policy;
  const ok=evaluateOwnerD1DailyEnvelope({
    policy:p,observedRowsRead:10000,observedRowsWritten:10000,now});
  assert.equal(ok.held,false);
  for(const w of [1100000,1150000]){
    const result=evaluateOwnerD1DailyEnvelope({
      policy:p,observedRowsRead:10000,observedRowsWritten:w,now});
    assert.equal(result.held,true);
    assert.equal(result.admission_is_global_atomic,false);
  }
  assert.equal(p.account_wide_atomic_hard_cap_guaranteed,false);
});
test("Hot50 20-minute sealed transport remains independent of D1 cap",()=>{
  const w=readFileSync(new URL("../../.github/workflows/hot50-direct-original-news-20m.yml",import.meta.url),"utf8");
  assert.ok(w.includes("needs.quota-admission.result == 'failure'"));
  assert.ok(w.includes("needs.quota-admission.result == 'skipped'"));
  assert.ok(w.includes("needs.quota-admission.outputs.source_intake != 'true'"));
  assert.ok(w.includes("needs.collect-direct-20m.result != 'success'"));
  assert.ok(w.includes("always() &&"));
  assert.ok(w.includes("needs.source-contract.result == 'success'"));
  assert.ok(w.includes('GEOMACRO_OSINT_SPOOL_ADMISSION: "HELD"'));
  assert.ok(w.includes('cron: "6,26,46 * * * *"'));
  assert.ok(!w.includes('GEOMACRO_RISK_GATE_COMMERCIAL_ENABLED: "true"'));
});
test("separate read/write daily ceilings and monthly emergency remain independent",()=>{
  const now=new Date("2026-11-07T23:59:59Z"),p=policy.d1_budget_policy;
  const ok=evaluateOwnerD1DailyEnvelope({
    now,policy:p,observedRowsRead:100000,observedRowsWritten:100000});
  assert.equal(ok.held,false);
  assert.equal(ok.normal_daily_rows_read_ceiling,580000000);
  assert.equal(ok.normal_daily_rows_written_ceiling,1100000);
  assert.equal(ok.monthly_emergency_reserve_pct,30);
  assert.equal(ok.emergency_reserve_automatic_access,false);
  for(const [read,write] of [[580000000,100],[100,1100000]]) {
    const result=evaluateOwnerD1DailyEnvelope({
      now,policy:p,observedRowsRead:read,observedRowsWritten:write});
    assert.equal(result.held,true);
  }
});
