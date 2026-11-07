import { readFileSync } from 'node:fs';
import { createPrivateKey,createPublicKey } from 'node:crypto';
import { loadCatalog } from './catalog.mjs';
import { PayPalClient } from './paypal-client.mjs';
import { PayPalEngine } from './paypal.mjs';
import { BaseVerifier } from './base.mjs';
import { createCommercialFacilitator } from './xpay.mjs';
import { X402Engine } from './x402.mjs';
import {PolygonVerifier,DEXTER_URL,DexterPolygonFacilitator} from './polygon.mjs';
import {PolygonX402Engine,MultiChainX402Router} from './multichain.mjs';
import { supabaseAuthenticator,createPaymentHandler } from './http.mjs';
import { requireValue,PaymentError } from './common.mjs';
export function configurePayments(pool,env=process.env,{resolveRisk}={}){
 const siteOrigin=requireValue(env.SITE_ORIGIN,'SITE_ORIGIN_REQUIRED',500);
 requireValue(new URL(siteOrigin).protocol==='https:'&&new URL(siteOrigin).origin===siteOrigin,'HTTPS_SITE_ORIGIN_REQUIRED',500);
 // Same explicit non-commercial security boundary as the Cloudflare deployer.
 // A future owner-authorized real-money release must change this reviewed gate.
 const commercialNoFundsOnly=true;
 const launched=env.GEOMACRO_COMMERCIAL_LAUNCH_ACK==='I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH'&&
  env.GEOMACRO_REAL_FUNDS_SECURITY_ACK==='I_ACCEPT_REAL_FUNDS_SECURITY_GATES'&&
  !['true','yes','on','1'].includes(String(env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE??'').toLowerCase());
 const disabled=new Set(String(env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS??'')
  .split(',').map(x=>x.trim().toLowerCase()));
 const allowFunds=!commercialNoFundsOnly&&launched;
 let paypal,x402,baseRail,polygonRail,authenticate=async()=>{throw new PaymentError('AUTH_NOT_CONFIGURED');};
 if(allowFunds&&env.PAYPAL_ENABLED==='true'&&!disabled.has('paypal')){
  const client=new PayPalClient({mode:env.PAYPAL_MODE,clientId:env.PAYPAL_CLIENT_ID,
   clientSecret:env.PAYPAL_CLIENT_SECRET,webhookId:env.PAYPAL_WEBHOOK_ID});
  paypal=new PayPalEngine({pool,client,catalog:loadCatalog(env.PAYPAL_CATALOG_JSON),
   merchantId:env.PAYPAL_MERCHANT_ID,siteOrigin});
  authenticate=supabaseAuthenticator({url:requireValue(env.SUPABASE_URL,'SUPABASE_URL_REQUIRED',500),
   publishableKey:requireValue(env.SUPABASE_PUBLISHABLE_KEY,'SUPABASE_PUBLISHABLE_KEY_REQUIRED',500)});
 }
 if(allowFunds&&!disabled.has('x402')&&!disabled.has('coinbase_x402')&&
    (env.X402_ENABLED==='true'||env.POLYGON_X402_ENABLED==='true')){
  const privateKey=createPrivateKey(readFileSync(requireValue(env.SIGNING_PRIVATE_KEY_FILE,
   'SIGNING_KEY_FILE_REQUIRED',500)));
  const files=JSON.parse(requireValue(env.SIGNING_PUBLIC_KEYS_JSON,'PUBLIC_KEYS_REQUIRED',500)),publicKeys={};
  for(const [keyId,file]of Object.entries(files))publicKeys[keyId]=createPublicKey(readFileSync(file));
  const context={pool,payee:env.X402_PAYEE_ADDRESS,siteOrigin,privateKey,
   publicKeyId:env.SIGNING_PUBLIC_KEY_ID,publicKeys,
   resolveRisk:resolveRisk??(async()=>{throw new PaymentError('QUALIFIED_RISK_RESOLVER_NOT_CONFIGURED');})};
  if(env.X402_ENABLED==='true'){
   baseRail=new X402Engine({...context,
    base:new BaseVerifier({rpcUrl:env.BASE_RPC_URL,confirmations:Number(env.BASE_CONFIRMATIONS??2)}),
    facilitator:createCommercialFacilitator({
     url:requireValue(env.X402_FACILITATOR_URL,'FACILITATOR_URL_REQUIRED',500),
     headers:JSON.parse(env.X402_FACILITATOR_HEADERS_JSON??'{}')})});
  }
  if(env.POLYGON_X402_ENABLED==='true'){
   polygonRail=new PolygonX402Engine({...context,
    polygon:new PolygonVerifier({rpcUrl:env.POLYGON_RPC_URL,confirmations:2}),
    facilitator:new DexterPolygonFacilitator({url:DEXTER_URL})});
  }
  x402=new MultiChainX402Router({pool,base:baseRail,polygon:polygonRail});
 }
 const handle=createPaymentHandler({paypal,x402,pool,authenticate,siteOrigin,
  onError:value=>console.error(JSON.stringify(value))});
 return {paypal,x402,handle};
}
