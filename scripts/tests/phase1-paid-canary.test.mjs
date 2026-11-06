import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPaidEnvelope,paidBundleContract} from '../ops/d1-paid-envelope.mjs';
import {reserveD1PhysicalRows,D1BudgetHold} from '../../workers/control-plane/src/d1-soft-budget.mjs';
const now=new Date('2026-11-06T09:00:00Z');
const snapshot=(read,written)=>({schema:'geomacro.d1-account-daily-quota-readonly.v1',
 provider_graphql_usage_observed:true,day_utc:'2026-11-06',
 observed_rows_read:read,observed_rows_written:written});
const paidProof={schema:'geomacro.cloudflare-workers-paid-provider-proof.v1',verified:true,
 source:'CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ',
 observed_at:'2026-11-06T08:59:30Z',subscription_changed:false,billing_action_performed:false};
const spendGuardProof={schema:'geomacro.cloudflare-five-usd-spend-lock.v1',verified:true,
 source:'CLOUDFLARE_ACCOUNT_READONLY_SPEND_POLICIES',
 observed_at:'2026-11-06T08:59:30Z',usage_block_threshold_cents:1,
 products:['workers','durable_objects']};
const options={now,paidProof,spendGuardProof};
test('Paid intake stays inside the 120k daily read cap and 180k write cap',()=>{
 const later=new Date('2026-11-06T18:00:00Z');
 const proof={...paidProof,observed_at:'2026-11-06T17:59:30Z'};
 const guard={...spendGuardProof,observed_at:'2026-11-06T17:59:30Z'};
 const v=assessPaidEnvelope(snapshot(60_000,100_001),{now:later,paidProof:proof,spendGuardProof:guard});
 assert.equal(v.provider_daily_100k_free_limit_applicable,false);
 assert.equal(v.internal_soft_rows_written,180000);\n  assert.equal(v.internal_soft_rows_read,120000);\n  assert.equal(v.soft_read_headroom,60000);
 assert.ok(v.max_originals_per_bounded_batch<=50);
 assert.equal(v.state,'CRITICAL_ONLY');
 assert.equal(v.source_intake_eligible,true);
 assert.equal(paidBundleContract(v).research,false);
});
test('Observed 192823 is held: provider paid capacity cannot override GeoMacro 180k',()=>{
 const v=assessPaidEnvelope(snapshot(2_524_036,192_823),options);
 assert.equal(v.state,'HELD');
 assert.equal(v.soft_write_headroom,0);
 assert.equal(paidBundleContract(v).source_intake,false);
});
test('Unknown or expired paid evidence fails closed',()=>{
 assert.throws(()=>assessPaidEnvelope(snapshot(0,0),{now,paidProof:{...paidProof,observed_at:'2026-11-05T00:00:00Z'},spendGuardProof}),/PROOF/);
});
test('Atomic D1 admission refuses observed totals above the daily cap',async()=>{
 let admitted=false;
 const db={prepare(){return {bind(...args){return {async first(){
  if(args[6]+args[7]>args[8]||args[9]*1000>args[10])return null;
  admitted=true;
  return {reserved_rows:100,observed_provider_highwater:170000,tokens_milli:5000000};
 }}}}}};
 const stamp=new Date();
 const common={estimatedRows:20,observedAt:stamp.toISOString(),dayUtc:stamp.toISOString().slice(0,10)};
 await assert.rejects(()=>reserveD1PhysicalRows(db,{...common,providerObserved:192823}),D1BudgetHold);
 assert.equal(admitted,false);
 const success=await reserveD1PhysicalRows(db,{...common,providerObserved:170000});
 assert.equal(success.ok,true);
 assert.equal(success.tokens_milli,5000000);
 assert.equal(admitted,true);
});
test('Atomic admission rejects stale provider metrics, despite free provider entitlement',async()=>{
 const db={prepare(){throw Error('WRITES_MUST_NOT_OCCUR')}};
 await assert.rejects(()=>reserveD1PhysicalRows(db,{dayUtc:new Date().toISOString().slice(0,10),
  providerObserved:1,estimatedRows:20,observedAt:'2026-01-01T00:00:00Z'}),
  /STALE_PROVIDER_COUNTER/);
});
