import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEvidenceNoFunds} from '../ops/check-commercial-qualified-evidence-no-funds.mjs';

const token='a'.repeat(64);
test('missing protected evidence token causes zero network calls and no charge',async()=>{
 let count=0;const result=await checkEvidenceNoFunds({token:'',fetchImpl:async()=>{count++;throw Error()}});
 assert.equal(count,0);
 assert.equal(result.classification,'BLOCKED_NO_CHARGE');
 assert.equal(result.reason,'QUALIFIED_RISK_TOKEN_NOT_CONFIGURED');
 assert.equal(result.payment_attempted,false);
});
test('three strictly bounded read-only tier requests never contain payment',async()=>{
 const calls=[];
 const result=await checkEvidenceNoFunds({token,fetchImpl:async(url,options)=>{
  calls.push({url,options,body:JSON.parse(options.body)});
  return Response.json({error:'DATA_UNAVAILABLE'},{status:503});
 }});
 assert.equal(calls.length,3);
 assert.deepEqual(calls.map(c=>c.body.product_tier),['basic_focused','standard','complex_full']);
 for(const call of calls){
  assert.equal(call.url,'https://api.geomacro.live/v1/risk-gate/unified/evaluate');
  assert.equal(call.options.method,'POST');
  assert.equal(call.options.redirect,'manual');
  assert.equal(call.body.target_type,'COUNTRY');assert.equal(call.body.target_id,'USA');
  assert.equal(call.body.client_policy,'STRICT');
  assert.equal(Object.keys(call.body).length,4);
  assert(!('PAYMENT-SIGNATURE' in call.options.headers));
 }
 assert(result.tiers.every(t=>t.reason==='UPSTREAM_HTTP_503'));
 assert(!JSON.stringify(result).includes(token));
 assert.equal(result.payment_attempted,false);
 assert.equal(result.payment_enabled,false);
});
test('unsupported and malformed risk inputs never become a paid ready claim',async()=>{
 const situations=[
  ()=>Response.json({ok:false,tiered_product:{status:'READY'}},{status:200}),
  ()=>Response.json({foo:'bar'},{status:200}),
  ()=>Response.json({ok:true,tiered_product:{status:'READY'}},{status:200}),
  ()=>Response.json({error:'unexpected'},{status:307,headers:{Location:'https://example.org'}}),
  ()=>Response.json({error:'unauthorized'},{status:401}),
  ()=>new Response('not json',{status:200})
 ];
 for(const reply of situations){
  const r=await checkEvidenceNoFunds({token,fetchImpl:async()=>reply()});
  assert.equal(r.classification,'BLOCKED_NO_CHARGE');
  assert.equal(r.payment_attempted,false);
  assert(r.tiers.every(t=>t.classification==='BLOCKED_NO_CHARGE'));
  assert(r.tiers.every(t=>typeof t.reason==='string'&&!t.reason.includes('unexpected')));
 }
});
test('network failures remain sanitized with no payment',async()=>{
 const r=await checkEvidenceNoFunds({token,fetchImpl:async()=>{throw Error('SECRET-DO-NOT-LOG')}});
 assert(r.tiers.every(t=>t.reason==='UPSTREAM_NETWORK_UNAVAILABLE'));
 assert.equal(r.classification,'BLOCKED_NO_CHARGE');
 assert(!JSON.stringify(r).includes('SECRET-DO-NOT-LOG'));
});
