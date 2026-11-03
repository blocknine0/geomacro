/**
 * Canonical D1 PayPal funding admission. No public route or payment activation
 * is created by this module. Only a trusted SSR PayPal GET verifier can sign
 * proof, and the Worker must match its independent, immutable checkout intent.
 */
import {CUSTOMER_CREDIT_CONTRACT} from './customer-paid-ledger.mjs';
const CATALOG=Object.freeze({
  starter_dev:{tier:'starter_dev',price:900,credits:1000,days:30},
  pro_analyst:{tier:'pro_analyst',price:2900,credits:5000,days:30},
  business_pilot:{tier:'business_pilot',price:9900,credits:25000,days:30},
  starter_pack:{tier:'credits_100',price:500,credits:100,days:null},
  standard_pack:{tier:'credits_500',price:1500,credits:500,days:null},
  growth_pack:{tier:'credits_1500',price:3000,credits:1500,days:null},
});
const ID=/^[A-Z0-9]{8,32}$/u;
const INTENT=/^gmpi_[a-f0-9-]{36}$/u;
const HEX=/^[a-f0-9]{64}$/u;
const str=value=>String(value??'');
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=hexstr=>Uint8Array.from(hexstr.match(/../g)||[],x=>parseInt(x,16));
const iso=timestamp=>new Date(timestamp).toISOString();
export class CustomerFundingError extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code;}
}
const fail=(status,code)=>{throw new CustomerFundingError(status,code);};
function validUser(userId){
  if(typeof userId!=='string'||userId.length<16||userId.length>128)
    fail(401,'CUSTOMER_PAYPAL_USER_REQUIRED');
}
function requireServerAcceptance(env){
  if(str(env?.GEOMACRO_COMMERCE_EMERGENCY_FREEZE).toLowerCase()!=='false' ||
     env?.GEOMACRO_COMMERCIAL_LAUNCH_ACK!=='I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH' ||
     env?.GEOMACRO_REAL_FUNDS_SECURITY_ACK!=='I_ACCEPT_REAL_FUNDS_SECURITY_GATES' ||
     env?.GEOMACRO_CENTRAL_SECURITY_MODE!=='enforce' ||
     env?.GEOMACRO_PAYPAL_ENVIRONMENT!=='live' ||
     env?.GEOMACRO_PAYPAL_KYC_RECEIVE_ACK!=='VERIFIED_LIVE_CROSS_BORDER_MERCHANT' ||
     !ID.test(str(env?.GEOMACRO_PAYPAL_MERCHANT_ID)) ||
     str(env?.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY).length<64)
    fail(503,'CUSTOMER_PAYPAL_REAL_FUNDS_SECURITY_NOT_ACCEPTED');
  return env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY;
}
/** Accept live checkout only when the same D1 paid runtime can fulfill credits.
 * Payment rails cannot open merely because a storefront has a price card.
 */
export function assertCustomerPayPalCheckoutReady(env){
  requireServerAcceptance(env);
  // PayPal OAuth credentials live only in SSR. The Worker owns the D1
  // funding attestation key and independently gates paid entitlement runtime.
  if(env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE!=='ACCEPTED_CANONICAL_D1_PAID_RUNTIME')
    fail(503,'CUSTOMER_PAYPAL_CREDIT_RUNTIME_OR_MERCHANT_NOT_READY');
}

