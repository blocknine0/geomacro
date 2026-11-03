import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
  CUSTOMER_PAYPAL_LOCKED_CATALOG,
  CustomerFundingError,
  prepareCustomerPayPalCheckoutIntent,
  bindCustomerPayPalProviderOrder,
  fundCanonicalCustomerFromVerifiedPayPal,
} from '../../workers/control-plane/src/customer-paypal-funding.mjs';
import {revokeCustomerPayPalGrantFromVerifiedWebhook} from '../../workers/control-plane/src/customer-paypal-refund.mjs';

const files=[
 '0090_customer_canonical_d1.sql','0091_customer_canonical_integrity_triggers.sql',
 '0092_customer_resend_otp_sessions.sql','0093_customer_email_provider_quota.sql',
 '0094_customer_login_runtime.sql','0095_customer_grant_scoped_usage.sql',
 '0096_customer_prepaid_pack_spend.sql','0097_customer_paypal_checkout_intents.sql',
];
const userId='customer-paypal-verified-0001';
const merchant='MERCHANT123456';
const secret='a-dedicated-funding-attestation-key-for-the-live-merchant-not-a-browser-key-000001';
const order='8AB1234567891234C', capture='9CF1234567891234D';
const activeEnv={
 GEOMACRO_COMMERCE_EMERGENCY_FREEZE:'false',
 GEOMACRO_COMMERCIAL_LAUNCH_ACK:'I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH',
 GEOMACRO_REAL_FUNDS_SECURITY_ACK:'I_ACCEPT_REAL_FUNDS_SECURITY_GATES',
 GEOMACRO_CENTRAL_SECURITY_MODE:'enforce',
 GEOMACRO_PAYPAL_ENVIRONMENT:'live',
 GEOMACRO_PAYPAL_KYC_RECEIVE_ACK:'VERIFIED_LIVE_CROSS_BORDER_MERCHANT',
 GEOMACRO_PAYPAL_MERCHANT_ID:merchant,
 GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY:secret,
};
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of files)sql.exec(readFileSync('workers/control-plane/migrations/'+name,'utf8'));
 const db={
   prepare(q){return {bind(...args){return {
     first:async()=>sql.prepare(q).get(...args)??null,
     run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}}),
   };}};},
   async batch(stmts){
     sql.exec('BEGIN');
     try{
       const values=[];for(const s of stmts)values.push(await s.run());
       sql.exec('COMMIT');return values;
     }catch(error){sql.exec('ROLLBACK');throw error;}
   },
 };
 sql.prepare('INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)')
  .run(userId,'funding@example.invalid',new Date().toISOString());
 return {sql,db};
}
function proofFor(intentId,sku='starter_pack',captureId=capture,orderId=order){
 const settledAt=new Date().toISOString();
 const data={
   schema:'geomacro.paypal-verified-capture.v1',
   provider:'paypal',environment:'live',orderId,captureId,
   merchantId:merchant,intentId,currency:'USD',
   amountMinorUnits:CUSTOMER_PAYPAL_LOCKED_CATALOG[sku].price,settledAt,
 };
 const verificationSha256=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const proof={...data,verificationSha256};
 const fields=[
  'geomacro.paypal-funding.v1',proof.environment,proof.orderId,
  proof.captureId,proof.merchantId,proof.intentId,proof.currency,
  String(proof.amountMinorUnits),proof.settledAt,proof.verificationSha256,
 ];
 const attestation=createHmac('sha256',secret).update(fields.join('\0')).digest('hex');
 return {proof,attestation};
}
async function setup(sku='starter_pack'){
 const f=fixture();
 const initial=await prepareCustomerPayPalCheckoutIntent(f.db,userId,sku);
 await bindCustomerPayPalProviderOrder(f.db,userId,initial.intentId,order);
 return {...f,...initial,sku};
}
test('PayPal 6-SKU cents and credits exactly match owner-facing catalog',()=>{
 const pricing=readFileSync('src/lib/low-barrier-pricing.ts','utf8');
 for(const [sku,row] of Object.entries(CUSTOMER_PAYPAL_LOCKED_CATALOG)){
   assert.ok(row.price>0 && row.credits>0);
   assert.ok(pricing.includes('id:"'+sku+'"'));
 }
 assert.deepEqual(Object.entries(CUSTOMER_PAYPAL_LOCKED_CATALOG)
  .map(([k,v])=>[k,v.price,v.credits]),[
   ['starter_dev',900,1000],['pro_analyst',2900,5000],
   ['business_pilot',9900,25000],['starter_pack',500,100],
   ['standard_pack',1500,500],['growth_pack',3000,1500],
 ]);
});
test('signed synthetic provider proof funds exact server-owned prepaid pack once',async()=>{
 const f=await setup();
 const params={userId,...proofFor(f.intentId)};
 const result=await fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,params);
 assert.equal(result.idempotent_replay,false);
 assert.equal(result.credits,100);
 const again=await fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,params);
 assert.equal(again.idempotent_replay,true);
 for(const table of ['customer_payment_receipts','customer_entitlement_grants','credit_ledger']){
   assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,1);
 }
 const grant=f.sql.prepare('SELECT tier,expires_at FROM customer_entitlement_grants').get();
 assert.equal(grant.tier,'credits_100');
 assert.equal(grant.expires_at,'9999-12-31T23:59:59.999Z');
 assert.throws(()=>f.sql.prepare('UPDATE customer_paypal_checkout_intents SET amount_minor_units=1').run(),
  /PAYPAL_INTENT_PRICE_OR_IDENTITY_IMMUTABLE|CHECK constraint/);
 assert.throws(()=>f.sql.prepare('DELETE FROM customer_paypal_checkout_intents').run(),/PAYPAL_INTENT_APPEND_ONLY/);
 f.sql.close();
});
test('the real-money worker refuses frozen, unknown merchant, forged proof or mismatched value',async()=>{
 const f=await setup();
 const valid=proofFor(f.intentId);
 const attempts=[
  {env:{...activeEnv,GEOMACRO_COMMERCE_EMERGENCY_FREEZE:'true'},params:valid,code:'CUSTOMER_PAYPAL_REAL_FUNDS_SECURITY_NOT_ACCEPTED'},
  {env:{...activeEnv,GEOMACRO_PAYPAL_KYC_RECEIVE_ACK:''},params:valid,code:'CUSTOMER_PAYPAL_REAL_FUNDS_SECURITY_NOT_ACCEPTED'},
  {env:activeEnv,params:{...valid,attestation:'f'.repeat(64)},code:'CUSTOMER_PAYPAL_PROOF_SIGNATURE_INVALID'},
  {env:activeEnv,params:{...valid,proof:{...valid.proof,amountMinorUnits:1}},code:'CUSTOMER_PAYPAL_PROVIDER_READBACK_HASH_INVALID'},
  {env:activeEnv,params:{...valid,proof:{...valid.proof,merchantId:'MALICIOUS12345'}},code:'CUSTOMER_PAYPAL_PROOF_INVALID'},
 ];
 for(const item of attempts){
   await assert.rejects(fundCanonicalCustomerFromVerifiedPayPal(f.db,item.env,
     {userId,...item.params}),err=>err instanceof CustomerFundingError&&err.code===item.code);
 }
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM credit_ledger').get().n,0);
 f.sql.close();
});
test('cross-customer claim and duplicate provider event cannot allocate credit',async()=>{
 const f=await setup();
 const params={userId,...proofFor(f.intentId)};
 await assert.rejects(fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,
   {...params,userId:'customer-paypal-attacker-0002'}),
   /CUSTOMER_PAYPAL_INTENT_MISMATCH/);
 const first=await fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,params);
 assert.equal(first.credits,100);
 const changed=proofFor(f.intentId,'starter_pack','OTHER1234567891234D');
 await assert.rejects(fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,
   {userId,...changed}),/CUSTOMER_PAYPAL_INTENT_NOT_FUNDABLE/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM credit_ledger').get().n,1);
 f.sql.close();
});
test('funding is atomic: injected later statement failure cannot leave an unfunded paid receipt',async()=>{
 const f=await setup();
 const original=f.db.batch;
 f.db.batch=async(stmts)=>original(stmts.map((stmt,i)=>i===2?{
   run:async()=>{throw Error('SYNTHETIC_DATABASE_FAILURE');},
 }:stmt));
 await assert.rejects(fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,
   {userId,...proofFor(f.intentId)}),/CUSTOMER_PAYPAL_ATOMIC_FUNDING_UNCONFIRMED/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM customer_payment_receipts').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM customer_entitlement_grants').get().n,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM credit_ledger').get().n,0);
 f.sql.close();
});

