import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPayPalLiveWebhook} from '../ops/check-paypal-live-webhook.mjs';
const env={
 GEOMACRO_PAYPAL_ENVIRONMENT:'live',
 PAYPAL_CLIENT_ID:'test-id-1234',PAYPAL_CLIENT_SECRET:'private-test-secret',
 PAYPAL_WEBHOOK_ID:'WH-TEST-1234'
};
function fake({oauth=true,webhook=true,eventTypes=null,url='https://geomacro.live/api/v1/payments/paypal'}={}){
 const calls=[];
 const fetchImpl=async(target,opts)=>{
  calls.push({url:target,method:opts.method,redirect:opts.redirect});
  if(target.endsWith('/v1/oauth2/token'))return Response.json(
   oauth?{access_token:'TEST-OAUTH-TOKEN'}:{error:'unauthorized'},
   {status:oauth?200:401});
  if(!webhook)return Response.json({error:'not-found'},{status:404});
  if(target.endsWith('/v1/notifications/webhooks/WH-TEST-1234'))
   return Response.json({id:'WH-TEST-1234',url,
    event_types:(eventTypes??['PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.REFUNDED',
      'PAYMENT.CAPTURE.REVERSED']).map(name=>({name}))});
  throw Error('PROHIBITED_NETWORK_ENDPOINT');
 };
 return {calls,fetchImpl};
}
test('read-only live PayPal OAuth and registered exact signed webhook PASS only configuration',async()=>{
 const f=fake();
 const v=await checkPayPalLiveWebhook({env,fetchImpl:f.fetchImpl});
 assert.equal(v.status,'PASS_WEBHOOK_CONFIG_ONLY');
 assert.equal(v.credentials_oauth_verified,true);
 assert.equal(v.event_subscriptions_verified,true);
 assert.equal(v.merchant_kyc_verified,false);
 assert.equal(v.production_capture_reconciled,false);
 assert.equal(v.checkout_unlocked,false);
 assert.deepEqual(f.calls.map(x=>x.method),['POST','GET']);
 assert.ok(f.calls.every(x=>x.url.startsWith('https://api-m.paypal.com/')));
 assert.ok(!JSON.stringify(v).includes('private-test-secret'));
});
test('provider OAuth 401 or webhook 404 remains NOT_YET_VERIFIED',async()=>{
 for(const opts of [{oauth:false},{webhook:false}]){
  const f=fake(opts);
  const v=await checkPayPalLiveWebhook({env,fetchImpl:f.fetchImpl});
  assert.equal(v.status,'NOT_YET_VERIFIED');
  assert.equal(v.real_funds_touched,false);
 }
});
test('wrong webhook URL or missing capture/refund subscription blocks rollout',async()=>{
 for(const opts of [{url:'https://attacker.invalid/webhook'},
  {eventTypes:['PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.REFUNDED']}]){
  const f=fake(opts);
  const v=await checkPayPalLiveWebhook({env,fetchImpl:f.fetchImpl});
  assert.equal(v.status,'NOT_YET_VERIFIED');
  assert.equal(v.webhook_registration_verified,false);
 }
});
test('sandbox, missing, conflicting or secret-like malformed bindings never contact provider',async()=>{
 for(const next of [
  {...env,GEOMACRO_PAYPAL_ENVIRONMENT:'sandbox'},
  {...env,PAYPAL_CLIENT_SECRET:''},
  {...env,GEOMACRO_PAYPAL_CLIENT_ID:'not-the-same-id'},
  {...env,PAYPAL_WEBHOOK_ID:'WH-INVALID\nTOKEN'},
 ]){
  const f=fake();
  const v=await checkPayPalLiveWebhook({env:next,fetchImpl:f.fetchImpl});
  assert.equal(v.status,'NOT_YET_VERIFIED');
  assert.equal(f.calls.length,0);
  assert.equal(v.checkout_unlocked,false);
 }
});
