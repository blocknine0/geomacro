#!/usr/bin/env node
/**
 * Read-only PayPal live SDK + webhook-registration proof.
 * Zero checkout orders, captures, refunds or customer records.
 * Output NEVER includes client secrets, OAuth tokens or buyer information.
 */
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const FIELDS=['CLIENT_ID','CLIENT_SECRET','WEBHOOK_ID'];
const ENDPOINT='https://geomacro.live/api/v1/payments/paypal';
const API='https://api-m.paypal.com';
const REQUIRED=['PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED'];
const code=v=>/^PAYPAL_[A-Z0-9_]{4,75}$/u.test(String(v??''))?String(v):'PAYPAL_LIVE_PROVIDER_UNAVAILABLE';
const field=(env,name)=>{
 const a=String(env['PAYPAL_'+name]??'').trim();
 const b=String(env['GEOMACRO_PAYPAL_'+name]??'').trim();
 if(a&&b&&a!==b)throw Error('PAYPAL_BINDING_CONFLICT_'+name);
 return a||b||'';
};
function receipt(){
 return {schema:'geomacro.paypal-live-webhook-configuration.v1',
  status:'NOT_YET_VERIFIED',environment:'live',
  credentials_oauth_verified:false,webhook_registration_verified:false,
  event_subscriptions_verified:false,verified_webhook_url:false,
  merchant_kyc_verified:false,international_receiving_verified:false,
  production_capture_reconciled:false,real_money_pilot_verified:false,
  checkout_unlocked:false,real_funds_touched:false};
}
async function json(response,max=16384){
 if(!response||!response.ok||response.status>=300&&response.status<400)
  throw Error('PAYPAL_READONLY_PROVIDER_HTTP_UNVERIFIED');
 if(Number(response.headers?.get?.('content-length')??0)>max)
  throw Error('PAYPAL_READONLY_RESPONSE_TOO_LARGE');
 const data=await response.text();
 if(new TextEncoder().encode(data).length>max)
  throw Error('PAYPAL_READONLY_RESPONSE_TOO_LARGE');
 let parsed;try{parsed=JSON.parse(data);}catch{throw Error('PAYPAL_READONLY_PROVIDER_JSON_INVALID');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
  throw Error('PAYPAL_READONLY_PROVIDER_JSON_INVALID');
 return parsed;
}
export async function checkPayPalLiveWebhook({env=process.env,fetchImpl=fetch}={}){
 const base=receipt();
 try{
  if(env.GEOMACRO_PAYPAL_ENVIRONMENT!=='live')
   throw Error('PAYPAL_LIVE_ENVIRONMENT_REQUIRED');
  const fields=FIELDS.map(n=>field(env,n));
  const [client,secret,id]=fields;
  if(!client||!secret||!id||
     fields.some(x=>x.length>512||/[\r\n\0]/u.test(x))||
     !/^[A-Za-z0-9-]{4,128}$/u.test(id))
   throw Error('PAYPAL_LIVE_REQUIRED_BINDING_MISSING');
  const tokenResult=await json(await fetchImpl(API+'/v1/oauth2/token',{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Basic '+Buffer.from(client+':'+secret).toString('base64'),
    'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},
   body:'grant_type=client_credentials',
  }));
  const token=tokenResult.access_token;
  if(typeof token!=='string'||token.length<8||token.length>4096||
     /[\r\n\0]/u.test(token))
   throw Error('PAYPAL_LIVE_OAUTH_NOT_VERIFIED');
  base.credentials_oauth_verified=true;
  const webhook=await json(await fetchImpl(API+'/v1/notifications/webhooks/'+encodeURIComponent(id),{
   method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  }));
  if(webhook.id!==id||webhook.url!==ENDPOINT)
   throw Error('PAYPAL_LIVE_WEBHOOK_ID_OR_URL_MISMATCH');
  base.verified_webhook_url=true;
  if(!Array.isArray(webhook.event_types)||webhook.event_types.length>100)
   throw Error('PAYPAL_LIVE_SUBSCRIPTIONS_UNVERIFIED');
  const events=new Set(webhook.event_types.map(x=>x?.name).filter(x=>typeof x==='string'));
  if(!events.has('*')||events.size>100){
   if(!REQUIRED.every(n=>events.has(n)))
    throw Error('PAYPAL_LIVE_REQUIRED_CAPTURE_REFUND_EVENTS_MISSING');
  }
  base.event_subscriptions_verified=true;
  base.webhook_registration_verified=true;
  base.status='PASS_WEBHOOK_CONFIG_ONLY';
  // OAuth + webhook registration never establish KYC, charge success,
  // funded D1 state or activated merchant receiving capability.
  return base;
 }catch(e){
  return {...base,status:'NOT_YET_VERIFIED',reason:code(e?.message)||'PAYPAL_LIVE_PROVIDER_UNAVAILABLE'};
 }
}
export async function runPayPalReadonlyPreflight({env=process.env,fetchImpl=fetch}={}){
 const value=await checkPayPalLiveWebhook({env,fetchImpl});
 mkdirSync('artifacts/release',{recursive:true,mode:0o700});
 writeFileSync('artifacts/release/paypal-live-webhook-readonly-receipt.json',
  JSON.stringify(value,null,2)+'\n',{mode:0o600});
 return value;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const v=await runPayPalReadonlyPreflight();
 console.log(JSON.stringify(v));
 if(v.status!=='PASS_WEBHOOK_CONFIG_ONLY')process.exitCode=2;
}
