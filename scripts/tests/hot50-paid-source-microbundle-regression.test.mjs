import test from 'node:test';
import assert from 'node:assert/strict';
import {planD1BundledWork} from '../ops/plan-d1-bundled-work.mjs';
import {D1_FREE_DAILY} from '../ops/audit-d1-account-daily-quota-readonly.mjs';
import {WORKERS_PAID_PROOF_SCHEMA} from '../lib/cloudflare-workers-paid-plan-proof.mjs';
const now=new Date('2026-11-18T16:00:00.000Z');
const snapshot={schema:'geomacro.d1-account-daily-quota-readonly.v1',
 day_utc:'2026-11-18',provider_graphql_usage_observed:true,
 observed_rows_read:30_000_000,observed_rows_written:699_000,
 limits:{...D1_FREE_DAILY},remaining_rows_read:0,remaining_rows_written:0};
const proof={schema:WORKERS_PAID_PROOF_SCHEMA,verified:true,
 source:'CLOUDFLARE_ACCOUNT_SUBSCRIPTIONS_BILLING_READ',
 subscription_changed:false,billing_action_performed:false,observed_at:now.toISOString()};
const owner={schema:'geomacro.owner-d1-paid-utc-envelope.v2',day_utc:snapshot.day_utc,
 observed_rows_read:snapshot.observed_rows_read,observed_rows_written:snapshot.observed_rows_written,
 held:false,normal_daily_rows_read_ceiling:580_000_000,
 normal_daily_rows_written_ceiling:1_100_000,
 paced_rows_read_ceiling:30_300_000,paced_rows_written_ceiling:720_000};
test('verified Paid source microbundle fits current pacing without borrowing free-tier reserve twice',()=>{
 const p=planD1BundledWork(snapshot,{now,paidProof:proof,ownerEnvelope:owner});
 assert.equal(p.state,'CRITICAL_ONLY');assert.equal(p.source_intake,true);
 assert.equal(p.paid_registered_original_source_lane,true);
 assert.ok(p.source_intake_max_new_rows<=50);
 assert.equal(p.paid_source_remaining_day_schedule_reserved,true);
 assert.ok(p.paid_source_current_paced_reserve_rows_written<=3000);
 assert.equal(p.research,false);assert.equal(p.maintenance,false);
 assert.equal(p.source_intake_does_not_admit_signing_or_audits,true);
});
test('unknown subscription, stale observation or insufficient current pacing never admit source writes',()=>{
 const tests=[
  {paidProof:null,ownerEnvelope:owner},
  {paidProof:{...proof,verified:false},ownerEnvelope:owner},
  {paidProof:proof,ownerEnvelope:{...owner,held:true}},
  {paidProof:proof,ownerEnvelope:{...owner,paced_rows_written_ceiling:700_000}},
  {paidProof:proof,ownerEnvelope:{...owner,paced_rows_read_ceiling:30_005_000}},
 ];
 for(const opts of tests){const p=planD1BundledWork(snapshot,{now,...opts});
  assert.notEqual(p.source_intake,true);assert.notEqual(p.paid_registered_original_source_lane,true);}
});