async function verifiedUser(db,userId){
  const row=await db.prepare(
    "SELECT id FROM users WHERE id=? AND status='active' AND email_verified_at IS NOT NULL"
  ).bind(userId).first();
  if(!row)fail(403,'CUSTOMER_PAYPAL_VERIFIED_USER_REQUIRED');
}
/** Server-issued immutable price; no browser amount, credit or expiry accepted. */
export async function prepareCustomerPayPalCheckoutIntent(db,userId,sku,now=new Date().toISOString()){
  validUser(userId);
  if(typeof sku!=='string'||!Object.hasOwn(CATALOG,sku))
    fail(400,'CUSTOMER_PAYPAL_SKU_INVALID');
  if(!Number.isFinite(Date.parse(now)))fail(503,'CUSTOMER_PAYPAL_CLOCK_INVALID');
  await verifiedUser(db,userId);
  const item=CATALOG[sku],intentId='gmpi_'+crypto.randomUUID();
  const expiry=iso(Date.parse(now)+3*60*60*1000);
  const result=await db.prepare(`INSERT INTO customer_paypal_checkout_intents
    (intent_id,user_id,sku,tier,amount_minor_units,credits,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(intentId,userId,sku,item.tier,item.price,
      item.credits,now,expiry).run();
  if(result.meta?.changes!==1)fail(503,'CUSTOMER_PAYPAL_INTENT_NOT_SAVED');
  return {intentId,sku,amountMinorUnits:item.price,credits:item.credits,
    currency:'USD',expiresAt:expiry};
}
export async function bindCustomerPayPalProviderOrder(db,userId,intentId,orderId,now=new Date().toISOString()){
  validUser(userId);
  if(!INTENT.test(str(intentId))||!ID.test(str(orderId)))
    fail(400,'CUSTOMER_PAYPAL_ORDER_BINDING_INVALID');
  const result=await db.prepare(`UPDATE customer_paypal_checkout_intents
    SET provider_order_id=?,state='bound'
    WHERE intent_id=? AND user_id=? AND state='created'
      AND provider_order_id IS NULL AND expires_at>?`)
    .bind(orderId,intentId,userId,now).run();
  if(result.meta?.changes===1)return {ok:true,intentId,orderId};
  const existing=await db.prepare(`SELECT provider_order_id,state
    FROM customer_paypal_checkout_intents WHERE intent_id=? AND user_id=?`)
    .bind(intentId,userId).first();
  if(existing?.provider_order_id===orderId&&
     ['bound','capture_requested','funded'].includes(existing.state))
    return {ok:true,intentId,orderId,idempotent_replay:true};
  fail(409,'CUSTOMER_PAYPAL_ORDER_BINDING_CONFLICT');
}
/** Live order ID readback; it does not certify settlement or transfer funds. */
export async function readCustomerPayPalCheckoutIntent(db,userId,orderId){
  validUser(userId);
  if(!ID.test(str(orderId)))fail(400,'CUSTOMER_PAYPAL_ORDER_ID_INVALID');
  const row=await db.prepare(`SELECT intent_id,user_id,sku,tier,amount_minor_units,
    credits,provider_order_id,state,created_at,expires_at,funded_at
    FROM customer_paypal_checkout_intents WHERE user_id=? AND provider_order_id=?`)
    .bind(userId,orderId).first();
  if(!row)fail(404,'CUSTOMER_PAYPAL_ORDER_NOT_FOUND');
  return {intentId:row.intent_id,orderId:row.provider_order_id,
    sku:row.sku,amountMinorUnits:row.amount_minor_units,credits:row.credits,
    state:row.state,expiresAt:row.expires_at};
}
/** D1 compare-and-set fencing before ANY non-idempotent provider capture.
 * An ambiguous network result is intentionally left capture_requested:
 * later retries may read PayPal status, but may NEVER capture again.
 */
export async function claimCustomerPayPalCapture(db,userId,orderId,now=new Date().toISOString()){
  const order=await readCustomerPayPalCheckoutIntent(db,userId,orderId);
  const changed=await db.prepare(`UPDATE customer_paypal_checkout_intents
     SET state='capture_requested' WHERE user_id=? AND provider_order_id=?
       AND state='bound' AND expires_at>?`).bind(userId,orderId,now).run();
  if(changed.meta?.changes===1)return {...order,claimed:true,state:'capture_requested'};
  const after=await readCustomerPayPalCheckoutIntent(db,userId,orderId);
  return {...after,claimed:false};
}

async function verifyAttestation(env,proof,signature){
  const secret=requireServerAcceptance(env);
  if(!proof||typeof proof!=='object'||Array.isArray(proof)||
     !HEX.test(str(signature))||!HEX.test(str(proof.verificationSha256))||
     proof.environment!=='live'||proof.provider!=='paypal'||proof.currency!=='USD'||
     !ID.test(str(proof.orderId))||!ID.test(str(proof.captureId))||
     !ID.test(str(proof.merchantId))||!INTENT.test(str(proof.intentId))||
     !Number.isSafeInteger(proof.amountMinorUnits)||proof.amountMinorUnits<=0||
     !Number.isFinite(Date.parse(str(proof.settledAt)))||
     proof.merchantId!==env.GEOMACRO_PAYPAL_MERCHANT_ID)
    fail(403,'CUSTOMER_PAYPAL_PROOF_INVALID');
  const fields={
    schema:'geomacro.paypal-verified-capture.v1',provider:'paypal',
    environment:'live',orderId:proof.orderId,captureId:proof.captureId,
    merchantId:proof.merchantId,intentId:proof.intentId,currency:'USD',
    amountMinorUnits:proof.amountMinorUnits,settledAt:proof.settledAt,
  };
  const dig=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(fields))));
  if(dig!==proof.verificationSha256)fail(403,'CUSTOMER_PAYPAL_PROVIDER_READBACK_HASH_INVALID');
  const message=[
    'geomacro.paypal-funding.v1',proof.environment,proof.orderId,
    proof.captureId,proof.merchantId,proof.intentId,proof.currency,
    str(proof.amountMinorUnits),proof.settledAt,proof.verificationSha256,
  ].join('\0');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['verify']);
  const ok=await crypto.subtle.verify('HMAC',key,bytes(signature),encoder.encode(message));
  if(!ok)fail(403,'CUSTOMER_PAYPAL_PROOF_SIGNATURE_INVALID');
}
async function confirmedFundingReadback(db,intent,proof){
  const receipt=await db.prepare(`SELECT receipt_id,user_id,provider,environment,
     provider_event_id,provider_order_id,sku,amount_minor_units,currency,
     verification_sha256 FROM customer_payment_receipts
     WHERE provider='paypal' AND environment='live' AND provider_event_id=?`)
    .bind(proof.captureId).first();
  const receiptId='r_paypal_'+proof.captureId;
  if(!receipt||receipt.receipt_id!==receiptId||
     receipt.user_id!==intent.user_id||receipt.provider_order_id!==proof.orderId||
     receipt.sku!==intent.sku||receipt.amount_minor_units!==intent.amount_minor_units||
     receipt.currency!=='USD'||receipt.verification_sha256!==proof.verificationSha256)
    return null;
  const grant=await db.prepare(`SELECT grant_id,credits,status FROM
      (SELECT g.grant_id,g.status,l.delta_credits AS credits FROM customer_entitlement_grants g
       JOIN credit_ledger l ON l.receipt_id=g.receipt_id AND l.event_type='funding'
       WHERE g.receipt_id=? AND g.user_id=? AND g.tier=?)`)
    .bind(receiptId,intent.user_id,intent.tier).first();
  if(!grant||grant.grant_id!=='g_paypal_'+proof.captureId||
     grant.status!=='active'||grant.credits!==intent.credits)
    return null;
  const reversed=await db.prepare(`SELECT event_id FROM credit_ledger
    WHERE receipt_id=? AND event_type='reversal'`).bind(receiptId).first();
  if(reversed)fail(409,'CUSTOMER_PAYPAL_PAYMENT_REVERSED');
  return {ok:true,idempotent_replay:true,receiptId,grantId:grant.grant_id,
    credits:intent.credits};
}
/**
 * Durable single-transaction funding. Caller supplies only a secret-HMAC
 * attested provider GET readback, not a transaction hash or browser claim.
 * A crash after capture is reconciled via this same idempotent entry point.
 */
export async function fundCanonicalCustomerFromVerifiedPayPal(db,env,
  {userId,proof,attestation},now=new Date().toISOString()){
  validUser(userId);
  if(typeof db?.batch!=='function')fail(503,'CUSTOMER_PAYPAL_D1_TRANSACTION_REQUIRED');
  await verifyAttestation(env,proof,attestation);
  const intent=await db.prepare(`SELECT intent_id,user_id,sku,tier,
    amount_minor_units,credits,provider_order_id,state,created_at,expires_at
    FROM customer_paypal_checkout_intents WHERE intent_id=? AND user_id=?`)
    .bind(proof.intentId,userId).first();
  if(!intent||intent.user_id!==userId||intent.provider_order_id!==proof.orderId||
     intent.amount_minor_units!==proof.amountMinorUnits||
     !Object.hasOwn(CATALOG,intent.sku)||
     intent.tier!==CATALOG[intent.sku].tier||
     intent.credits!==CATALOG[intent.sku].credits||
     intent.amount_minor_units!==CATALOG[intent.sku].price)
    fail(403,'CUSTOMER_PAYPAL_INTENT_MISMATCH');
  const existing=await confirmedFundingReadback(db,intent,proof);
  if(existing)return existing;
  if(!['bound','capture_requested'].includes(intent.state))
    fail(409,'CUSTOMER_PAYPAL_INTENT_NOT_FUNDABLE');
  const clock=Date.parse(now),settled=Date.parse(proof.settledAt);
  if(!Number.isFinite(clock)||!Number.isFinite(settled)||
     settled<Date.parse(intent.created_at)-300000 ||
     settled>Date.parse(intent.expires_at)+300000 ||
     settled>clock+300000)
    fail(403,'CUSTOMER_PAYPAL_SETTLEMENT_CLOCK_INVALID');
  const duration=CATALOG[intent.sku].days;
  const expiry=duration===null?'9999-12-31T23:59:59.999Z':
    iso(settled+duration*86400000);
  if(expiry<=now)fail(409,'CUSTOMER_PAYPAL_GRANT_EXPIRED');
  const receiptId='r_paypal_'+proof.captureId;
  const grantId='g_paypal_'+proof.captureId;
  const fundingId='f_paypal_'+proof.captureId;
  try {
    await db.batch([
      db.prepare(`INSERT INTO customer_payment_receipts
        (receipt_id,user_id,provider,environment,provider_event_id,
        provider_order_id,sku,amount_minor_units,currency,
        settled_at,verified_at,verification_sha256)
        SELECT ?,user_id,'paypal','live',?,provider_order_id,sku,amount_minor_units,
          'USD',?,?,? FROM customer_paypal_checkout_intents
        WHERE intent_id=? AND user_id=? AND state IN ('bound','capture_requested')
          AND provider_order_id=?`).bind(receiptId,proof.captureId,
          proof.settledAt,now,proof.verificationSha256,
          intent.intent_id,userId,proof.orderId),
      db.prepare(`INSERT INTO customer_entitlement_grants
        (grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status)
        VALUES(?,?,?,?,?,?,?,'active')`).bind(grantId,userId,receiptId,intent.tier,
          CUSTOMER_CREDIT_CONTRACT,now,expiry),
      db.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,
        delta_credits,receipt_id,occurred_at)
        VALUES(?,?,'funding',?,?,?)`).bind(fundingId,userId,intent.credits,receiptId,now),
      db.prepare(`UPDATE customer_paypal_checkout_intents
        SET state='funded',funded_at=?
        WHERE intent_id=? AND user_id=? AND provider_order_id=?
          AND state IN ('bound','capture_requested')`).bind(now,intent.intent_id,
          userId,proof.orderId),
    ]);
  } catch {
    const replay=await confirmedFundingReadback(db,intent,proof);
    if(replay)return replay;
    fail(503,'CUSTOMER_PAYPAL_ATOMIC_FUNDING_UNCONFIRMED');
  }
  const verified=await confirmedFundingReadback(db,intent,proof);
  if(!verified)fail(503,'CUSTOMER_PAYPAL_FUNDING_READBACK_UNAVAILABLE');
  return {...verified,idempotent_replay:false};
}
export const CUSTOMER_PAYPAL_LOCKED_CATALOG=CATALOG;
