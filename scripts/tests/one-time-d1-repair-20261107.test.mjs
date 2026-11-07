import test from 'node:test';import assert from 'node:assert/strict';
import {assessOneTimeD1Repair,ONE_TIME_D1_REPAIR} from '../ops/one-time-d1-repair-20261107.mjs';
import {evaluateMigrationBudget} from '../ops/verify-protected-d1-migration-gate.mjs';
const now=new Date('2026-11-07T16:15:00Z');
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'blocknine0/geomacro',GITHUB_REF:'refs/heads/main',
 GITHUB_EVENT_NAME:'push',GEOMACRO_ONE_TIME_D1_REPAIR:ONE_TIME_D1_REPAIR.id};
const receipt={schema:'geomacro.d1.zero-traffic-canary-preflight.v1',stage:'A_READ_ONLY',
 inspected_at:now.toISOString(),reason:'CANARY_ACCOUNT_D1_BUDGET_HELD',paid_subscription_verified:true,
 d1_bookmark_obtained:true,worker_baseline_verified:true,same_run_d1_bookmark_and_worker_version_retrieved:true,
 provider_write_operations:0,d1_sql_queries_issued:0,worker_version_uploaded:false,payments:0,
 normal_read_target:140000,normal_write_target:140000,daily_read_rows:4500000,daily_written_rows:420000};
test('approved same-day receipt grants only a fixed migration allowance, never a refreshed baseline',()=>{
 const first=assessOneTimeD1Repair(receipt,{now,env});assert.equal(first.admitted,true);
 assert.equal(first.fixed_read_ceiling,5064338);assert.equal(first.fixed_write_ceiling,1015271);
 const next=assessOneTimeD1Repair({...receipt,daily_read_rows:4600000},{now,env});
 assert.equal(next.headroom_read,first.headroom_read-100000);
 assert.equal(next.ordinary_daily_targets_unchanged,true);assert.equal(next.traffic_promotion_authorized,false);
 assert.equal(evaluateMigrationBudget({day_utc:'2026-11-07',observed_rows_read:4500000,observed_rows_written:420000},now).admitted,false);
});
test('expired date, wrong event/ref or absent approval never authorize the one-time lane',()=>{
 for(const e of [{},{...env,GITHUB_EVENT_NAME:'pull_request'},{...env,GITHUB_EVENT_NAME:'schedule'},
 {...env,GITHUB_REF:'refs/heads/other'},{...env,GEOMACRO_ONE_TIME_D1_REPAIR:'other'}])
  assert.equal(assessOneTimeD1Repair(receipt,{now,env:e}).admitted,false);
 assert.equal(assessOneTimeD1Repair(receipt,{now:new Date('2026-11-08T00:00:00Z'),env}).admitted,false);
});
test('unknown, stale, regressing, unsafe or depleted provider usage always refuses further writes',()=>{
 for(const change of [{daily_read_rows:null},{daily_written_rows:NaN},{daily_read_rows:4400000},
 {daily_read_rows:ONE_TIME_D1_REPAIR.read_ceiling-79999},
 {daily_written_rows:ONE_TIME_D1_REPAIR.write_ceiling-79999},
 {paid_subscription_verified:false},{d1_bookmark_obtained:false},{worker_baseline_verified:false},
 {provider_write_operations:1},{d1_sql_queries_issued:1},{payments:1},{normal_write_target:180000},
 {inspected_at:'2026-11-07T16:12:00Z'},{inspected_at:'2026-11-07T16:16:00Z'}])
  assert.equal(assessOneTimeD1Repair({...receipt,...change},{now,env}).admitted,false);
});
