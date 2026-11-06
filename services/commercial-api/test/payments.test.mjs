import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { generateKeyPairSync,randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeEventTopics,encodeAbiParameters,parseAbiParameters } from 'viem';
import { PGlite } from '@electric-sql/pglite';
import { PayPalClient } from '../src/payments/paypal-client.mjs';
import { PayPalEngine } from '../src/payments/paypal.mjs';
import { X402Engine } from '../src/payments/x402.mjs';
import { loadCatalog } from '../src/payments/catalog.mjs';
import { BaseVerifier,USDC,NETWORK,requirements,typedAuthorization,validateAuthorization,usdcAbi,Facilitator } from '../src/payments/base.mjs';
import { rpc,cents } from '../src/payments/common.mjs';
import { createPaymentHandler } from '../src/payments/http.mjs';
import { canonicalize,hash } from '../src/metering.mjs';
const require=createRequire(import.meta.url),{prepareValue}=require('pg/lib/utils');
const db=new PGlite();
const pool={query:(sql,args)=>db.query(sql,args?.map(prepareValue))};
const query=async(sql,args=[]) => (await pool.query(sql,args)).rows;
const user=randomUUID(), origin='https://geomacro.example';
const credits={pack5:{credits:100},pack15:{credits:500},pack30:{credits:1500},
 monthly9:{credits:1000,planId:'P-TEST9'},monthly29:{credits:5000,planId:'P-TEST29'},monthly99:{credits:25000,planId:'P-TEST99'}};
const catalog=loadCatalog(JSON.stringify(credits));
// All amounts and risk values in this test file are FIXTURES, not live evidence.
const merchant='MERCHANTFIXTURE';
const calls=[],resources=new Map();let signatureValid=true;
const client={
 async call(path,options={}){calls.push({path,options});
  if(resources.has(path))return structuredClone(resources.get(path));
  throw new Error(`Unexpected fixture path: ${path}`);
 },async verifyWebhook(){if(!signatureValid)throw new Error('PAYPAL_SIGNATURE_INVALID');},
};
const engine=new PayPalEngine({pool,client,catalog,merchantId:merchant,siteOrigin:origin});
const bal=async()=>Number((await query('SELECT balance_units FROM geomacro.users WHERE id=$1',[user]))[0].balance_units);
const webhook=(event)=>engine.webhook(new Headers(),JSON.stringify(event));
const event=(type,resource)=>({id:`EV-${randomUUID()}`,event_type:type,resource});
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const account=privateKeyToAccount('0x'+'11'.repeat(32)),payee=('0x'+'22'.repeat(20));
let submitted=0,confirmFail=false,settleThrow=false,resolutions=0,simulateCalls=0;
const observed=new Map();
const fakeBase={
 async blockNumber(){return 1000n;},async findAuthorization(i){return observed.get(i.nonce)??null;},
 async checkUnusedAndSimulate(){simulateCalls++;},
 async confirm(tx,i){if(confirmFail)throw new Error('RPC_FIXTURE_OUTAGE');assert.equal(observed.get(i.nonce),tx);return 7;},
};
const fakeFacilitator={async verify(){return {isValid:true};},async settle(payment){submitted++;
 const nonce=payment.payload.authorization.nonce,tx='0x'+hash(nonce);observed.set(nonce,tx);
 if(settleThrow)throw new Error('FACILITATOR_LOST_ACK');return {success:true,transaction:tx,network:NETWORK,payer:account.address};}};
const resolveRisk=async()=>{resolutions++;return {availableTiers:['basic','standard'],riskByTier:{
 basic:{decision:'review',risk_score:42,factors:['TEST FIXTURE']},standard:{decision:'review',risk_score:43,factors:['TEST FIXTURE']}}};};
const xengine=new X402Engine({pool,payee,siteOrigin:origin,base:fakeBase,facilitator:fakeFacilitator,
 resolveRisk,privateKey,publicKeyId:'test-key',publicKeys:{'test-key':publicKey}});
