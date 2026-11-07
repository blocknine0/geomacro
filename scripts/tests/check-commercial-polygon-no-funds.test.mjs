import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPolygonDexterNoFunds} from '../ops/check-commercial-polygon-no-funds.mjs';

const rpc='https://polygon-bor-rpc.publicnode.com';
const dexter='https://x402.dexter.cash';
const worker='https://geomacro-commercial-api.daspallab202391.workers.dev';
const environment=()=>({
 GEOMACRO_COMMERCE_DISABLED_PROVIDERS:'x402,coinbase_x402',
 GEOMACRO_REAL_FUNDS_SECURITY_ACK:''
});
const supported={kinds:[{x402Version:2,scheme:'exact',network:'eip155:137'}]};
const health={ok:true,x402_configured:false,polygon_x402_configured:false,
 ledger_configured:true,signer_configured:true,execution_authorized:false,deployed_sha:'fixture'};
const readiness={ledger_verified:true,execution_authorized:false};
const usdc='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';

function fixture({chain='0x89',code='0x6001600055',decimals='0x'+ '0'.repeat(63)+'6',
 support=supported,h=health,ready=readiness}={}){
 const calls=[];
 const fetchImpl=async (url,init)=>{
  calls.push({url,init});
  if(url===dexter+'/supported'){
   assert.equal(init.method,'GET');return Response.json(support);
  }
  if(url===rpc){
   const body=JSON.parse(init.body);
   assert.equal(body.jsonrpc,'2.0');assert.equal(body.id,1);
   const results={eth_chainId:chain,eth_getCode:code,eth_call:decimals};
   assert(Object.hasOwn(results,body.method));
   if(body.method==='eth_getCode')assert.deepEqual(body.params,[usdc,'latest']);
   if(body.method==='eth_call')assert.deepEqual(body.params,[{to:usdc,data:'0x313ce567'},'latest']);
   return Response.json({jsonrpc:'2.0',id:1,result:results[body.method]});
  }
  if(url===worker+'/v1/commercial/health')return Response.json(h);
  if(url===worker+'/v1/commercial/readiness')return Response.json(ready);
  throw Error('UNEXPECTED_NETWORK_TARGET');
 };
 return {calls,fetchImpl};
}
test('Polygon/Dexter no-funds live contract reads are exactly 1 GET, 3 readonly RPC and 2 Worker GETs',async()=>{
 const f=fixture();
 const r=await checkPolygonDexterNoFunds({env:environment(),fetchImpl:f.fetchImpl});
 assert.equal(r.status,'PASS');
 assert.equal(r.payment_enabled,false);
 assert.equal(r.payment_attempted,false);
 assert.equal(r.polygon_settlement_integrated,false);
 assert.equal(r.checks.native_usdc_decimals,6);
 assert.equal(f.calls.length,6);
 assert.deepEqual(f.calls.filter(x=>x.url===rpc).map(x=>JSON.parse(x.init.body).method),
  ['eth_chainId','eth_getCode','eth_call']);
 assert(f.calls.every(x=>!x.url.endsWith('/verify')&&!x.url.endsWith('/settle')));
});
test('no-funds quarantine rejects real-money ACK before all network calls',async()=>{
 for(const override of [
  {GEOMACRO_COMMERCE_DISABLED_PROVIDERS:'x402'},
  {GEOMACRO_COMMERCE_DISABLED_PROVIDERS:''},
  {GEOMACRO_REAL_FUNDS_SECURITY_ACK:'I_ACCEPT_REAL_FUNDS_SECURITY_GATES'}
 ]){
  const f=fixture();
  await assert.rejects(checkPolygonDexterNoFunds({env:{...environment(),...override},fetchImpl:f.fetchImpl}));
  assert.equal(f.calls.length,0);
 }
});
test('network, asset, token and contract errors fail closed with no payment',async()=>{
 for(const scenario of [
  {support:{kinds:[{x402Version:2,scheme:'exact',network:'eip155:80002'}]}},
  {support:{kinds:[{x402Version:1,scheme:'exact',network:'eip155:137'}]}},
  {chain:'0x2105'},
  {chain:'0x13882'},
  {code:'0x'},
  {code:'0x00'},
  {decimals:'0x'+'0'.repeat(63)+'5'},
  {decimals:'invalid'},
 ]){
  const f=fixture(scenario);
  await assert.rejects(checkPolygonDexterNoFunds({env:environment(),fetchImpl:f.fetchImpl}));
  assert(f.calls.every(x=>!x.url.endsWith('/settle')));
 }
});
test('requires healthy disabled Worker and readable ledger',async()=>{
 for(const scenario of [
  {h:{...health,x402_configured:true}},
  {h:{...health,polygon_x402_configured:true}},
  {h:{...health,signer_configured:false}},
  {h:{...health,execution_authorized:true}},
  {ready:{...readiness,ledger_verified:false}},
 ]){
  const f=fixture(scenario);
  await assert.rejects(checkPolygonDexterNoFunds({env:environment(),fetchImpl:f.fetchImpl}));
 }
});
test('network failure remains sanitized and no funds',async()=>{
 const error=async()=>{throw Error('unredacted third party response and secret')};
 await assert.rejects(checkPolygonDexterNoFunds({env:environment(),fetchImpl:error}),
  /DEXTER_SUPPORTED_UNAVAILABLE/);
});
