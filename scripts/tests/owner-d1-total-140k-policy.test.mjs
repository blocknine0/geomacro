import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateOwnerD1DailyEnvelope} from "../lib/d1-owner-daily-envelope.mjs";
const policy=JSON.parse(readFileSync(
 new URL("../../config/geomacro-cloudflare-five-usd-budget.json",import.meta.url),"utf8"));
test("140k owner account-wide read and write targets have zero hidden 40k recovery exception",()=>{
 const target=policy.owner_d1_utc_daily_targets;
 assert.equal(target.rows_read,140000);
 assert.equal(target.rows_written,140000);
 assert.equal(target.normal_rows_read,140000);
 assert.equal(target.normal_rows_written,140000);
 assert.equal(target.emergency_rows_written,0);
 assert.equal(target.emergency_auto_admission,false);
 assert.equal(policy.paid_admission.emergency_write_reserve_rows,0);
 assert.equal(policy.paid_admission.daily_normal_writes_cap,140000);
 assert.equal(policy.monthly_guardrail_targets_not_provider_hard_caps.d1_rows_written,4340000);
 assert.equal(policy.d1_budget_policy.max_daily_reads,140000);
 assert.equal(policy.d1_budget_policy.max_daily_writes,140000);
});
test("owner admission respects total write cap with provider lag explicitly stated",()=>{
 const now=new Date("2026-11-07T22:00:00Z");
 const p=policy.d1_budget_policy;
 const allowed=evaluateOwnerD1DailyEnvelope({
  policy:p,observedRowsRead:10000,observedRowsWritten:10000,now});
 assert.equal(allowed.held,false);
 for(const rowsWritten of [138000,139000,140000,160000]){
  const r=evaluateOwnerD1DailyEnvelope({policy:p,
    observedRowsRead:10000,observedRowsWritten:rowsWritten,now});
  assert.equal(r.held,true);
  assert.equal(r.emergency_writes_admitted,false);
  assert.equal(r.admission_is_global_atomic,false);
 }
 assert.equal(policy.d1_budget_policy.account_wide_atomic_hard_cap_guaranteed,false);
});
test("Hot50 20-minute sealed transport remains independent of total D1 cap",()=>{
 const w=readFileSync(new URL("../../.github/workflows/hot50-direct-original-news-20m.yml",import.meta.url),"utf8");
 // The writer can FAIL or be SKIPPED after a quota PASS; both must
 // activate encrypted no-D1 holding. The previous test pinned the retired
 // failure-only spelling and incorrectly blocked protected D1 migration.
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
