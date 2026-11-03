/**
 * Signed PayPal refund/reversal -> durable D1 entitlement revocation.
 * Public browser data cannot trigger this code. A separately verified PayPal
 * webhook must be HMAC-attested by the trusted SSR receiver first.
 * Reversals remain allowed during the master commerce emergency freeze:
 * they only remove entitlement and NEVER create new funds or payments.
 */
import {CustomerFundingError} from './customer-paypal-funding.mjs';
const ENC=new TextEncoder();
const CAPTURE=/^[A-Z0-9]{8,32}$/;
const MERCHANT=/^[A-Z0-9]{8,32}$/;
const EVENT=/^[A-Za-z0-9_.-]{8,128}$/;
const HEX=/^[0-9a-f]{64}$/;
const EVENTS=new Set(['PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED']);
const fail=(status,code)=>{throw new CustomerFundingError(status,code);};
const hex=s=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
export async function revokeCustomerPayPalGrantFromVerifiedWebhook(db,env,receipt,now=new Date().toISOString()){
 const {eventId,eventType,captureId,merchantId,transmittedAt,webhookSha256,attestation}=receipt||{};
 if(!EVENTS.has(eventType)||!EVENT.test(String(eventId))||
   !CAPTURE.test(String(captureId))||!MERCHANT.test(String(merchantId))||
   !HEX.test(String(webhookSha256))||!HEX.test(String(attestation))||
   merchantId!==env.GEOMACRO_PAYPAL_MERCHANT_ID||
   String(env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY??'').length<64)
   fail(403,'CUSTOMER_PAYPAL_REFUND_PROOF_DENIED');
 const current=Date.parse(now),transmitted=Date.parse(transmittedAt);
 if(!Number.isFinite(current)||!Number.isFinite(transmitted)||
     Math.abs(current-transmitted)>10*60000)
   fail(403,'CUSTOMER_PAYPAL_REFUND_EVENT_STALE');
 const msg=['geomacro.paypal-refund.v1',eventId,eventType,captureId,
   merchantId,transmittedAt,webhookSha256].join('\0');
 const key=await crypto.subtle.importKey('raw',
   ENC.encode(env.GEOMACRO_PAYPAL_FUNDING_ATTESTATION_KEY),
   {name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!(await crypto.subtle.verify('HMAC',key,hex(attestation),ENC.encode(msg))))
   fail(403,'CUSTOMER_PAYPAL_REFUND_ATTESTATION_INVALID');
 const row=await db.prepare(`SELECT r.receipt_id,r.user_id,
   f.delta_credits AS funded_credits
   FROM customer_payment_receipts r
   JOIN credit_ledger f ON f.receipt_id=r.receipt_id AND f.event_type='funding'
   WHERE r.provider='paypal' AND r.environment='live' AND r.provider_event_id=?`)
   .bind(captureId).first();
 if(!row||!Number.isSafeInteger(row.funded_credits)||row.funded_credits<=0)
   fail(404,'CUSTOMER_PAYPAL_CAPTURE_NOT_FUNDED');
 const prior=await db.prepare(`SELECT event_id FROM credit_ledger
   WHERE receipt_id=? AND event_type='reversal'`).bind(row.receipt_id).first();
 const allRevoked=async()=>{
   const grants=await db.prepare(`SELECT COUNT(*) n FROM customer_entitlement_grants
     WHERE receipt_id=? AND status='active'`).bind(row.receipt_id).first();
   return Number(grants?.n)===0;
 };
 if(prior){
   if(!(await allRevoked()))fail(503,'CUSTOMER_PAYPAL_REVERSAL_RECONCILIATION_REQUIRED');
   return {ok:true,reversed:true,idempotent_replay:true,receipt_id:row.receipt_id};
 }
 if(typeof db.batch!=='function')fail(503,'CUSTOMER_PAYPAL_REVERSAL_TRANSACTION_REQUIRED');
 try{
   await db.batch([
     db.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,
       delta_credits,receipt_id,occurred_at) VALUES(?,?,'reversal',?,?,?)`)
       .bind('rev_paypal_'+captureId,row.user_id,-row.funded_credits,row.receipt_id,now),
     db.prepare(`UPDATE customer_entitlement_grants SET status='revoked'
       WHERE receipt_id=? AND user_id=? AND status='active'`)
       .bind(row.receipt_id,row.user_id),
   ]);
 }catch{
   const after=await db.prepare(`SELECT event_id FROM credit_ledger
      WHERE receipt_id=? AND event_type='reversal'`).bind(row.receipt_id).first();
   if(after&&await allRevoked())
     return {ok:true,reversed:true,idempotent_replay:true,receipt_id:row.receipt_id};
   fail(503,'CUSTOMER_PAYPAL_REVERSAL_READBACK_UNAVAILABLE');
 }
 const after=await db.prepare(`SELECT event_id,delta_credits FROM credit_ledger
     WHERE receipt_id=? AND event_type='reversal'`).bind(row.receipt_id).first();
 if(!after||after.delta_credits!==-row.funded_credits||!(await allRevoked()))
   fail(503,'CUSTOMER_PAYPAL_REVERSAL_READBACK_UNAVAILABLE');
 return {ok:true,reversed:true,idempotent_replay:false,receipt_id:row.receipt_id};
}

const WEBHOOK_HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(payload,status=200)=>Response.json(payload,{status,headers:WEBHOOK_HEADERS});
async function compareBearer(token,supplied){
 if(typeof supplied!=='string'||!supplied.startsWith('Bearer '))return false;
 const incoming=supplied.slice(7);
 if(incoming.length!==token.length)return false;
 const key=await crypto.subtle.importKey('raw',ENC.encode(token),
   {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const [a,b]=await Promise.all([
   crypto.subtle.sign('HMAC',key,ENC.encode(token)),
   crypto.subtle.sign('HMAC',key,ENC.encode(incoming)),
 ]);
 const aa=new Uint8Array(a),bb=new Uint8Array(b);
 let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
 return diff===0;
}
export async function handleCustomerPayPalRefundRuntime(request,env){
 try{
  if(request.method!=='POST'||new URL(request.url).search)
    fail(405,'CUSTOMER_PAYPAL_REFUND_METHOD_DENIED');
  if(!env.DB?.batch||String(env.GEOMACRO_CUSTOMER_SSR_TOKEN??'').length<64)
    fail(503,'CUSTOMER_PAYPAL_REFUND_BACKEND_MISSING');
  if(!(await compareBearer(env.GEOMACRO_CUSTOMER_SSR_TOKEN,
    request.headers.get('authorization'))))
    fail(401,'CUSTOMER_PAYPAL_REFUND_AUTH_DENIED');
  const allowed=String(env.GEOMACRO_CUSTOMER_ALLOWED_ORIGINS??'')
    .split(',').map(x=>x.trim()).filter(Boolean);
  if(!allowed.includes(request.headers.get('origin')))
    fail(403,'CUSTOMER_PAYPAL_REFUND_ORIGIN_DENIED');
  if(!request.headers.get('content-type')?.startsWith('application/json'))
    fail(415,'CUSTOMER_PAYPAL_REFUND_JSON_REQUIRED');
  const declared=Number(request.headers.get('content-length')??0);
  if(!Number.isFinite(declared)||declared>2048)
    fail(413,'CUSTOMER_PAYPAL_REFUND_BODY_TOO_LARGE');
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;if(size>2048){
      void reader.cancel().catch(()=>undefined);
      fail(413,'CUSTOMER_PAYPAL_REFUND_BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const all=new Uint8Array(size);let off=0;
  for(const chunk of chunks){all.set(chunk,off);off+=chunk.byteLength;}
  let payload;try{payload=JSON.parse(new TextDecoder().decode(all));}
  catch{fail(400,'CUSTOMER_PAYPAL_REFUND_JSON_REQUIRED');}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     Object.keys(payload).some(k=>!['eventId','eventType','captureId',
       'merchantId','transmittedAt','webhookSha256','attestation'].includes(k)))
    fail(400,'CUSTOMER_PAYPAL_REFUND_FIELDS_INVALID');
  return reply(await revokeCustomerPayPalGrantFromVerifiedWebhook(env.DB,env,payload));
 }catch(error){
  const status=error instanceof CustomerFundingError?error.status:503;
  const code=error instanceof CustomerFundingError?error.code:'CUSTOMER_PAYPAL_REFUND_UNAVAILABLE';
  return reply({ok:false,code},status);
 }
}
