import test from 'node:test';
import assert from 'node:assert/strict';
import {retryTransientCanaryProbe,checkSource}
 from '../canary-promoter.ts';
const sha='a'.repeat(40),candidate='12345678-1234-1234-1234-123456789abc';
test('three bounded retries recover 503 propagation and do not fabricate a response',async()=>{
 let attempts=0;const pauses=[];
 const response=await retryTransientCanaryProbe(async()=>{
  attempts++;return attempts<3?{status:503}:{status:200,body:{ok:true}};
 },{pause:async ms=>pauses.push(ms),allowPropagation:true,
 accept:r=>r.status===200&&r.body?.ok===true});
 assert.equal(attempts,3);assert.deepEqual(pauses,[500,1000]);
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
test('persistent directed SHA mismatch remains HOLD after exactly three probes',async()=>{
 let calls=0;
 await assert.rejects(checkSource(candidate,sha,async()=>{
  calls++;return new Response(JSON.stringify({ok:true,deployed_source_sha:'b'.repeat(40)}),{status:200});
 },{pause:async()=>{}}),/CANARY_DIRECTED_TRANSIENT_RETRY_EXHAUSTED/);
 assert.equal(calls,3);
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