function refundFor(){
 const data={
  eventId:'WH-PAYPAL-REFUND-12345678',
  eventType:'PAYMENT.CAPTURE.REFUNDED',
  captureId:capture,merchantId:merchant,transmittedAt:new Date().toISOString(),
  webhookSha256:'f'.repeat(64),
 };
 const attestation=createHmac('sha256',secret).update([
   'geomacro.paypal-refund.v1',data.eventId,data.eventType,data.captureId,
   data.merchantId,data.transmittedAt,data.webhookSha256,
 ].join('\0')).digest('hex');
 return {...data,attestation};
}
test('verified partial/full refund removes entire entitlement even during emergency freeze',async()=>{
 const f=await setup('starter_pack');
 const params={userId,...proofFor(f.intentId)};
 await fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,params);
 const refundEnv={...activeEnv,GEOMACRO_COMMERCE_EMERGENCY_FREEZE:'true'};
 const first=await revokeCustomerPayPalGrantFromVerifiedWebhook(f.db,refundEnv,refundFor());
 assert.equal(first.reversed,true);assert.equal(first.idempotent_replay,false);
 const again=await revokeCustomerPayPalGrantFromVerifiedWebhook(f.db,refundEnv,refundFor());
 assert.equal(again.idempotent_replay,true);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM credit_ledger WHERE event_type='funding'").get().n,1);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM credit_ledger WHERE event_type='reversal'").get().n,1);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM customer_entitlement_grants WHERE status='active'").get().n,0);
 assert.equal(f.sql.prepare("SELECT delta_credits n FROM credit_ledger WHERE event_type='reversal'").get().n,-100);
 f.sql.close();
});
test('forged refund cannot revoke a funded entitlement',async()=>{
 const f=await setup();
 await fundCanonicalCustomerFromVerifiedPayPal(f.db,activeEnv,{userId,...proofFor(f.intentId)});
 const refund=refundFor();
 await assert.rejects(revokeCustomerPayPalGrantFromVerifiedWebhook(f.db,activeEnv,
   {...refund,attestation:'0'.repeat(64)}),/CUSTOMER_PAYPAL_REFUND_ATTESTATION_INVALID/);
 await assert.rejects(revokeCustomerPayPalGrantFromVerifiedWebhook(f.db,activeEnv,
   {...refund,captureId:'UNKNOWN12345678'}),/CUSTOMER_PAYPAL_REFUND_ATTESTATION_INVALID/);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM credit_ledger WHERE event_type='reversal'").get().n,0);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM customer_entitlement_grants WHERE status='active'").get().n,1);
 f.sql.close();
});
