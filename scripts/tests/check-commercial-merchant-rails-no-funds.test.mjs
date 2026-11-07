import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyMerchantRailsNoFunds} from '../ops/check-commercial-merchant-rails-no-funds.mjs';

const origin='https://ymjuwuvbialsevfawvvq.supabase.co';
const worker='https://geomacro-commercial-api.daspallab202391.workers.dev';
const sha='c'.repeat(40);
const fixture=(override={})=>{
 const calls=[];
 const fetchImpl=async (url,opts)=>{
  calls.push({url,opts});
  if(url.startsWith(origin+'/rest/v1/rpc/')){
   assert.equal(opts.method,'POST');const req=JSON.parse(opts.body);
   assert.equal(url,origin+'/rest/v1/rpc/geomacro_commercial_rpc');
   assert(['health','x402_get','polygon_x402_get','x402_pending','polygon_x402_pending'].includes(req.p_operation));
   assert.equal(opts.headers.apikey,'sb_secret_fixture'.padEnd(40,'x'));
   assert(!('Authorization' in opts.headers));
   if(override.rpcFail===req.p_operation)return Response.json({error:'RPC UNAVAILABLE'},{status:500});
   if(req.p_operation==='health')return Response.json({ready:true});
   if(req.p_operation.endsWith('_pending'))return Response.json([]);
   return Response.json(null);
  }
  assert.equal(url,worker+'/v1/commercial/health');
  assert.equal(opts.method,'GET');
  return Response.json({deployed_sha:sha,x402_configured:false,polygon_x402_configured:false,
   paypal_configured:false,ledger_configured:true,signer_configured:true,
   execution_authorized:false,...override.worker});
 };
 return {fetchImpl,calls};
};
test('protected service role probes exactly 5 READ-ONLY RPC and Worker health, never transfer',async()=>{
 const f=fixture();
 const r=await verifyMerchantRailsNoFunds({serviceKey:'sb_secret_fixture'.padEnd(40,'x'),
  url:origin,fetchImpl:f.fetchImpl,expectedSha:sha});
 assert.equal(r.status,'PASS');
 assert.equal(r.payment_attempted,false);
 assert.equal(r.settlement_attempted,false);
 assert.equal(f.calls.length,6);
 assert(f.calls.every(c=>!c.url.includes('/settle')&&!c.url.includes('/verify')));
 assert(f.calls.every(c=>c.opts.method==='GET'||c.opts.method==='POST'));
 assert(!JSON.stringify(r).includes('sb_secret_'));
});
test('invalid service role and unknown origins rejected with zero network calls',async()=>{
 for(const opts of [
  {serviceKey:'short',url:origin},
  {serviceKey:'sb_secret_fixture'.padEnd(40,'x'),url:'https://attack.example'},
  {serviceKey:'sb_secret_fixture'.padEnd(40,'x'),url:origin,workerOrigin:'https://attacker.example'}
 ]){
  const f=fixture();await assert.rejects(verifyMerchantRailsNoFunds({...opts,fetchImpl:f.fetchImpl}));
  assert.equal(f.calls.length,0);
 }
});
test('missing private Polygon RPC or live payment enabled fails closed',async()=>{
 const k='sb_secret_fixture'.padEnd(40,'x');
 const f=fixture({rpcFail:'polygon_x402_get'});
 await assert.rejects(verifyMerchantRailsNoFunds({serviceKey:k,url:origin,fetchImpl:f.fetchImpl,expectedSha:sha}),
  /POSTGREST_RPC_NOT_READY/);
 for(const change of [
  {x402_configured:true},{polygon_x402_configured:true},{paypal_configured:true},
  {ledger_configured:false},{execution_authorized:true}
 ]){
  const h=fixture({worker:change});
  await assert.rejects(verifyMerchantRailsNoFunds({serviceKey:k,url:origin,fetchImpl:h.fetchImpl,expectedSha:sha}),
   /WORKER_FUNDS_LOCK_MISMATCH/);
 }
});
