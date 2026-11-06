import {createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {SupabaseRpcPool} from './payments/rpc-http.mjs';
import {PayPalClient} from './payments/paypal-client.mjs';
import {PayPalEngine} from './payments/paypal.mjs';
import {loadCatalog} from './payments/catalog.mjs';
import {BaseVerifier,Facilitator} from './payments/base.mjs';
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
 }catch{blockers.push('COMMERCIAL_SIGNER_NOT_CONFIGURED');}
 const launched=env.GEOMACRO_COMMERCIAL_LAUNCH_ACK==='I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH'&&
  !['true','1','yes','on'].includes(String(env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE??'').trim().toLowerCase());
 const disabled=new Set(String(env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS??'').split(',').map(x=>x.trim().toLowerCase()));
 const fundsAccepted=env.GEOMACRO_REAL_FUNDS_SECURITY_ACK==='I_ACCEPT_REAL_FUNDS_SECURITY_GATES';
 let paypal,x402;
 if(env.PAYPAL_ENABLED==='true'&&launched&&!disabled.has('paypal')&&pool&&(env.PAYPAL_MODE!=='live'||fundsAccepted&&env.GEOMACRO_PAYPAL_KYC_RECEIVE_ACK==='VERIFIED_LIVE_CROSS_BORDER_MERCHANT')){try{
  paypal=new PayPalEngine({pool,client:new PayPalClient({mode:env.PAYPAL_MODE,clientId:env.PAYPAL_CLIENT_ID,
   clientSecret:env.PAYPAL_CLIENT_SECRET,webhookId:env.PAYPAL_WEBHOOK_ID}),
   catalog:loadCatalog(env.PAYPAL_CATALOG_JSON),merchantId:env.PAYPAL_MERCHANT_ID,siteOrigin:env.SITE_ORIGIN});
 }catch{blockers.push('PAYPAL_CONFIGURATION_INCOMPLETE');}}
 else blockers.push('PAYPAL_NOT_ACTIVATED');
 if(env.X402_ENABLED==='true'&&launched&&fundsAccepted&&!disabled.has('x402')&&!disabled.has('coinbase_x402')&&pool&&privateKey&&publicKey){try{
  x402=new X402Engine({pool,payee:env.X402_PAYEE_ADDRESS,siteOrigin:env.SITE_ORIGIN,
   base:new BaseVerifier({rpcUrl:env.BASE_RPC_URL}),facilitator:new Facilitator({url:env.X402_FACILITATOR_URL,
    headers:JSON.parse(env.X402_FACILITATOR_HEADERS_JSON??'{}')}),privateKey,publicKeyId,publicKeys:{[publicKeyId]:publicKey},
   resolveRisk:async()=>{throw new PaymentError('QUALIFIED_RISK_RESOLVER_NOT_CONFIGURED');}});
 }catch{blockers.push('X402_CONFIGURATION_INCOMPLETE');}}
 else blockers.push('X402_NOT_ACTIVATED');
 const authenticate=pool?supabaseAuthenticator({url,publishableKey:key}):async()=>{throw new PaymentError('AUTH_NOT_CONFIGURED');};
 const handle=createPaymentHandler({paypal,x402,pool,authenticate,siteOrigin:env.SITE_ORIGIN});
 return {pool,privateKey,publicKey,publicKeyId,paypal,x402,handle,blockers,launched};
}
export default {
 async fetch(request,env){
  let runtime=cache.get(env);if(!runtime){runtime=buildWorkerRuntime(env);cache.set(env,runtime);}
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return response({ok:true,schema:'geomacro.commercial-api.v1',
   deployed_sha:env.DEPLOYED_SHA??null,paypal_configured:!!runtime.paypal,x402_configured:!!runtime.x402,
   ledger_configured:!!runtime.pool,signer_configured:!!runtime.publicKey,blockers:runtime.blockers});
  if(request.method==='GET'&&url.pathname==='/v1/readiness'){
   let ledger=false,ledgerError=null;try{ledger=(await runtime.pool?.call('health'))?.ready===true;}catch(e){ledgerError=e.code??'LEDGER_READ_FAILED';}
   return response({ok:ledger,ledger_verified:ledger,ledger_error:ledgerError,blockers:runtime.blockers},ledger?200:503);
  }
  if(request.method==='GET'&&url.pathname==='/.well-known/jwks.json'){
   if(!runtime.publicKey)return response({error:'SIGNER_UNAVAILABLE'},503);
   return response({keys:[{...runtime.publicKey.export({format:'jwk'}),kid:runtime.publicKeyId,alg:'EdDSA',use:'sig'}]});
  }
  const result=await runtime.handle(request);const body=await result.json();
  return new Response(JSON.stringify({...body,execution_authorized:false}),{status:result.status,headers:result.headers});
 },
 async scheduled(_event,env,ctx){const runtime=cache.get(env)??buildWorkerRuntime(env);
  if(runtime.x402)ctx.waitUntil(runtime.x402.reconcile());},
};
