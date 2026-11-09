import test from 'node:test';
import assert from 'node:assert/strict';
import {admitSignedClosedD1DayForCanary} from '../canary-promoter.ts';

// Offline pure shape fixtures; do not claim signed or provider-observed data.
const now=new Date('2026-11-10T04:00:00.000Z');
const good=()=>({
 schema:'geomacro.d1-account-utc-24h-observation.v1',status:'PASS',
 day:'2026-11-09',period_start_utc:'2026-11-09T00:00:00.000Z',
 period_end_exclusive_utc:'2026-11-10T00:00:00.000Z',
 expected_last_second_utc:'2026-11-09T23:59:59.000Z',
 observed_at:'2026-11-10T02:00:00.000Z',
 all_account_databases:true,no_unreported_group_claimed:false,
 analytics_provider_observation_not_provider_signed_ledger:true,
 account_wide_atomic_hard_cap_guaranteed:false,no_funds:true,
 provider_query_result_sha256:'f'.repeat(64),
 analytics_credential_source:'EXISTING_ACCOUNT_API_TOKEN',
 budget_rows_read:580_000_000,budget_rows_written:1_100_000,
 rows_read:150,rows_written:40,database_count:2,
 database_receipts:[
  {database_id:'111111111111',rows_read:100,rows_written:30},
  {database_id:'222222222222',rows_read:50,rows_written:10}
 ]
});
test('genuine schema previous closed day is accepted as daily ONLY',()=>{
 const v=admitSignedClosedD1DayForCanary(good(),now);
 assert.equal(v.status,'PASS_CLOSED_UTC_DAY');
 assert.equal(v.monthly_provider_verification_required_separately,true);
 assert.equal(v.remote_hold_removed,false);
});
test('missing, incomplete, over-budget, stale or contradictory daily evidence HOLD',()=>{
 const mutations=[
  p=>{p.status='HOLD'},p=>{p.day='2026-11-08'},
  p=>{p.period_start_utc='2026-11-08T00:00:00.000Z'},
  p=>{p.period_end_exclusive_utc='2026-11-09T00:00:00.000Z'},
  p=>{p.expected_last_second_utc='2026-11-08T23:59:59.000Z'},
  p=>{p.observed_at='2026-11-10T00:30:00.000Z'},
  p=>{p.all_account_databases=false},
  p=>{p.no_unreported_group_claimed=true},
  p=>{p.analytics_provider_observation_not_provider_signed_ledger=false},
  p=>{p.account_wide_atomic_hard_cap_guaranteed=true},
  p=>{p.provider_query_result_sha256='bad'},
  p=>{p.budget_rows_read=140000},
  p=>{p.rows_read=580000001},
  p=>{p.rows_written=1100001},
  p=>{p.database_count=1},
  p=>{p.database_receipts[1].database_id=p.database_receipts[0].database_id},
  p=>{p.database_receipts[1].rows_read+=1},
  p=>{p.database_receipts[1].rows_written=-1}
 ];
 for(const change of mutations){
  const item=good();change(item);
  assert.throws(()=>admitSignedClosedD1DayForCanary(item,now),/CANARY_HOLD_RELEASE_/u);
 }
 assert.throws(()=>admitSignedClosedD1DayForCanary(good(),
  new Date('2026-11-10T00:30:00.000Z')),/CANARY_HOLD_RELEASE_/u);
});
