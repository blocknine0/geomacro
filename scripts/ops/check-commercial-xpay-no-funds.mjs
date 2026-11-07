#!/usr/bin/env node
/**
 * Protected manual no-funds preflight. No payment signature, /verify, /settle,
 * transfer, approval, secret logging, deployment or financial mutation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { NETWORKS,supportsExactV2 } from '../lib/no-card-x402-facilitator-policy.mjs';

const recipient=JSON.parse(readFileSync(new URL('../../config/mainnet-usdc-recipient.json',import.meta.url),'utf8')).receiver;
const XPAY='https://facilitator.xpay.sh';
const WORKER='https://geomacro-commercial-api.daspallab202391.workers.dev';
const NO_FUNDS_SCHEMA='geomacro.xpay.no-funds-preflight.v1';
const fail=code=>{throw new Error(code)};

async function json(fetchImpl,url,options,code) {
 let response;
 try {
  response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(9000),...options});
  if(!response.ok)fail('UNEXPECTED_STATUS');
  const body=await response.text();
  if(body.length>131072)fail('RESPONSE_TOO_LARGE');
  return JSON.parse(body);
 }catch {fail(code)}
}
export async function checkXpayNoFunds({env=process.env,fetchImpl=fetch,workerOrigin=WORKER}={}) {
 const disabled=new Set(String(env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS??'').split(',').map(x=>x.trim().toLowerCase()));
 if(!disabled.has('x402')||!disabled.has('coinbase_x402'))fail('X402_QUARANTINE_NOT_PROVEN');
 if(env.GEOMACRO_REAL_FUNDS_SECURITY_ACK==='I_ACCEPT_REAL_FUNDS_SECURITY_GATES')fail('REAL_FUNDS_ACK_MUST_BE_ABSENT');
 const payee=String(env.COINBASE_X402_PAY_TO??'');
 if(payee.toLowerCase()!==recipient.toLowerCase())fail('PINNED_RECEIVER_MISMATCH');
 if(String(env.GEOMACRO_COMMERCIAL_X402_FACILITATOR_URL??'').replace(/\/$/u,'')!==XPAY)fail('XPAY_URL_MISMATCH');
 const rawRpc=String(env.BASE_RPC_URL??'');
 let rpcUrl;
 try {rpcUrl=new URL(rawRpc)}catch{fail('BASE_RPC_URL_MISSING_OR_INVALID')}
 if(rpcUrl.protocol!=='https:'||rpcUrl.username||rpcUrl.password||rpcUrl.hash||!rpcUrl.hostname||
   /^(?:localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/iu.test(rpcUrl.hostname))fail('BASE_RPC_HTTPS_URL_REQUIRED');
 // No-money read-only network capability check; no authorization is constructed.
 const supported=await json(fetchImpl,XPAY+'/supported',{method:'GET',headers:{Accept:'application/json'}},'XPAY_SUPPORTED_READ_FAILED');
 if(!supportsExactV2('xpay',supported,'base'))fail('XPAY_EXACT_V2_BASE_UNSUPPORTED');
 // One read-only eth_chainId RPC request, never eth_sendRawTransaction.
 const chain=await json(fetchImpl,rpcUrl.href,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})
 },'BASE_RPC_CHAIN_READ_FAILED');
 if(chain?.result!=='0x2105'||chain?.error)fail('BASE_RPC_WRONG_CHAIN');
 if(new URL(workerOrigin).protocol!=='https:')fail('COMMERCIAL_WORKER_HTTPS_REQUIRED');
 const health=await json(fetchImpl,workerOrigin+'/v1/commercial/health',{method:'GET'},'COMMERCIAL_HEALTH_READ_FAILED');
 const readiness=await json(fetchImpl,workerOrigin+'/v1/commercial/readiness',{method:'GET'},'COMMERCIAL_LEDGER_READ_FAILED');
 if(health?.x402_configured!==false||health?.ledger_configured!==true||
    health?.signer_configured!==true||health?.execution_authorized!==false||
    readiness?.ledger_verified!==true||readiness?.execution_authorized!==false)
  fail('COMMERCIAL_WORKER_NO_FUNDS_STATE_NOT_PROVEN');
 return {
  schema:NO_FUNDS_SCHEMA,mode:'NO_FUNDS_ONLY',status:'PASS',
  checks:{quarantine:true,receiver_matches_owner_proof:true,base_rpc_chain:NETWORKS.base.network,
   xpay_v2_exact_supported:true,ledger_readback:true,signer_present:true,
   commercial_x402_disabled:true},
  deployed_sha:typeof health.deployed_sha==='string'?health.deployed_sha:null,
  payment_attempted:false,payment_enabled:false,
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {process.stdout.write(JSON.stringify(await checkXpayNoFunds(),null,2)+'\n')}
 catch(error){process.stderr.write(JSON.stringify({schema:NO_FUNDS_SCHEMA,status:'FAIL',
  code:error instanceof Error&&/^[A-Z0-9_]+$/u.test(error.message)?error.message:'PREFLIGHT_FAILED',
  payment_attempted:false})+'\n');process.exitCode=1}
}
