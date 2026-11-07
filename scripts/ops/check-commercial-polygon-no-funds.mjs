#!/usr/bin/env node
/**
 * No-funds Polygon/Dexter live acceptance. All network requests are read-only:
 * GET /supported, JSON-RPC eth_chainId/eth_getCode/eth_call, GET Worker health.
 * No wallet signature, no /verify, /settle, eth_sendRawTransaction or payment.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { NETWORKS,supportsExactV2 } from '../lib/no-card-x402-facilitator-policy.mjs';

const verifiedReceiver=JSON.parse(readFileSync(new URL('../../config/mainnet-usdc-recipient.json',import.meta.url),'utf8')).receiver;
const dexter='https://x402.dexter.cash';
const rpc='https://polygon-bor-rpc.publicnode.com';
const worker='https://geomacro-commercial-api.daspallab202391.workers.dev';
const nativeUSDC=NETWORKS.polygon.asset.toLowerCase();
const schema='geomacro.polygon-dexter.no-funds-preflight.v1';
const fail=code=>{throw Error(code)};

async function fetchJson(fetchImpl,url,init,code){
 try{
  const response=await fetchImpl(url,{...init,redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('HTTP_RESPONSE_NOT_OK');
  const data=await response.text();
  if(data.length>131072)throw Error('RESPONSE_TOO_LARGE');
  return JSON.parse(data);
 }catch{fail(code)}
}
async function callRpc(fetchImpl,method,params){
 const body={jsonrpc:'2.0',id:1,method,params};
 const data=await fetchJson(fetchImpl,rpc,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},'POLYGON_PUBLIC_RPC_UNAVAILABLE');
 if(data?.jsonrpc!=='2.0'||data?.id!==1||data?.error||typeof data?.result!=='string')
  fail('POLYGON_RPC_MALFORMED');
 return data.result;
}

export async function checkPolygonDexterNoFunds({env=process.env,fetchImpl=fetch,workerOrigin=worker}={}){
 const disabled=new Set(String(env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS??'')
  .split(',').map(x=>x.trim().toLowerCase()));
 if(!disabled.has('x402')||!disabled.has('coinbase_x402'))
  fail('PAYMENT_QUARANTINE_NOT_VERIFIED');
 if(env.GEOMACRO_REAL_FUNDS_SECURITY_ACK==='I_ACCEPT_REAL_FUNDS_SECURITY_GATES')
  fail('REAL_FUNDS_ACK_PRESENT');
 if(!NETWORKS.polygon||NETWORKS.polygon.network!=='eip155:137'||
  nativeUSDC!=='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359')
  fail('POLYGON_NATIVE_USDC_REGISTRY_CHANGED');
 if(verifiedReceiver.toLowerCase()!==
  '0x95ba71d21c41bda8bba9533f96d25f793e4137b5')
  fail('PINNED_WALLET_CHANGED');
 if(new URL(workerOrigin).protocol!=='https:')fail('WORKER_HTTPS_REQUIRED');

 // A successful supported read is NOT proof of merchant settlement.
 const supported=await fetchJson(fetchImpl,dexter+'/supported',
  {method:'GET',headers:{Accept:'application/json'}},'DEXTER_SUPPORTED_UNAVAILABLE');
 if(!supportsExactV2('dexter',supported,'polygon'))fail('DEXTER_POLYGON_V2_EXACT_UNSUPPORTED');

 const id=await callRpc(fetchImpl,'eth_chainId',[]);
 if(id!=='0x89')fail('POLYGON_CHAIN_ID_MISMATCH');
 const code=await callRpc(fetchImpl,'eth_getCode',[nativeUSDC,'latest']);
 if(!/^0x[0-9a-fA-F]+$/u.test(code)||code==='0x'||/^0x0+$/u.test(code))
  fail('POLYGON_NATIVE_USDC_CODE_ABSENT');
 const decimals=await callRpc(fetchImpl,'eth_call',[{to:nativeUSDC,data:'0x313ce567'},'latest']);
 if(!/^0x[0-9a-fA-F]{64}$/u.test(decimals)||BigInt(decimals)!==6n)
  fail('POLYGON_NATIVE_USDC_DECIMALS_MISMATCH');

 const health=await fetchJson(fetchImpl,workerOrigin+'/v1/commercial/health',
  {method:'GET'},'COMMERCIAL_HEALTH_UNAVAILABLE');
 const readiness=await fetchJson(fetchImpl,workerOrigin+'/v1/commercial/readiness',
  {method:'GET'},'COMMERCIAL_LEDGER_UNAVAILABLE');
 if(health?.x402_configured!==false||health?.ledger_configured!==true||
   health?.signer_configured!==true||health?.execution_authorized!==false||
   health?.polygon_x402_configured===true||readiness?.ledger_verified!==true||
   readiness?.execution_authorized!==false)
  fail('COMMERCIAL_NO_FUNDS_LOCK_MISSING');
 return {schema,mode:'NO_FUNDS_ONLY',status:'PASS',
  checks:{payment_quarantine:true,receiver_owner_proof:true,
   dexter_polygon_v2_exact:true,polygon_chain:'eip155:137',
   native_usdc_bytecode_present:true,native_usdc_decimals:6,
   commercial_x402_disabled:true,ledger_verified:true,signer_present:true},
  observed_worker_sha:typeof health.deployed_sha==='string'?health.deployed_sha:null,
  polygon_settlement_integrated:false,payment_attempted:false,payment_enabled:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(await checkPolygonDexterNoFunds(),null,2)+'\n')}
 catch(error){
  const code=error instanceof Error&&/^[A-Z0-9_]+$/u.test(error.message)?error.message:'POLYGON_NO_FUNDS_PREFLIGHT_FAILED';
  process.stderr.write(JSON.stringify({schema,status:'FAIL',code,payment_attempted:false})+'\n');
  process.exitCode=1;
 }
}
