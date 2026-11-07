import openapi from '../openapi.json' with {type:'json'};
import {canonicalize,hash} from './metering.mjs';
import {safeRiskFields} from './risk-contract.mjs';
import {createRiskApi} from './risk-api.mjs';
import {createQualifiedRiskResolver} from './qualified-risk.mjs';
import {createPrivateKey,createPublicKey,sign,verify,timingSafeEqual} from 'node:crypto';
import {SupabaseRpcPool} from './payments/rpc-http.mjs';
import {PayPalClient} from './payments/paypal-client.mjs';
import {PayPalEngine} from './payments/paypal.mjs';
import {loadCatalog} from './payments/catalog.mjs';
import {BaseVerifier} from './payments/base.mjs';
import {createCommercialFacilitator} from './payments/xpay.mjs';
import {X402Engine} from './payments/x402.mjs';
import {createPaymentHandler,supabaseAuthenticator} from './payments/http.mjs';
import {PaymentError} from './payments/common.mjs';
const cache=new WeakMap();
const response=(data,status=200)=>Response.json({...data,execution_authorized:false},
 {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function buildWorkerRuntime(env){
 const blockers=[],url=env.COMMERCIAL_SUPABASE_URL,key=env.COMMERCIAL_SUPABASE_KEY;
 const pool=url&&key?new SupabaseRpcPool({url,key}):null;
 if(!pool)blockers.push('COMMERCIAL_LEDGER_NOT_CONFIGURED');
 let privateKey,publicKey,publicKeyId=env.COMMERCIAL_SIGNING_KEY_ID;
 try{
  privateKey=createPrivateKey({key:Buffer.from(env.COMMERCIAL_SIGNING_PRIVATE_PKCS8_B64??'','base64'),format:'der',type:'pkcs8'});
  publicKey=createPublicKey({key:Buffer.from(env.COMMERCIAL_SIGNING_PUBLIC_SPKI_B64??'','base64'),format:'der',type:'spki'});
  if(privateKey.asymmetricKeyType!=='ed25519'||!publicKeyId||!verify(null,Buffer.from('geomacro-config-probe'),publicKey,sign(null,Buffer.from('geomacro-config-probe'),privateKey)))throw Error();
 }catch{privateKey=undefined;publicKey=undefined;blockers.push('COMMERCIAL_SIGNER_NOT_CONFIGURED');}
 const launched=env.GEOMACRO_COMMERCIAL_LAUNCH_ACK==='I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH'&&
  !['true','1','yes','on'].includes(String(env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE??'').trim().toLowerCase());
 const disabled=new Set(String(env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS??'').split(',').map(x=>x.trim().toLowerCase()));
 const fundsAccepted=env.GEOMACRO_REAL_FUNDS_SECURITY_ACK==='I_ACCEPT_REAL_FUNDS_SECURITY_GATES';
 const resolveRisk=createQualifiedRiskResolver({origin:env.RISK_EVIDENCE_ORIGIN??'https://geomacro-control-plane.daspallab202391.workers.dev',token:env.RISK_GATE_TIERED_TOKEN});
 let paypal,x402;
 if(env.PAYPAL_ENABLED==='true'&&launched&&!disabled.has('paypal')&&pool&&(env.PAYPAL_MODE!=='live'||fundsAccepted&&env.GEOMACRO_PAYPAL_KYC_RECEIVE_ACK==='VERIFIED_LIVE_CROSS_BORDER_MERCHANT')){try{
  paypal=new PayPalEngine({pool,client:new PayPalClient({mode:env.PAYPAL_MODE,clientId:env.PAYPAL_CLIENT_ID,
   clientSecret:env.PAYPAL_CLIENT_SECRET,webhookId:env.PAYPAL_WEBHOOK_ID}),
   catalog:loadCatalog(env.PAYPAL_CATALOG_JSON),merchantId:env.PAYPAL_MERCHANT_ID,siteOrigin:env.SITE_ORIGIN});
 }catch{blockers.push('PAYPAL_CONFIGURATION_INCOMPLETE');}}
 else blockers.push('PAYPAL_NOT_ACTIVATED');
 if(env.X402_ENABLED==='true'&&launched&&fundsAccepted&&!disabled.has('x402')&&!disabled.has('coinbase_x402')&&pool&&privateKey&&publicKey){try{
  x402=new X402Engine({pool,payee:env.X402_PAYEE_ADDRESS,siteOrigin:env.PUBLIC_API_ORIGIN??env.SITE_ORIGIN,
   base:new BaseVerifier({rpcUrl:env.BASE_RPC_URL}),facilitator:createCommercialFacilitator({url:env.X402_FACILITATOR_URL,
    headers:JSON.parse(env.X402_FACILITATOR_HEADERS_JSON??'{}')}),privateKey,publicKeyId,publicKeys:{[publicKeyId]:publicKey},
   resolveRisk});
 }catch{blockers.push('X402_CONFIGURATION_INCOMPLETE');}}
 else blockers.push('X402_NOT_ACTIVATED');
 const authenticate=pool?supabaseAuthenticator({url,publishableKey:key}):async()=>{throw new PaymentError('AUTH_NOT_CONFIGURED');};
 const handle=createPaymentHandler({paypal,x402,pool,authenticate,siteOrigin:env.SITE_ORIGIN});
 const runtime={pool,privateKey,publicKey,publicKeyId,publicKeys:{...(publicKey?{[publicKeyId]:publicKey}:{})},
   paypal,x402,handle,authenticate,resolveRisk,blockers,launched};
 if(env.COMMERCIAL_VERIFY_KEYS_JSON){
  try{for(const [id,key]of Object.entries(JSON.parse(env.COMMERCIAL_VERIFY_KEYS_JSON))){
   if(!/^[A-Za-z0-9._:-]{1,120}$/.test(id))throw Error();
   const parsed=createPublicKey({key:Buffer.from(key,'base64'),format:'der',type:'spki'});
   if(parsed.asymmetricKeyType!=='ed25519'||id===publicKeyId)throw Error();runtime.publicKeys[id]=parsed;
  }}catch{throw new PaymentError('VERIFY_KEY_REGISTRY_INVALID');}
 }
 if(x402)x402.publicKeys=runtime.publicKeys;
 runtime.riskApi=createRiskApi(runtime,env);return runtime;
}
export default {
 async fetch(request,env){
  let runtime=cache.get(env);if(!runtime){runtime=buildWorkerRuntime(env);cache.set(env,runtime);}
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/v1/commercial/openapi.json')return Response.json({...openapi,servers:[{url:env.PUBLIC_API_ORIGIN??new URL(request.url).origin}]},{headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  if(request.method==='GET'&&['/health','/v1/commercial/health'].includes(url.pathname))return response({ok:true,schema:'geomacro.commercial-api.v1',
   deployed_sha:env.DEPLOYED_SHA??null,paypal_configured:!!runtime.paypal,x402_configured:!!runtime.x402,
   polygon_x402_configured:false,ledger_configured:!!runtime.pool,signer_configured:!!runtime.publicKey,blockers:runtime.blockers});
  if(request.method==='GET'&&['/v1/readiness','/v1/commercial/readiness'].includes(url.pathname)){
   let ledger=false,ledgerError=null;try{ledger=(await runtime.pool?.call('health'))?.ready===true;}catch(e){ledgerError=e.code??'LEDGER_READ_FAILED';}
   return response({ok:ledger,ledger_verified:ledger,ledger_error:ledgerError,blockers:runtime.blockers},ledger?200:503);
  }
  if(request.method==='GET'&&['/.well-known/jwks.json','/v1/commercial/keys'].includes(url.pathname)){
   if(!runtime.publicKey)return response({error:'SIGNER_UNAVAILABLE'},503);
   return response({keys:Object.entries(runtime.publicKeys).map(([kid,key])=>({...key.export({format:'jwk'}),kid,alg:'EdDSA',use:'sig'}))});
  }
  if(request.method==='POST'&&url.pathname==='/v1/internal/commercial-acceptance'){
   const token=String(env.COMMERCIAL_ACCEPTANCE_TOKEN??''),supplied=request.headers.get('Authorization')?.replace(/^Bearer /,'')??'';
   if(!/^[a-f0-9]{64}$/.test(token)||supplied.length!==token.length||!timingSafeEqual(Buffer.from(token),Buffer.from(supplied)))
    return response({error:'UNAUTHORIZED'},401);
   try{
    if(!runtime.privateKey||!runtime.publicKey)throw new PaymentError('SIGNER_UNAVAILABLE');
    const result=await runtime.resolveRisk({subject:'USA',tier:'basic',signal:request.signal});
    const risk=result.riskByTier.basic;
    const payload={schema:'geomacro.commercial-risk-no-funds-proof.v1',subject:'USA',tier:'basic',
     ...safeRiskFields(risk),credits_deducted:0,payment_attempted:false,execution_authorized:false,
     generated_at:new Date().toISOString(),public_key_id:runtime.publicKeyId};
    const canonical=canonicalize(payload),signature=sign(null,Buffer.from(canonical),runtime.privateKey).toString('base64');
    return response({...payload,audit_receipt:{signature,public_key_id:runtime.publicKeyId,
     timestamp:payload.generated_at,hash:hash(canonical)}});
   }catch(error){return response({error:error instanceof PaymentError?error.code:'QUALIFIED_EVIDENCE_UNAVAILABLE',
    payment_attempted:false,credits_deducted:0},503);}
  }
  const result=await runtime.riskApi(request)??await runtime.handle(request);const body=await result.json();
  return new Response(JSON.stringify({...body,execution_authorized:false}),{status:result.status,headers:result.headers});
 },
 async scheduled(_event,env,ctx){const runtime=cache.get(env)??buildWorkerRuntime(env);
  if(runtime.pool)ctx.waitUntil(runtime.pool.call('prune_rate_windows').catch(()=>{}));
  if(runtime.x402)ctx.waitUntil(runtime.x402.reconcile());},
};
