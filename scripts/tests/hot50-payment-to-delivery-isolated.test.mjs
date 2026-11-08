import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash,createHmac,generateKeyPairSync,sign,verify} from 'node:crypto';
import {
 prepareCustomerPayPalCheckoutIntent,bindCustomerPayPalProviderOrder,
 fundCanonicalCustomerFromVerifiedPayPal
} from '../../workers/control-plane/src/customer-paypal-funding.mjs';
import {mintCanonicalHot50ApiKey} from '../../workers/control-plane/src/customer-paid-ledger.mjs';
import {handleHot50CommercialRead,HOT50_CATEGORIES,HOT50_SIGNED_SCHEMA}
 from '../../workers/control-plane/src/hot50-commercial-read.mjs';
import {RISK_GATE_HOT50} from '../../workers/control-plane/src/risk-gate-hot50-scope.mjs';

const MIGRATIONS=[
 '0090_customer_canonical_d1.sql','0091_customer_canonical_integrity_triggers.sql',
 '0092_customer_resend_otp_sessions.sql','0093_customer_email_provider_quota.sql',
 '0094_customer_login_runtime.sql','0095_customer_grant_scoped_usage.sql',
 '0096_customer_prepaid_pack_spend.sql','0097_customer_paypal_checkout_intents.sql',
 '0215_commercial_hot50_immutable_signed_delivery.sql',
 '0216_hot50_plan_scope_d1.sql'
];
const SHA=x=>createHash('sha256').update(x).digest('hex');
const merchant='MERCHANT123456',order='7AB1234567891234C',capture='9CF1234567891234D';
const userId='test-paid-pro-analyst-0001';
const pepper='isolated-sqlite-fixture-password-not-a-live-secret-00000000';
const fundingKey='fixture-only-attestation-key-for-simulated-merchant-settlement-0000000000000001';
const signKey=generateKeyPairSync('ed25519');
function createTestDb(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const migration of MIGRATIONS)
  sql.exec(readFileSync('workers/control-plane/migrations/'+migration,'utf8'));
 const prepare=q=>({bind(...args){return {
   first:async()=>sql.prepare(q).get(...args)??null,
   all:async()=>({results:sql.prepare(q).all(...args)}),
   run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}}),
  };}});
 const db={prepare,
  async batch(statements){
   sql.exec('BEGIN');
   try{
    const results=[];
    for(const statement of statements)results.push(await statement.run());
    sql.exec('COMMIT');return results;
   }catch(error){sql.exec('ROLLBACK');throw error;}
  },
 };
 return {sql,db};
}
const settlementEnv={
 GEOMACRO_COMMERCE_EMERGENCY_FREEZE:'false',
 GEOMACRO_COMMERCIAL_LAUNCH_ACK:'I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH',
 GEOMACRO_REAL_FUNDS_SECURITY_ACK:'I_ACCEPT_REAL_FUNDS_SECURITY_GATES',
 GEOMACRO_CENTRAL_SECURITY_MODE:'enforce',
 GEOMACRO_PAYPAL_ENVIRONMENT:'live',
 GEOMACRO_PAYPAL_KYC_RECEIVE_ACK:'VERIFIED_LIVE_CROSS_BORDER_MERCHANT',
 GEOMACRO_PAYPAL_MERCHANT_ID:merchant,
 GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY:fundingKey,
};
const riskEnv={
 GEOMACRO_API_CREDENTIAL_PEPPER:pepper,
 GEOMACRO_HOT50_PUBLIC_KEY_ID:'fixture-signing-key',
 GEOMACRO_HOT50_PUBLIC_JWK_JSON:JSON.stringify(signKey.publicKey.export({format:'jwk'})),
 GEOMACRO_HOT50_COMMERCIAL_ACCEPTANCE:'ACCEPTED_SIGNED_B2_VERIFIED_150_CELLS',
};
function signedPaymentProof(intentId,now){
 const fields={
  schema:'geomacro.paypal-verified-capture.v1',
  provider:'paypal',environment:'live',orderId:order,captureId:capture,
  merchantId:merchant,intentId,currency:'USD',amountMinorUnits:2900,settledAt:now,
 };
 const verificationSha256=SHA(JSON.stringify(fields));
 const proof={...fields,verificationSha256};
 const message=[
  'geomacro.paypal-funding.v1','live',order,capture,merchant,intentId,'USD',
  '2900',now,verificationSha256
 ].join('\0');
 const attestation=createHmac('sha256',fundingKey).update(message).digest('hex');
 return {proof,attestation};
}
function signedRiskSnapshot(now){
 const published=new Date(Date.parse(now)-60000).toISOString();
 const expires=new Date(Date.parse(now)+1800000).toISOString();
 const cat=(category)=>({score:65,confidence_low:50,confidence_high:80,
  confidence:0.85,qualified_evidence_count:3,
  ...(category==='trade_minerals_supplychain'?{verified_subdomains:['trade','critical_minerals','supply_chain']}:{}),
  b2_evidence_pointer:'b2://fixture-evidence/verified/not-real.json',
  b2_evidence_sha256:'a'.repeat(64)});
 const countries=RISK_GATE_HOT50.map(iso3=>({
  iso3,composite_score:65,
  ratings:Object.fromEntries(HOT50_CATEGORIES.map(x=>[x,cat(x)]))
 }));
 const payload={schema:HOT50_SIGNED_SCHEMA,view_key:'hot50',
  public_key_id:'fixture-signing-key',execution_authorized:false,
  evidence_qualification:'QUALIFIED',b2_readback_status:'VERIFIED',
  b2_pointer:'b2://fixture-evidence/hot50/not-real.json',
  b2_sha256:'b'.repeat(64),verifier_proof_sha256:'c'.repeat(64),
  published_at:published,expires_at:expires,countries};
 const bytes=JSON.stringify(payload);
 return {payload,bytes,signature:sign(null,Buffer.from(bytes),signKey.privateKey).toString('base64'),
   hash:SHA(bytes)};
}
test('LOCAL_SIMULATION_ONLY: webhook-first PayPal funding has one immutable plaintext-only-once key handoff',async()=>{
 const {sql,db}=createTestDb();
 try{
  const at=new Date().toISOString();
  sql.prepare('INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)')
   .run(userId,'webhook-first@example.invalid',at);
  const intent=await prepareCustomerPayPalCheckoutIntent(db,userId,'pro_analyst');
  await bindCustomerPayPalProviderOrder(db,userId,intent.intentId,order);
  const syntheticProof=signedPaymentProof(intent.intentId,at);
  const funded=await fundCanonicalCustomerFromVerifiedPayPal(db,settlementEnv,
   {userId,...syntheticProof});
  assert.equal(funded.idempotent_replay,false);
  // Provider webhook wins race; buyer return observes canonical replay.
  const replay=await fundCanonicalCustomerFromVerifiedPayPal(db,settlementEnv,
   {userId,...syntheticProof});
  assert.equal(replay.idempotent_replay,true);
  const first=await mintCanonicalHot50ApiKey(db,riskEnv,userId,at,funded.receiptId);
  assert.match(first.api_key,/^gm_live_[a-f0-9]{32}$/);
  assert.equal(first.idempotent_replay,false);
  const again=await mintCanonicalHot50ApiKey(db,riskEnv,userId,at,funded.receiptId);
  assert.equal(again.api_key,null);
  assert.equal(again.idempotent_replay,true);
  assert.equal(again.key_id,first.key_id);
  assert.equal(again.key_issuance_status,'ALREADY_ISSUED');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM commercial_hot50_checkout_key_handoffs').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM api_keys').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM tenant_api_keys_v1').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM customer_payment_receipts').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM credit_ledger').get().n,1);
  assert.throws(()=>sql.prepare('UPDATE commercial_hot50_checkout_key_handoffs SET key_id=?')
   .run('attacker-key'),/IMMUTABLE_HOT50_CHECKOUT_HANDOFF/);
  await assert.rejects(mintCanonicalHot50ApiKey(db,riskEnv,userId,at,'r_paypal_OTHERCAPTURE123'),
   /CUSTOMER_HOT50_FUNDED_ENTITLEMENT_REQUIRED/);
 }finally{sql.close();}
});

