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
test('Paid above 100k uses internal paced budget, not a provider Free hard stop',()=>{
 const later=new Date('2026-11-06T18:00:00Z');
 const proof={...paidProof,observed_at:'2026-11-06T17:59:30Z'};
 const guard={...spendGuardProof,observed_at:'2026-11-06T17:59:30Z'};
 const v=assessPaidEnvelope(snapshot(6_000_000,100_001),{now:later,paidProof:proof,spendGuardProof:guard});
 assert.equal(v.provider_daily_100k_free_limit_applicable,false);
 assert.equal(v.internal_soft_rows_written,180000);
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
test('Atomic admission cannot accept over-reserved provider counter',async()=>{
 let updated=false;const receipts=[];
 const db={prepare(sql){return {bind(...args){return {sql,args}}}},async batch(q){
  receipts.push(q);
  if(q[1].args[9]+q[1].args[10]>q[1].args[11])return [{success:true},{success:true,results:[]}];
  updated=true;
  return [{success:true},{success:true,results:[{reserved_rows:100,observed_provider_highwater:170000}]}];
 }};
 await assert.rejects(()=>reserveD1PhysicalRows(db,{providerObserved:192823,estimatedRows:20,observedAt:new Date().toISOString(),dayUtc:new Date().toISOString().slice(0,10)}),D1BudgetHold);
 assert.equal(updated,false);
 const success=await reserveD1PhysicalRows(db,{providerObserved:170000,estimatedRows:20,observedAt:new Date().toISOString(),dayUtc:new Date().toISOString().slice(0,10)});
 assert.equal(success.ok,true);assert.equal(receipts.length,2);
});
test('Atomic admission rejects stale provider metrics, despite free provider entitlement',async()=>{
 const db={batch(){throw Error('WRITES_MUST_NOT_OCCUR')}};
 await assert.rejects(()=>reserveD1PhysicalRows(db,{dayUtc:new Date().toISOString().slice(0,10),
  providerObserved:1,estimatedRows:20,observedAt:'2026-01-01T00:00:00Z'}),
  /STALE_PROVIDER_COUNTER/);
});
