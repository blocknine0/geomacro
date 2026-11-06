import {randomUUID,sign} from 'node:crypto';
import {canonicalize,hash,verifyReceipt} from './metering.mjs';
import {PaymentError,requireValue} from './payments/common.mjs';
import {subjectTarget,parseRiskRequest,safeRiskFields,TIER_ORDER} from './risk-contract.mjs';
import {provisionAccount,createApiKey} from './accounts.mjs';
const json=(body,status=200,headers={})=>Response.json({...body,execution_authorized:false},
 {status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store',
 'Vary':'Authorization, PAYMENT-SIGNATURE','X-Content-Type-Options':'nosniff',...headers}});
async function readBody(request){
 const reader=request.body?.getReader();requireValue(reader,'JSON_BODY_REQUIRED',400);
 const chunks=[];let length=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;length+=value.length;
  requireValue(length<=65536,'BODY_TOO_LARGE',413);chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new PaymentError('INVALID_JSON',400);}
 requireValue(b&&typeof b==='object'&&!Array.isArray(b),'INVALID_JSON',400);return b;
}
export function signedCreditResponse(result,publicKeys,headers={}){
 requireValue(verifyReceipt(result.canonical_payload,result.audit_receipt,publicKeys[result.audit_receipt.public_key_id]),
  'STORED_SIGNATURE_VERIFICATION_FAILED');
 const payload=JSON.parse(result.canonical_payload);
 return json({...payload,audit_receipt:result.audit_receipt},200,{...headers,'Idempotency-Replayed':String(result.replay===true)});
}
/** No cross-request transactions. settle_success itself is one atomic database
 * transaction, rechecking the locked balance, tier and request fingerprint. */
