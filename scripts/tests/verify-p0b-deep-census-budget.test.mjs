import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessP0bDeepCensusBudget} from "../ops/verify-p0b-deep-census-budget.mjs";
const now=new Date("2026-11-07T12:30:00Z");
const good={day_utc:"2026-11-07",workers_paid_subscription_verified:true,
  critical:true,observed_rows_read:50000,observed_rows_written:40000,
  owner_d1_normal_envelope:{held:false},
  owner_d1_utc_daily_targets:{rows_read:140000,normal_rows_read:120000,normal_rows_written:120000,emergency_rows_read:20000,emergency_rows_written:20000,
  emergency_auto_admission:false}};
const checked=x=>assessP0bDeepCensusBudget(x,{now});
test("admit only fresh official paid account rows and conservative headroom",()=>{
 const r=checked(good);
 assert.equal(r.allowed,true);
 assert.equal(r.account_wide_hard_cap_guaranteed,false);
 assert.equal(r.d1_sql_queries,0);
 assert.equal(r.b2_requests,0);
 assert.equal(r.payments,0);
});
test("P0B deep parity HOLD whenever the owner reads/writes are near 140k",()=>{
 for(const change of [{observed_rows_read:120000},{observed_rows_written:135000},
   {critical:false},{workers_paid_subscription_verified:false},
   {owner_d1_normal_envelope:{held:true}},{day_utc:"2026-11-06"},
   {observed_rows_read:NaN},{owner_d1_utc_daily_targets:{
     ...good.owner_d1_utc_daily_targets,emergency_auto_admission:true}}]){
  assert.equal(checked({...good,...change}).allowed,false);
 }
});
test("protected parity workflow runs provider preflight before first deep D1 request",()=>{
 const y=readFileSync(new URL("../../.github/workflows/p0b-production-parity-hourly.yml",import.meta.url),"utf8");
 const before=y.indexOf("node scripts/ops/verify-p0b-deep-census-budget.mjs");
 const after=y.indexOf("Independently verify real encrypted B2 object against committed D1 record");
 assert.ok(before>0&&after>before);
 assert.ok(y.includes("secrets.CLOUDFLARE_BILLING_READ_TOKEN"));
});
