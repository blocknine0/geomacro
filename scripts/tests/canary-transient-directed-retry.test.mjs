import test from 'node:test';
import assert from 'node:assert/strict';
import {retryTransientCanaryProbe,checkSource,observeStage}
 from '../canary-promoter.ts';
const sha='a'.repeat(40),candidate='12345678-1234-1234-1234-123456789abc';
test('four bounded attempts recover 503 propagation with 2s/4s/8s backoff and no synthetic response',async()=>{
 let attempts=0;const pauses=[];
 const response=await retryTransientCanaryProbe(async()=>{
  attempts++;return attempts<4?{status:503}:{status:200,body:{ok:true}};
 },{pause:async ms=>pauses.push(ms),allowPropagation:true,log:()=>{},
 accept:r=>r.status===200&&r.body?.ok===true});
 assert.equal(attempts,4);assert.deepEqual(pauses,[2000,4000,8000]);
 assert.equal(response.status,200);
});
test('401/403, invalid release policy and SLO failures are not retried',async()=>{
 for(const status of [401,403]){
  let calls=0;
  const value=await retryTransientCanaryProbe(async()=>{calls++;return {status}},{
   pause:async()=>{},allowPropagation:true,accept:x=>x.status===200});
  assert.equal(value.status,status);assert.equal(calls,1);
 }
 let calls=0;
 await assert.rejects(retryTransientCanaryProbe(async()=>{calls++;throw Error('CANARY_D1_PAID_MONTHLY_PACE_UNVERIFIED')},{pause:async()=>{}}),
  /CANARY_D1_PAID_MONTHLY_PACE_UNVERIFIED/);
 assert.equal(calls,1);
});
test('persistent directed SHA mismatch remains HOLD after exactly four probes',async()=>{
 let calls=0;
 await assert.rejects(checkSource(candidate,sha,async()=>{
  calls++;return new Response(JSON.stringify({ok:true,deployed_source_sha:'b'.repeat(40)}),{status:200});
 },{pause:async()=>{}}),/CANARY_DIRECTED_TRANSIENT_RETRY_EXHAUSTED/);
 assert.equal(calls,4);
});
test('transient directed health propagation recovers and readiness policy still checked',async()=>{
 let calls=0;
 const response=await checkSource(candidate,sha,async url=>{
  calls++;
  const body=url.endsWith('/health')?
   {ok:true,deployed_source_sha:calls===1?'b'.repeat(40):sha}:
   {status:'ready',checks:{database:true,audit_store:true,isolated_partner_credential:true,
    progressive_decision_ed25519_signer_configured:true},paid_launch_approved:false,
    execution_authorized:false};
  return new Response(JSON.stringify(body),{status:200});
 },{pause:async()=>{}});
 assert.equal(response,undefined);assert.equal(calls,3);
});

function stageDependencies({slo=true}={}){
 const base='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const candidate='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 let clock=0,budgetCalls=0,sourceCalls=0;
 const budgetProbe=async()=>{
  budgetCalls++;
  if(budgetCalls===1)return {cycle_start_utc:'2026-11-05T00:00:00.000Z',
   cycle_end_exclusive_utc:'2026-12-05T00:00:00.000Z',observed_at_ms:0,
   rows_read:0,rows_written:0,paced_remaining_rows_written:10000000,
   remaining_rows_written:2000000};
  return {cycle_start_utc:'2026-11-05T00:00:00.000Z',
   cycle_end_exclusive_utc:'2026-12-05T00:00:00.000Z',observed_at_ms:660000,
   rows_read:100,rows_written:100,paced_remaining_rows_written:9999900,
   remaining_rows_written:1999900};
 };
 const sourceProbe=async()=>{sourceCalls++;return true};
 const currentDeployment=async()=>({versions:[
  {version_id:base,percentage:99},{version_id:candidate,percentage:1}]});
 const observabilityProbe=async()=>({
  worker_error_ratio_under_0_5pct:slo,
  zone_http_5xx_verified:false,version_errors_under_0_5pct:true,p99_under_50ms:true});
 return {base,candidate,budgetProbe,sourceProbe,currentDeployment,observabilityProbe,
  pause:async ms=>{clock+=ms},now:()=>clock,windowMs:1,get sourceCalls(){return sourceCalls}};
}
test('observeStage recovers from a transient timeout while retaining provider D1 and SLO gates',async()=>{
 const deps=stageDependencies();
 // Force the first directed source probe to time out once, then pass.
 let attempts=0;
 deps.sourceProbe=async()=>retryTransientCanaryProbe(async()=>{
  attempts++;if(attempts===1)throw new DOMException('request timed out','AbortError');
  return true;
 },{pause:async ms=>{deps.pause(ms)},log:()=>{}});
 const stage=await observeStage(deps.base,deps.candidate,1,'a'.repeat(40),deps);
 assert.equal(attempts,2);
 assert.equal(stage.status,undefined);
 assert.equal(stage.stage_percent,1);
 assert.equal(stage.observed_d1_hourly_pace.status,'PASS_OBSERVED_PAID_MONTHLY_PACE');
});
test('observeStage fails closed on a real SLO breach',async()=>{
 const deps=stageDependencies({slo:false});
 await assert.rejects(observeStage(deps.base,deps.candidate,1,'a'.repeat(40),deps),
  /CANARY_SLO_BREACH/);
});