export async function creditRiskGate({pool,input,apiKey,resolveRisk,privateKey,publicKeyId,publicKeys,signal}){
 requireValue(/^gm_live_[A-Za-z0-9_-]{43}$/.test(apiKey),'API_KEY_REQUIRED',401);
 const keyHash=hash(apiKey),requestHash=hash(canonicalize({method:'POST',path:'/v1/risk-gate',subject:input.subject,tier:input.tier}));
 const authorization=await pool.call('authorize_credit_key',[keyHash]);
 const headers={'X-RateLimit-Limit':String(authorization.rate_limit),'X-RateLimit-Remaining':String(authorization.remaining),
  'X-RateLimit-Reset':authorization.reset_at};
 const replay=await pool.call('credit_replay',[keyHash,input.request_id,requestHash,input.subject,input.tier]);
 if(replay)return signedCreditResponse(replay,publicKeys,headers);
 const result=await resolveRisk({subject:input.subject,tier:input.tier,signal});
 const quote=await pool.call('prepare',[keyHash,input.request_id,requestHash,input.subject,input.tier,result.availableTiers]);
 if(quote.replay)return signedCreditResponse(quote,publicKeys,headers);
 const risk=result.riskByTier[quote.billed_tier];const fields=safeRiskFields(risk),units=Number(quote.credit_units);
 requireValue(Number.isSafeInteger(units),'UNSAFE_CREDIT_AMOUNT');
 const payload={request_id:input.request_id,subject:input.subject,requested_tier:input.tier,...fields,
  billed_tier:quote.billed_tier,credits_deducted:units/1_000_000,execution_authorized:false,
  generated_at:new Date().toISOString(),public_key_id:publicKeyId};
 const canonical=canonicalize(payload),signature=sign(null,Buffer.from(canonical),privateKey).toString('base64');
 const receipt={signature,public_key_id:publicKeyId,timestamp:payload.generated_at,hash:hash(canonical)};
 requireValue(verifyReceipt(canonical,receipt,publicKeys[publicKeyId]),'SIGNATURE_VERIFICATION_FAILED');
 // Serialize the final successful body before the only financial mutation.
 JSON.stringify({...payload,audit_receipt:receipt});signal?.throwIfAborted();
 let settled;
 try{settled=await pool.call('settle_success',[quote.user_id,quote.api_key_id,input.request_id,requestHash,input.subject,
  input.tier,result.availableTiers,canonical,signature,publicKeyId]);}
 catch(error){
  if(error.code==='COMMERCIAL_LEDGER_UNAVAILABLE')throw new PaymentError('SETTLEMENT_OUTCOME_UNKNOWN_RETRY_SAME_ID');
  throw error;
 }
 return signedCreditResponse(settled,publicKeys,headers);
}
export function createRiskApi(runtime,env){
 return async request=>{
  const url=new URL(request.url),path=url.pathname,start=performance.now();let requestId=null;
  if(path!=='/v1/risk-gate'&&!/^\/v1\/api-keys(?:\/[a-f0-9-]{36}\/revoke)?$/.test(path))return null;
  try{
   const origin=request.headers.get('Origin');
   if(origin)requireValue([env.SITE_ORIGIN,env.PUBLIC_API_ORIGIN].includes(origin),'ORIGIN_NOT_ALLOWED',403);
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin??env.SITE_ORIGIN,'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':'Authorization, Content-Type, Idempotency-Key, PAYMENT-SIGNATURE',
    'Access-Control-Expose-Headers':'PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-RateLimit-Remaining',
    'Access-Control-Max-Age':'600','Vary':'Origin'}});
   requireValue(!url.search,'QUERY_PARAMETERS_NOT_SUPPORTED',400);
   requireValue(runtime.pool&&runtime.privateKey&&runtime.publicKey,'COMMERCIAL_API_NOT_CONFIGURED');
   if(path.startsWith('/v1/api-keys')){
    requireValue(['GET','POST'].includes(request.method),'METHOD_NOT_ALLOWED',405);
    const user=await runtime.authenticate(request);
    if(request.method==='GET'){requireValue(path==='/v1/api-keys','METHOD_NOT_ALLOWED',405);return json({keys:await runtime.pool.call('list_api_keys',[user.id])});}
    requireValue(request.headers.get('Content-Type')?.split(';')[0].trim()==='application/json','JSON_CONTENT_TYPE_REQUIRED',415);
    if(path.endsWith('/revoke')){
     await runtime.pool.call('revoke_api_key',[user.id,path.split('/')[3]]);return json({revoked:true});
    }
    const body=await readBody(request);
    requireValue(Object.keys(body).every(k=>k==='label')&&typeof body.label==='string'&&body.label.length>0&&body.label.length<=100,'INVALID_KEY_LABEL',400);
    await provisionAccount(runtime.pool,user);return json(await createApiKey(runtime.pool,user.id,body.label),201);
   }
   requireValue(request.method==='POST','METHOD_NOT_ALLOWED',405);
   requireValue(request.headers.get('Content-Type')?.split(';')[0].trim()==='application/json','JSON_CONTENT_TYPE_REQUIRED',415);
   const raw=await readBody(request);requestId=request.headers.get('Idempotency-Key')??raw.request_id??randomUUID();
   const input=parseRiskRequest(raw,requestId);subjectTarget(input.subject);
   requireValue(runtime.launched,'COMMERCIAL_LAUNCH_FROZEN_OR_NOT_AUTHORIZED',423);
   const auth=request.headers.get('Authorization'),payment=request.headers.get('PAYMENT-SIGNATURE');
   const disabled=new Set(String(env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS??'').split(',').map(x=>x.trim().toLowerCase()));
   if(auth)requireValue(!disabled.has('credits')&&!disabled.has('prepaid'),'CREDIT_RAIL_QUARANTINED',423);
   requireValue(!(auth&&payment),'AMBIGUOUS_PAYMENT_RAIL',400);
   let result;
   if(auth){const match=auth.match(/^Bearer (gm_live_[A-Za-z0-9_-]{43})$/);requireValue(match,'API_KEY_REQUIRED',401);
    result=await creditRiskGate({pool:runtime.pool,input,apiKey:match[1],resolveRisk:runtime.resolveRisk,
     privateKey:runtime.privateKey,publicKeyId:runtime.publicKeyId,publicKeys:runtime.publicKeys,signal:request.signal});
   }else{
    requireValue(runtime.x402,'X402_NOT_ACTIVATED');
    result=await runtime.x402.handle(input,payment,{signal:request.signal});
   }
   const headers=new Headers(result.headers);headers.set('Server-Timing',`total;dur=${(performance.now()-start).toFixed(1)}`);
   if(origin)headers.set('Access-Control-Allow-Origin',origin);
   return new Response(result.body,{status:result.status,headers});
  }catch(error){
   const code=error instanceof PaymentError?error.code:error.name==='AbortError'?'REQUEST_ABORTED':'RISK_GATE_UNAVAILABLE';
   const status=error instanceof PaymentError?error.status:503;
   return json({error:code,request_id:requestId,
    ...(code==='SETTLEMENT_OUTCOME_UNKNOWN_RETRY_SAME_ID'?{settlement_status:'UNKNOWN_RETRY_SAME_REQUEST_ID'}:{})},status,
    code==='RATE_LIMIT_EXCEEDED'?{'Retry-After':'60'}:{});
  }
 };
}
