import { readFileSync } from 'node:fs';
import { createPrivateKey,createPublicKey } from 'node:crypto';
import { loadCatalog } from './catalog.mjs';
import { PayPalClient } from './paypal-client.mjs';
import { PayPalEngine } from './paypal.mjs';
import { BaseVerifier,Facilitator } from './base.mjs';
import { X402Engine } from './x402.mjs';
import { supabaseAuthenticator,createPaymentHandler } from './http.mjs';
import { requireValue,PaymentError } from './common.mjs';
export function configurePayments(pool,env=process.env,{resolveRisk}={}){
 const siteOrigin=requireValue(env.SITE_ORIGIN,'SITE_ORIGIN_REQUIRED',500);
 requireValue(new URL(siteOrigin).protocol==='https:'&&new URL(siteOrigin).origin===siteOrigin,'HTTPS_SITE_ORIGIN_REQUIRED',500);
 let paypal,x402,authenticate=async()=>{throw new PaymentError('AUTH_NOT_CONFIGURED');};
 if(env.PAYPAL_ENABLED==='true'){
  const client=new PayPalClient({mode:env.PAYPAL_MODE,clientId:env.PAYPAL_CLIENT_ID,clientSecret:env.PAYPAL_CLIENT_SECRET,webhookId:env.PAYPAL_WEBHOOK_ID});
  paypal=new PayPalEngine({pool,client,catalog:loadCatalog(env.PAYPAL_CATALOG_JSON),merchantId:env.PAYPAL_MERCHANT_ID,siteOrigin});
  authenticate=supabaseAuthenticator({url:requireValue(env.SUPABASE_URL,'SUPABASE_URL_REQUIRED',500),
    publishableKey:requireValue(env.SUPABASE_PUBLISHABLE_KEY,'SUPABASE_PUBLISHABLE_KEY_REQUIRED',500)});
 }
 if(env.X402_ENABLED==='true'){
  const privateKey=createPrivateKey(readFileSync(requireValue(env.SIGNING_PRIVATE_KEY_FILE,'SIGNING_KEY_FILE_REQUIRED',500)));
  const files=JSON.parse(requireValue(env.SIGNING_PUBLIC_KEYS_JSON,'PUBLIC_KEYS_REQUIRED',500)),publicKeys={};
  for(const [keyId,file]of Object.entries(files))publicKeys[keyId]=createPublicKey(readFileSync(file));
  const verifier=new BaseVerifier({rpcUrl:env.BASE_RPC_URL,confirmations:Number(env.BASE_CONFIRMATIONS??2)});
  const facilitator=new Facilitator({url:requireValue(env.X402_FACILITATOR_URL,'FACILITATOR_URL_REQUIRED',500),
    headers:JSON.parse(env.X402_FACILITATOR_HEADERS_JSON??'{}')});
  x402=new X402Engine({pool,payee:env.X402_PAYEE_ADDRESS,siteOrigin,base:verifier,facilitator,privateKey,
    publicKeyId:env.SIGNING_PUBLIC_KEY_ID,publicKeys,resolveRisk:resolveRisk??(async()=>{throw new PaymentError('QUALIFIED_RISK_RESOLVER_NOT_CONFIGURED');})});
 }
 const handle=createPaymentHandler({paypal,x402,pool,authenticate,siteOrigin,
  onError:value=>console.error(JSON.stringify(value))});
 return {paypal,x402,handle};
}