test('LOCAL_SIMULATION_ONLY: $29 plan -> 5000 credits -> gm_live key -> signed 150-cell 200 -> idempotent 15-credit debit -> exhausted 402',async()=>{
 const {sql,db}=createTestDb();
 try {
  const at=new Date().toISOString();
  sql.prepare('INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)')
    .run(userId,'pro@example.invalid',at);
  const intent=await prepareCustomerPayPalCheckoutIntent(db,userId,'pro_analyst');
  await bindCustomerPayPalProviderOrder(db,userId,intent.intentId,order);
  // Not a provider callback! Deterministic HMAC fixture, in isolated :memory:
  const syntheticProof=signedPaymentProof(intent.intentId,at);
  const funded=await fundCanonicalCustomerFromVerifiedPayPal(db,settlementEnv,
   {userId,...syntheticProof});
  assert.equal(funded.credits,5000);
  assert.equal((await fundCanonicalCustomerFromVerifiedPayPal(db,settlementEnv,
   {userId,...syntheticProof})).idempotent_replay,true);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM customer_payment_receipts').get().n,1);
  assert.equal(sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,5000);
  const minted=await mintCanonicalHot50ApiKey(db,riskEnv,userId);
  assert.match(minted.api_key,/^gm_live_[a-f0-9]{32}$/);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM api_keys').get().n,1);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM tenant_api_keys_v1').get().n,1);
  assert.equal(sql.prepare('SELECT key_sha256 FROM tenant_api_keys_v1').get().key_sha256,SHA(minted.api_key));
  assert.notEqual(sql.prepare('SELECT hmac_sha256 FROM api_keys').get().hmac_sha256,minted.api_key);
  const row=signedRiskSnapshot(at);
  sql.prepare(`INSERT INTO commercial_hot50_signed_snapshots
   (snapshot_sha256,view_key,signed_json,signature_b64,public_key_id,b2_pointer,
    b2_sha256,verifier_state,verifier_proof_sha256,published_at,expires_at)
   VALUES(?,?,?,?,?,? ,?,'CRYPTO_AND_B2_READBACK_VERIFIED',?,?,?)`)
   .run(row.hash,'hot50',row.bytes,row.signature,'fixture-signing-key',
     row.payload.b2_pointer,row.payload.b2_sha256,row.payload.verifier_proof_sha256,
     row.payload.published_at,row.payload.expires_at);
  const route='https://control.example/v1/risk/hot50';
  const env={...riskEnv,DB:db};
  const call=(id,secret=minted.api_key)=>handleHot50CommercialRead(
   new Request(route,{headers:{
    ...(secret?{Authorization:'Bearer '+secret}:{}),'Idempotency-Key':id,
   }}),env);
  assert.equal((await call('fixture-unauth-0001','')).status,401);
  const first=await call('fixture-request-0001');
  assert.equal(first.status,200,JSON.stringify(await first.clone().json()));
  const body=await first.json();
  assert.equal(body.ok,true);assert.equal(body.view.countries.length,50);
  assert.deepEqual(Object.keys(body.view.countries[0].ratings),HOT50_CATEGORIES);
  assert.equal(body.billing.credit_cost,15);
  assert.equal(body.billing.idempotent_replay,false);
  assert.equal(verify(null,Buffer.from(row.bytes),signKey.publicKey,
    Buffer.from(body.signature.signature_b64,'base64')),true);
  assert.equal(sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,4985);
  const replay=await call('fixture-request-0001');
  assert.equal(replay.status,200);
  assert.equal((await replay.json()).billing.idempotent_replay,true);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM customer_usage_receipts').get().n,1);
  assert.equal(sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,4985);
  // Spend the remainder through the same SQL trigger, never modifying a
  // balance or ledger row directly; 333 * 15=4995; 5 remain.
  for(let i=0;i<332;i++){
   sql.prepare(`INSERT INTO customer_usage_receipts
    (user_id,request_id,event_id,key_id,grant_id,capability,credit_cost,contract_version,occurred_at)
    VALUES(?,?,?,?,?,'risk_gate_bundle',15,'credits-v1.1.0',?)`)
    .run(userId,'exhaustion-'+String(i).padStart(4,'0'),
      'e-exhaustion-'+String(i).padStart(4,'0'),minted.key_id,
      'g_paypal_'+capture,at);
  }
  assert.equal(sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,5);
  const blocked=await call('fixture-request-0002');
  assert.equal(blocked.status,402,JSON.stringify(await blocked.clone().json()));
  assert.equal((await blocked.json()).error,'CUSTOMER_PAID_INSUFFICIENT_CREDITS');
  assert.equal(sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,5);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM commercial_hot50_delivery_receipts').get().n,1);
 }finally{sql.close();}
});
