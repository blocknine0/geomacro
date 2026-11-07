#!/usr/bin/env node
/** Protected no-funds PostgREST acceptance for both immutable USDC rails.
 * No authorization, customer data, signed payload or funds may be supplied.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readJsonResponse} from '../../services/commercial-api/src/payments/common.mjs';

const schema='geomacro.commercial-merchant-rails.no-funds.v1';
const origin='https://geomacro-commercial-api.daspallab202391.workers.dev';
const blank='00000000-0000-4000-8000-000000000001';
const fixedOps=Object.freeze({
 health:[],x402_get:[blank],polygon_x402_get:[blank],
 x402_pending:[5],polygon_x402_pending:[5]
});
const fault=code=>{throw Error(code)};
export async function verifyMerchantRailsNoFunds({
 serviceKey=process.env.RISK_GATE_SUPABASE_SERVICE_ROLE_KEY,
 url,fetchImpl=fetch,workerOrigin=origin,expectedSha=process.env.GITHUB_SHA,
}={}){
 if(typeof serviceKey!=='string'||serviceKey.length<20)
  fault('PROTECTED_SUPABASE_KEY_UNAVAILABLE');
 if(!url){
  const cfg=JSON.parse(readFileSync(new URL('../../services/commercial-api/wrangler.jsonc',import.meta.url),'utf8'));
  url=cfg.vars?.COMMERCIAL_SUPABASE_URL;
 }
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(String(url??'')))
  fault('SUPABASE_ORIGIN_NOT_PINNED');
 if(workerOrigin!==origin)fault('COMMERCIAL_ORIGIN_NOT_PINNED');
 const headers={'Content-Type':'application/json',Accept:'application/json',apikey:serviceKey};
 if(!serviceKey.startsWith('sb_secret_'))headers.Authorization='Bearer '+serviceKey;
 const observations={};
 for(const [operation,args] of Object.entries(fixedOps)){
  let response,data;
  try{
   response=await fetchImpl(url+'/rest/v1/rpc/geomacro_commercial_rpc',{
    method:'POST',headers,redirect:'manual',signal:AbortSignal.timeout(15000),
    body:JSON.stringify({p_operation:operation,p_args:args})
   });
   if(!response.ok)fault('POSTGREST_RPC_NOT_READY');
   data=await readJsonResponse(response,16384);
  }catch{fault('POSTGREST_RPC_NOT_READY')}
  if(operation==='health'){
   if(data?.ready!==true)fault('POSTGREST_LEDGER_UNHEALTHY');
  }else if(operation.endsWith('_pending')){
   if(!Array.isArray(data)||data.length)fault('UNEXPECTED_PENDING_PAYMENT');
  }else{
   if(data!==null)fault('UNEXPECTED_PAYMENT_INTENT');
  }
  observations[operation]='PASS';
 }
 let response,data;
 try{
  response=await fetchImpl(workerOrigin+'/v1/commercial/health',{
   method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)fault('WORKER_HEALTH_UNAVAILABLE');
  data=await readJsonResponse(response,8192);
 }catch{fault('WORKER_HEALTH_UNAVAILABLE')}
 if(data?.x402_configured!==false||data?.polygon_x402_configured!==false||
  data?.paypal_configured!==false||data?.ledger_configured!==true||
  data?.signer_configured!==true||data?.execution_authorized!==false)
  fault('WORKER_FUNDS_LOCK_MISMATCH');
 if(expectedSha&&data.deployed_sha!==expectedSha)fault('EXACT_WORKER_HEAD_MISMATCH');
 return {schema,status:'PASS',mode:'NO_FUNDS_READ_ONLY',
  service_role_gateway:observations,worker_sha:data.deployed_sha,
  base_enabled:false,polygon_enabled:false,paypal_enabled:false,
  settlement_attempted:false,payment_attempted:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(await verifyMerchantRailsNoFunds(),null,2)+'\n')}
 catch(error){
  const code=/^[A-Z0-9_]+$/u.test(error.message)?error.message:'MERCHANT_RAILS_PROBE_FAILED';
  process.stderr.write(JSON.stringify({schema,status:'FAIL',code,payment_attempted:false})+'\n');
  process.exitCode=1;
 }
}