const input=(tier='complex')=>({request_id:randomUUID(),subject:'USA',tier});
async function paymentFor(i,amount=150000,changes={}){
 const now=Math.floor(Date.now()/1000),authorization={from:account.address,to:payee,value:String(amount),
 validAfter:String(now-1),validBefore:String(now+110),nonce:'0x'+randomUUID().replaceAll('-','').repeat(2),...changes};
 const signature=await account.signTypedData(typedAuthorization(authorization));
 return {x402Version:2,resource:xengine.resource(i),accepted:requirements(amount,payee),payload:{signature,authorization}};
}
const encode=p=>Buffer.from(JSON.stringify(p)).toString('base64');
async function expireLease(id){await query("UPDATE geomacro.x402_intents SET lease_until=now()-interval '1 second' WHERE request_id=$1",[id]);}
before(async()=>{
 for(const file of ['schema.sql','functions.sql','payments.sql'])await db.exec(await readFile(new URL(`../sql/${file}`,import.meta.url),'utf8'));
 await rpc(pool,'provision_user',[user,'fixture@example.test']);
});
after(()=>db.close());

test('catalog locks exact cash prices and requires explicit credit entitlements',()=>{
 assert.equal(catalog.pack5.usd_cents,500);assert.equal(catalog.monthly99.usd_cents,9900);
 assert.throws(()=>loadCatalog('{}'),/CATALOG_CREDITS_REQUIRED/);
});
test('PayPal client obtains OAuth token and verifies signature via PayPal endpoint',async()=>{
 let calls=0;
 const c=new PayPalClient({mode:'sandbox',clientId:'test',clientSecret:'test',webhookId:'TESTHOOK',
 fetchImpl:async(url,options)=>{calls++;
 if(url.endsWith('/v1/oauth2/token'))return Response.json({access_token:'fixture-token',expires_in:3600});
 assert.equal(url,'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature');
 const b=JSON.parse(options.body);assert.equal(b.webhook_id,'TESTHOOK');assert.equal(b.webhook_event.id,'TESTEV');
 return Response.json({verification_status:'SUCCESS'});}});
 const headers=new Headers(Object.fromEntries(['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'].map(k=>[k,'fixture'])));
 await c.verifyWebhook(headers,{id:'TESTEV'});await c.verifyWebhook(headers,{id:'TESTEV'});assert.equal(calls,3);
});
test('PayPal signature FAILURE is rejected',async()=>{
 const c=new PayPalClient({mode:'sandbox',clientId:'test',clientSecret:'test',webhookId:'TESTHOOK',
 fetchImpl:async url=>Response.json(url.endsWith('/token')?{access_token:'test',expires_in:3600}:{verification_status:'FAILURE'})});
 const headers=new Headers(Object.fromEntries(['paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time'].map(k=>[k,'fixture'])));
 await assert.rejects(c.verifyWebhook(headers,{id:'TEST'}),/PAYPAL_SIGNATURE_INVALID/);
});
test('order creation has server-priced amount, custom ownership, merchant and idempotency',async()=>{
 const requestId=randomUUID();resources.set('/v2/checkout/orders',{id:'ORDER-CREATE',status:'PAYER_ACTION_REQUIRED',links:[{rel:'payer-action',href:'https://www.sandbox.paypal.com/checkoutnow?token=TEST'}]});
 const result=await engine.create({userId:user,requestId,sku:'pack5',kind:'pack'});
 assert.equal(result.provider_id,'ORDER-CREATE');
 const call=calls.at(-1);assert.equal(call.options.body.purchase_units[0].amount.value,'5.00');
 assert.equal(call.options.body.purchase_units[0].custom_id,requestId);
 assert.equal(call.options.body.purchase_units[0].payee.merchant_id,merchant);
 const count=calls.length;await engine.create({userId:user,requestId,sku:'pack5',kind:'pack'});assert.equal(calls.length,count);
 await assert.rejects(engine.create({userId:user,requestId,sku:'pack30',kind:'pack'}),/IDEMPOTENCY_CONFLICT/);
});
async function setupPack({amount='5.00',payeeId=merchant}={}){
 const purchase=randomUUID(),order=`ORDER-${randomUUID()}`,capture=`CAP-${randomUUID()}`;
 await rpc(pool,'paypal_begin',[purchase,user,'pack5','pack',500,100000000,null]);
 await rpc(pool,'paypal_link',[purchase,order,'CREATED','https://www.sandbox.paypal.com/checkoutnow']);
 resources.set(`/v2/payments/captures/${capture}`,{id:capture,status:'COMPLETED',amount:{currency_code:'USD',value:amount},supplementary_data:{related_ids:{order_id:order}}});
 resources.set(`/v2/checkout/orders/${order}`,{id:order,status:'COMPLETED',purchase_units:[{reference_id:purchase,custom_id:purchase,
 payee:{merchant_id:payeeId},amount:{currency_code:'USD',value:'5.00'},payments:{captures:[{id:capture,status:'COMPLETED'}]}}]});
 return {purchase,order,capture};
}
test('completed capture tops up once across duplicate and different webhook IDs',async()=>{
 const p=await setupPack(),start=await bal(),e=event('PAYMENT.CAPTURE.COMPLETED',{id:p.capture});
 await webhook(e);await webhook(e);await webhook(event('PAYMENT.CAPTURE.COMPLETED',{id:p.capture}));
 assert.equal(await bal(),start+100000000);
 await engine.capture({orderId:p.order,userId:user});assert.equal(await bal(),start+100000000);
});
test('invalid webhook signature cannot top up',async()=>{
 const p=await setupPack(),start=await bal();signatureValid=false;
 try{await assert.rejects(webhook(event('PAYMENT.CAPTURE.COMPLETED',{id:p.capture})),/PAYPAL_SIGNATURE_INVALID/);}finally{signatureValid=true;}
 assert.equal(await bal(),start);
});
test('wrong amount, wrong merchant and pending capture fail closed',async()=>{
 for(const options of [{amount:'0.01'},{payeeId:'ATTACKER'}]){
 const p=await setupPack(options),start=await bal();await assert.rejects(webhook(event('PAYMENT.CAPTURE.COMPLETED',{id:p.capture})),/PAYPAL_CAPTURE_MISMATCH/);assert.equal(await bal(),start);}
 const p=await setupPack(),path=`/v2/payments/captures/${p.capture}`;
 resources.get(path).status='PENDING';await assert.rejects(webhook(event('PAYMENT.CAPTURE.COMPLETED',{id:p.capture})),/PAYPAL_CAPTURE_NOT_COMPLETED/);
});
async function setupSub(){
 const purchase=randomUUID(),subscription=`I-${randomUUID()}`;
 await rpc(pool,'paypal_begin',[purchase,user,'monthly9','subscription',900,1000000000,'P-TEST9']);
 await rpc(pool,'paypal_link',[purchase,subscription,'APPROVAL_PENDING','https://www.sandbox.paypal.com/webapps/billing']);
 resources.set(`/v1/billing/subscriptions/${subscription}`,{id:subscription,status:'ACTIVE',custom_id:purchase,plan_id:'P-TEST9',quantity:'1'});
 return {purchase,subscription};
}
test('subscription activation updates status and grants zero credits',async()=>{
 const p=await setupSub(),start=await bal();await webhook(event('BILLING.SUBSCRIPTION.ACTIVATED',{id:p.subscription}));
 assert.equal(await bal(),start);assert.equal((await rpc(pool,'paypal_get',[p.subscription,null])).state,'ACTIVE');
});
test('confirmed recurring payment grants credits once; a later payment grants again',async()=>{
 const p=await setupSub(),start=await bal(),created=new Date().toISOString();
 const startDate=new Date(Date.parse(created)-86400000).toISOString(),endDate=new Date(Date.parse(created)+86400000).toISOString();
 const path=`/v1/billing/subscriptions/${p.subscription}/transactions?start_time=${encodeURIComponent(startDate)}&end_time=${encodeURIComponent(endDate)}`;
 resources.set(path,{transactions:[{id:'SALE-ONE',status:'COMPLETED',amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'9.00'}}},
 {id:'SALE-TWO',status:'COMPLETED',amount_with_breakdown:{gross_amount:{currency_code:'USD',value:'9.00'}}}]});
 await webhook(event('PAYMENT.SALE.COMPLETED',{id:'SALE-ONE',billing_agreement_id:p.subscription,create_time:created}));
 await webhook(event('PAYMENT.SALE.COMPLETED',{id:'SALE-ONE',billing_agreement_id:p.subscription,create_time:created}));
 assert.equal(await bal(),start+1000000000);
 await webhook(event('PAYMENT.SALE.COMPLETED',{id:'SALE-TWO',billing_agreement_id:p.subscription,create_time:created}));
 assert.equal(await bal(),start+2000000000);
});
test('plan with trial or wrong monthly price is rejected',async()=>{
 const plan={id:'P-TEST9',status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',sequence:1,total_cycles:0,frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{currency_code:'USD',value:'9.00'}}}]};
 resources.set('/v1/billing/plans/P-TEST9',plan);await engine.validatePlan(catalog.monthly9);
 plan.billing_cycles[0].pricing_scheme.fixed_price.value='1.00';await assert.rejects(engine.validatePlan(catalog.monthly9),/PAYPAL_PLAN_PRICE_MISMATCH/);
 plan.billing_cycles.push({tenure_type:'TRIAL'});await assert.rejects(engine.validatePlan(catalog.monthly9),/PAYPAL_PLAN_MISMATCH/);
});
test('402 uses x402 v2 header and charges only available standard price',async()=>{
 const response=await xengine.handle(input(),null);assert.equal(response.status,402);
 const challenge=JSON.parse(Buffer.from(response.headers.get('PAYMENT-REQUIRED'),'base64'));
 assert.equal(challenge.x402Version,2);assert.equal(challenge.accepts[0].amount,'150000');assert.equal(challenge.accepts[0].asset,USDC);
 assert.equal(submitted,0);
});
test('real EIP-712 payer recovery rejects amount, chain, recipient, expired and forged signatures',async()=>{
 const i=input(),p=await paymentFor(i),expected=requirements(150000,payee);
 const recovered=await validateAuthorization(p,expected);assert.equal(recovered.payer,account.address.toLowerCase());
 for(const mutate of [q=>q.accepted.network='eip155:1',q=>q.accepted.asset='0x'+'ff'.repeat(20),
  q=>q.payload.authorization.value='1',q=>q.payload.authorization.to='0x'+'33'.repeat(20),
  q=>q.payload.authorization.validBefore='1',q=>q.payload.signature='0x'+'00'.repeat(65)]){
  const bad=structuredClone(p);mutate(bad);await assert.rejects(validateAuthorization(bad,expected));}
});
test('x402 success records accountless usage, Ed25519 receipt and verified transfer once',async()=>{
 const i=input(),p=await paymentFor(i),start=submitted,balance=await bal();
 const response=await xengine.handle(i,encode(p));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.billed_tier,'standard');assert.equal(body.credits_deducted,0);
 assert.equal(body.payment_amount_atomic,'150000');assert.equal(body.execution_authorized,false);
 const settlement=JSON.parse(Buffer.from(response.headers.get('PAYMENT-RESPONSE'),'base64'));assert.equal(settlement.success,true);
 const count=resolutions;const second=await xengine.handle(i,encode(p));assert.equal(await second.text(),JSON.stringify(body));
 assert.equal(submitted,start+1);assert.equal(resolutions,count);assert.equal(await bal(),balance);
 const row=(await query('SELECT * FROM geomacro.usage_logs WHERE request_id=$1',[i.request_id]))[0];assert.equal(row.user_id,null);assert.equal(row.http_status,200);
 await assert.rejects(xengine.handle({...i,subject:'IND'},encode(p)),/IDEMPOTENCY_CONFLICT/);
});
test('higher-priced authorization triggers cheaper 402 without settling',async()=>{
 const i=input(),p=await paymentFor(i,250000),count=submitted;
 const response=await xengine.handle(i,encode(p));assert.equal(response.status,402);assert.equal(submitted,count);
});
test('authorization nonce cannot be reused for a different request',async()=>{
 const i=input(),p=await paymentFor(i);await xengine.handle(i,encode(p));
 const other=input();p.resource=xengine.resource(other);const count=submitted;
 await assert.rejects(xengine.handle(other,encode(p)),/unique constraint/);assert.equal(submitted,count);
});
test('facilitator timeout AFTER broadcast recovers same on-chain payment without settling twice',async()=>{
 const i=input(),p=await paymentFor(i),count=submitted;settleThrow=true;
 try{await assert.rejects(xengine.handle(i,encode(p)),/FACILITATOR_LOST_ACK/);}finally{settleThrow=false;}
 assert.equal((await query('SELECT * FROM geomacro.usage_logs WHERE request_id=$1',[i.request_id])).length,0);
 await expireLease(i.request_id);
 const response=await xengine.handle(i,encode(p));assert.equal(response.status,200);assert.equal(submitted,count+1);
});
test('database failure AFTER chain settlement recovers receipt with no duplicate payment',async()=>{
 const i=input(),p=await paymentFor(i),count=submitted;
 await db.exec(`CREATE FUNCTION geomacro.test_confirm_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_CONFIRM_FAILURE'; END $$;
 CREATE TRIGGER test_confirm_fail BEFORE INSERT ON geomacro.web3_txs FOR EACH ROW EXECUTE FUNCTION geomacro.test_confirm_fail();`);
 try{await assert.rejects(xengine.handle(i,encode(p)),/TEST_CONFIRM_FAILURE/);}finally{
 await db.exec('DROP TRIGGER test_confirm_fail ON geomacro.web3_txs; DROP FUNCTION geomacro.test_confirm_fail();');}
 assert.equal((await query('SELECT * FROM geomacro.usage_logs WHERE request_id=$1',[i.request_id])).length,0);
 await expireLease(i.request_id);assert.equal((await xengine.handle(i,encode(p))).status,200);assert.equal(submitted,count+1);
});
test('reconciliation worker observes a pending broadcast and finalizes without charging again',async()=>{
 const i=input(),p=await paymentFor(i),count=submitted;confirmFail=true;
 try{await assert.rejects(xengine.handle(i,encode(p)),/RPC_FIXTURE_OUTAGE/);}finally{confirmFail=false;}
 await expireLease(i.request_id);const results=await xengine.reconcile();
 assert(results.some(r=>r.request_id===i.request_id&&r.state==='confirmed'));assert.equal(submitted,count+1);
});
test('inconclusive resolver returns no charge and never calls facilitator',async()=>{
 const bad=new X402Engine({...xengine,resolveRisk:async()=>({availableTiers:[]})});const count=submitted;
 await assert.rejects(bad.handle(input(),null),/INCONCLUSIVE_NO_CHARGE/);assert.equal(submitted,count);
});
test('native USDC chain receipt checks both AuthorizationUsed and exact Transfer',async()=>{
 const nonce='0x'+'77'.repeat(32),tx='0x'+'88'.repeat(32);
 const intent={payer_address:account.address.toLowerCase(),payee_address:payee,nonce,amount_atomic:'150000'};
 const authLog={address:USDC,logIndex:3,data:'0x',topics:encodeEventTopics({abi:usdcAbi,eventName:'AuthorizationUsed',args:{authorizer:account.address,nonce}})};
 const transfer={address:USDC,logIndex:4,data:encodeAbiParameters(parseAbiParameters('uint256'),[150000n]),
 topics:encodeEventTopics({abi:usdcAbi,eventName:'Transfer',args:{from:account.address,to:payee}})};
 const receipt={status:'success',transactionHash:tx,logs:[authLog,transfer]};
 const verifier=new BaseVerifier({client:{getChainId:async()=>8453,waitForTransactionReceipt:async()=>receipt}});
 assert.equal(await verifier.confirm(tx,intent),4);
 receipt.logs=[transfer];await assert.rejects(verifier.confirm(tx,intent),/BASE_PAYMENT_LOG_MISMATCH/);
 receipt.logs=[authLog,{...transfer,address:'0x'+'ff'.repeat(20)}];await assert.rejects(verifier.confirm(tx,intent),/BASE_PAYMENT_LOG_MISMATCH/);
 receipt.status='reverted';await assert.rejects(verifier.confirm(tx,intent),/BASE_TX_NOT_SUCCESS/);
});
test('HTTP handler maps asynchronous x402 failures safely and PayPal requires authentication',async()=>{
 const app=createPaymentHandler({paypal:engine,x402:xengine,pool,siteOrigin:origin,authenticate:async()=>{throw Object.assign(new Error(),{name:'AbortError'});}});
 const request=(path,data)=>new Request(origin+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const response=await app(request('/v1/risk-gate',{request_id:'bad'}));assert.equal(response.status,400);
 const auth=await app(request('/payments/paypal/orders',{request_id:randomUUID(),sku:'pack5'}));assert.equal(auth.status,503);
 const malformed=new Request(origin+'/v1/risk-gate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
 assert.equal((await app(malformed)).status,400);
});
test('payment tables are private, RLS enabled, direct runtime writes denied',async()=>{
 await db.exec('SET ROLE geomacro_billing');
 try{await assert.rejects(query("UPDATE geomacro.x402_intents SET state='confirmed'"),/permission denied/);
 await assert.rejects(query('SELECT * FROM geomacro.paypal_purchases'),/permission denied/);}
 finally{await db.exec('RESET ROLE');}
 const rows=await query("SELECT tablename FROM pg_tables WHERE schemaname='geomacro' AND NOT rowsecurity");assert.equal(rows.length,0);
});

test('subscription creation validates and uses configured monthly plan and ownership',async()=>{
 const plan={id:'P-TEST29',status:'ACTIVE',billing_cycles:[{tenure_type:'REGULAR',sequence:1,total_cycles:0,
 frequency:{interval_unit:'MONTH',interval_count:1},pricing_scheme:{fixed_price:{currency_code:'USD',value:'29.00'}}}]};
 resources.set('/v1/billing/plans/P-TEST29',plan);
 resources.set('/v1/billing/subscriptions',{id:'I-CREATE-FIXTURE',status:'APPROVAL_PENDING',
 links:[{rel:'approve',href:'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=TEST'}]});
 const requestId=randomUUID();
 const created=await engine.create({userId:user,requestId,sku:'monthly29',kind:'subscription'});
 assert.equal(created.provider_id,'I-CREATE-FIXTURE');const call=calls.at(-1);
 assert.equal(call.options.body.plan_id,'P-TEST29');assert.equal(call.options.body.custom_id,requestId);
});
test('forged header fails before creating a payment intent or invoking facilitator',async()=>{
 const i=input(),p=await paymentFor(i),count=submitted;p.payload.signature='0x'+'00'.repeat(65);
 await assert.rejects(xengine.handle(i,encode(p)),/AUTHORIZATION_SIGNATURE_INVALID/);
 assert.equal(await rpc(pool,'x402_get',[i.request_id]),null);assert.equal(submitted,count);
});
test('same-request parallel attempts settle at most once with exclusive database leases',async()=>{
 const i=input(),p=await paymentFor(i),count=submitted;
 const results=await Promise.allSettled(Array.from({length:5},()=>xengine.handle(i,encode(p))));
 assert(results.some(r=>r.status==='fulfilled'&&r.value.status===200));
 for(const r of results)if(r.status==='rejected')assert.match(r.reason.message,/PAYMENT_PROCESSING/);
 assert.equal(submitted,count+1);
});
test('payment ledger and processed event roll back together on database failure',async()=>{
 const p=await setupPack(),e=event('PAYMENT.CAPTURE.COMPLETED',{id:p.capture}),start=await bal();
 await db.exec(`CREATE FUNCTION geomacro.test_event_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_EVENT_FAILURE'; END $$;
 CREATE TRIGGER test_event_fail BEFORE INSERT ON geomacro.payment_events FOR EACH ROW EXECUTE FUNCTION geomacro.test_event_fail();`);
 try{await assert.rejects(webhook(e),/TEST_EVENT_FAILURE/);}finally{
 await db.exec('DROP TRIGGER test_event_fail ON geomacro.payment_events; DROP FUNCTION geomacro.test_event_fail();');}
 assert.equal(await bal(),start);
 await webhook(e);assert.equal(await bal(),start+100000000);
});
test('wrong RPC chain and already consumed authorization are rejected',async()=>{
 const wrong=new BaseVerifier({client:{getChainId:async()=>1}});await assert.rejects(wrong.blockNumber(),/BASE_CHAIN_MISMATCH/);
 const used=new BaseVerifier({client:{getChainId:async()=>8453,readContract:async()=>true}});
 const p=await paymentFor(input());await assert.rejects(used.checkUnusedAndSimulate(p.payload.authorization,p.payload.signature),/AUTHORIZATION_ALREADY_USED/);
});
test('facilitator wire format is v2 and rejects invalid verification',async()=>{
 const p=await paymentFor(input()),expected=requirements(150000,payee);let body;
 const f=new Facilitator({url:'https://facilitator.example',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://facilitator.example/verify');body=JSON.parse(options.body);return Response.json({isValid:false});}});
 await assert.rejects(f.verify(p,expected),/FACILITATOR_PAYMENT_INVALID/);
 assert.equal(body.x402Version,2);assert.deepEqual(body.paymentRequirements,expected);assert.deepEqual(body.paymentPayload,p);
});

test('USD parsing accepts valid PayPal decimal formats without floating point',()=>{
 assert.equal(cents('5'),500);assert.equal(cents('5.0'),500);assert.equal(cents('5.00'),500);
 assert.equal(cents('0.01'),1);assert.throws(()=>cents('5.001'),/INVALID_MONEY/);
 assert.throws(()=>cents('1e3'),/INVALID_MONEY/);assert.throws(()=>cents('-1.00'),/INVALID_MONEY/);
});
