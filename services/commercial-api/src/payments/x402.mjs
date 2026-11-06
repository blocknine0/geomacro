import { sign,createPublicKey,randomUUID } from 'node:crypto';
import { canonicalize,hash,verifyReceipt } from '../metering.mjs';
import { PaymentError,requireValue,rpc,uuid } from './common.mjs';
import { requirements,parsePayment,validateAuthorization,NETWORK } from './base.mjs';
const ranks={basic:1,standard:2,complex:3};
const amounts={basic:100000,standard:150000,complex:250000};
const encoded = value => Buffer.from(JSON.stringify(value),'utf8').toString('base64');
export class X402Engine {
 constructor({pool,payee,siteOrigin,base,facilitator,resolveRisk,privateKey,publicKeyId,publicKeys}) {
  requireValue(/^0x[0-9a-fA-F]{40}$/.test(payee)&&!/^0x0{40}$/i.test(payee),'X402_PAYEE_REQUIRED',500);
  requireValue(new URL(siteOrigin).protocol==='https:','HTTPS_ORIGIN_REQUIRED',500);
  requireValue(createPublicKey(privateKey).asymmetricKeyType==='ed25519'&&publicKeys[publicKeyId],'ED25519_KEYS_REQUIRED',500);
  Object.assign(this,{pool,payee:payee.toLowerCase(),siteOrigin,base,facilitator,resolveRisk,privateKey,publicKeyId,publicKeys});
 }
 resource(input){const u=new URL('/v1/risk-gate',this.siteOrigin);u.searchParams.set('subject',input.subject);
  u.searchParams.set('tier',input.tier);u.searchParams.set('request_id',input.request_id);
  return {url:u.toString(),description:'GeoMacro advisory risk intelligence',mimeType:'application/json'};}
 fingerprint(input){return hash(canonicalize({method:'POST',path:'/v1/risk-gate',subject:input.subject,tier:input.tier}));}
 validateInput(input){requireValue(input&&uuid(input.request_id)&&typeof input.subject==='string'&&
  /^[A-Z0-9][A-Z0-9:_-]{1,127}$/.test(input.subject)&&Object.hasOwn(ranks,input.tier),'INVALID_RISK_REQUEST',400);}
 challenge(input,tier,error='Payment authorization required') {
  const body={x402Version:2,error,resource:this.resource(input),accepts:[requirements(amounts[tier],this.payee)]};
  return new Response(JSON.stringify(body),{status:402,headers:{'Content-Type':'application/json','Cache-Control':'no-store','PAYMENT-REQUIRED':encoded(body)}});
 }
 receipt(intent){const b=JSON.parse(intent.canonical_payload);return {signature:intent.signature,public_key_id:intent.public_key_id,
  timestamp:b.generated_at,hash:hash(intent.canonical_payload)};}
 assertStoredSignature(intent){requireValue(verifyReceipt(intent.canonical_payload,this.receipt(intent),this.publicKeys[intent.public_key_id]),'STORED_SIGNATURE_INVALID');}
 response(intent){this.assertStoredSignature(intent);const settlement={success:true,transaction:intent.tx_hash,network:NETWORK,payer:intent.payer_address};
  return new Response(JSON.stringify({...JSON.parse(intent.canonical_payload),audit_receipt:this.receipt(intent)}),
   {status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store','PAYMENT-RESPONSE':encoded(settlement)}});}
 async handle(input,header,{signal}={}) {
  this.validateInput(input);signal?.throwIfAborted();
  let intent=await rpc(this.pool,'x402_get',[input.request_id]);
  const payment=header?parsePayment(header):null;
  if(intent){
    requireValue(intent.request_hash===this.fingerprint(input),'IDEMPOTENCY_CONFLICT',409);
    if(!payment)return this.challenge(input,intent.billed_tier);
    requireValue(intent.payment_hash===hash(canonicalize(payment)),'PAYMENT_REPLAY_CONFLICT',409);
    if(intent.state==='confirmed')return this.response(intent);
    this.assertStoredSignature(intent);
    signal?.throwIfAborted();
    return this.response(await this.settleIntent(intent,{signal}));
  }
  // Trusted existing intelligence resolver. Incomplete evidence must never be
  // replaced by sample or internal triage data to manufacture a billable result.
  const result=await this.resolveRisk({subject:input.subject,tier:input.tier,signal});
  const tier=Object.keys(ranks).filter(t=>ranks[t]<=ranks[input.tier]&&result?.availableTiers?.includes(t))
    .sort((a,b)=>ranks[b]-ranks[a])[0];
  requireValue(tier,'INCONCLUSIVE_NO_CHARGE');
  const risk=result.riskByTier?.[tier];
  requireValue(risk&&['allow','review','deny'].includes(risk.decision)&&Number.isFinite(risk.risk_score)&&
   risk.risk_score>=0&&risk.risk_score<=100&&Array.isArray(risk.factors),'INCONCLUSIVE_NO_CHARGE');
  if(!payment)return this.challenge(input,tier);
  const expected=requirements(amounts[tier],this.payee);
  // If availability changes, issue the cheaper fresh challenge; never settle
  // a complex authorization for a standard result.
  if(payment.accepted?.amount!==expected.amount)return this.challenge(input,tier,'Available tier or price changed; sign the displayed amount');
  if(payment.resource)requireValue(payment.resource.url===this.resource(input).url,'PAYMENT_RESOURCE_MISMATCH',402);
  const {authorization,payer,nonce}=await validateAuthorization(payment,expected);
  const block=await this.base.blockNumber();
  const payload={request_id:input.request_id,subject:input.subject,requested_tier:input.tier,
   decision:risk.decision,risk_score:risk.risk_score,factors:risk.factors,billed_tier:tier,credits_deducted:0,
   payment_rail:'base_usdc',payment_amount_atomic:String(amounts[tier]),payer,payee:this.payee,payment_nonce:nonce,
   execution_authorized:false,generated_at:new Date().toISOString(),public_key_id:this.publicKeyId};
  const canonical=canonicalize(payload),signature=sign(null,Buffer.from(canonical),this.privateKey).toString('base64');
  requireValue(verifyReceipt(canonical,{signature,public_key_id:this.publicKeyId,timestamp:payload.generated_at,hash:hash(canonical)},
   this.publicKeys[this.publicKeyId]),'SIGNATURE_VERIFICATION_FAILED');
  // Serialize before any settlement side effect and persist before disclosing
  // authorization to a facilitator. A durable result survives process crashes.
  JSON.stringify({...payload,audit_receipt:{signature}});signal?.throwIfAborted();
  intent=await rpc(this.pool,'x402_prepare',[JSON.stringify({request_id:input.request_id,request_hash:this.fingerprint(input),
   subject:input.subject,requested_tier:input.tier,billed_tier:tier,amount_atomic:String(amounts[tier]),
   payer_address:payer,payee_address:this.payee,nonce,payment_hash:hash(canonicalize(payment)),payment_payload:payment,
   canonical_payload:canonical,signature,public_key_id:this.publicKeyId,scan_from_block:String(block)})]);
  signal?.throwIfAborted();return this.response(await this.settleIntent(intent,{signal}));
 }
 async settleIntent(original,{signal,allowSubmit=true}={}) {
  this.assertStoredSignature(original);
  const token=randomUUID(),intent=await rpc(this.pool,'x402_claim',[original.request_id,token]);
  if(intent.state==='confirmed')return intent;
  const expected=requirements(intent.amount_atomic,intent.payee_address);
  let tx=intent.tx_hash;
  if(!tx)tx=await this.base.findAuthorization(intent);
  if(!tx && allowSubmit){
    // Never create a second authorization. Re-submitting the same nonce is
    // on-chain single-use even after an uncertain prior facilitator response.
    await validateAuthorization(intent.payment_payload,expected);
    const auth=intent.payment_payload.payload;
    await this.base.checkUnusedAndSimulate(auth.authorization,auth.signature);
    await this.facilitator.verify(intent.payment_payload,expected);
    signal?.throwIfAborted();
    const settled=await this.facilitator.settle(intent.payment_payload,expected);
    if(settled.transaction&&/^0x[0-9a-fA-F]{64}$/.test(settled.transaction)){
      requireValue(settled.network===NETWORK&&(!settled.payer||settled.payer.toLowerCase()===intent.payer_address),'FACILITATOR_SETTLEMENT_MISMATCH');
      tx=settled.transaction.toLowerCase();
      await rpc(this.pool,'x402_note_tx',[intent.request_id,token,tx]);
    }
    // A 'settlement_pending' response with a hash is reconciled on-chain too.
    requireValue(tx,'PAYMENT_SETTLEMENT_UNCERTAIN',503);
  }
  requireValue(tx,'PAYMENT_SETTLEMENT_PENDING',503);
  if(!intent.tx_hash)await rpc(this.pool,'x402_note_tx',[intent.request_id,token,tx]);
  const logIndex=await this.base.confirm(tx,intent);
  return rpc(this.pool,'x402_confirm',[intent.request_id,token,tx,logIndex]);
 }
 async reconcile(limit=100){
  const {rows}=await this.pool.query('SELECT geomacro.x402_pending($1) AS result',[limit]);
  const outcomes=[];
  for(const {result:intent} of rows){try{
    // Recovery only observes/submits no NEW payment; if no transaction can be
    // proven, retain the signed result and authorization for an explicit retry.
    const settled=await this.settleIntent(intent,{allowSubmit:false});outcomes.push({request_id:intent.request_id,state:settled.state});
  }catch(error){outcomes.push({request_id:intent.request_id,state:'pending',code:error.code??'RECONCILIATION_ERROR'});}}
  return outcomes;
 }
}
