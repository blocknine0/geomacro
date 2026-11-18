import test from 'node:test';
import assert from 'node:assert/strict';
import {B2_DAILY_LIMITS} from '../../workers/control-plane/src/b2-account-quota.mjs';
import {requireGdeltV2B2PacedHeadroom} from '../lib/gdelt-v2-b2-quota-preflight.mjs';
const now=new Date('2026-11-18T18:00:00.000Z');
const env={B2_ACCOUNT_QUOTA_REQUIRED:'1',B2_ACCOUNT_QUOTA_WORKFLOW_ID:'gdelt_v2_event_sync',
 B2_REQUEST_BUDGET:'4',D1_DATABASE_ID:'12345678-1234-1234-1234-123456789012',
 CLOUDFLARE_API_TOKEN:'x'.repeat(36),CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32)};
const status=(used={GET:100,PUT:20,HEAD:0,NATIVE_AUTH:0,total:120})=>({
 ok:true,schema:'geomacro.b2-account-quota-status.v1',
 day_utc:'2026-11-18',account_wide_reporting_requires_all_clients_governed:true,
 used,limits:B2_DAILY_LIMITS});
test('GDELT V2 preflights one full B2 PUT and independent GET without spending quota',async()=>{
 const x=await requireGdeltV2B2PacedHeadroom({env,now,governorFactory:()=>({status:async()=>status()})});
 assert.equal(x.admitted,true);assert.equal(x.atomic_s3_reservations_still_required,true);
 assert.equal(x.b2_network_attempts,0);assert.equal(x.commercial_eligible,false);
});
test('GDELT V2 fails closed at shared quota edge and without account verification',async()=>{
 const denied=status({GET:B2_DAILY_LIMITS.GET,PUT:20,HEAD:0,NATIVE_AUTH:0,
  total:B2_DAILY_LIMITS.GET+20});
 await assert.rejects(requireGdeltV2B2PacedHeadroom({env,now,
  governorFactory:()=>({status:async()=>denied})}),/GDELT_V2_B2_SHARED_QUOTA_HELD/);
 await assert.rejects(requireGdeltV2B2PacedHeadroom({env:{...env,D1_DATABASE_ID:''},now,
  governorFactory:()=>{throw Error('MUST_NOT_PROBE')} }),/GDELT_V2_B2_QUOTA_GOVERNANCE_REQUIRED/);
});
