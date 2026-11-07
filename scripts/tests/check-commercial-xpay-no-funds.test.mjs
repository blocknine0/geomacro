import test from 'node:test';
import assert from 'node:assert/strict';
import { checkXpayNoFunds } from '../ops/check-commercial-xpay-no-funds.mjs';

const receiver='0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5';
const env=()=>({
 COINBASE_X402_PAY_TO:receiver,
 BASE_RPC_URL:'https://alchemy.example/v2/fixture-secret',
 GEOMACRO_COMMERCIAL_X402_FACILITATOR_URL:'https://facilitator.xpay.sh',
 GEOMACRO_COMMERCE_DISABLED_PROVIDERS:'paypal,x402,coinbase_x402',
 GEOMACRO_REAL_FUNDS_SECURITY_ACK:'',
});
const worker='https://commercial.example';
const supported={supportedNetworks:[{networkId:'eip155:8453',version:'v2'}]};
const health={x402_configured:false,ledger_configured:true,signer_configured:true,execution_authorized:false,deployed_sha:'fixture'};
const readiness={ledger_verified:true,execution_authorized:false};
function fixture({network='0x2105',support=supported,h=health,ready=readiness}={}) {
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url==='https://facilitator.xpay.sh/supported')return Response.json(support);
  if(url==='https://alchemy.example/v2/fixture-secret'){
   const body=JSON.parse(options.body);
   assert.equal(options.method,'POST');assert.equal(body.method,'eth_chainId');
   assert.deepEqual(body.params,[]);
   return Response.json({jsonrpc:'2.0',id:1,result:network});
  }
  if(url===worker+'/v1/commercial/health')return Response.json(h);
  if(url===worker+'/v1/commercial/readiness')return Response.json(ready);
  throw Error('UNEXPECTED_NETWORK_TARGET');
 };
 return {calls,fetchImpl};
}
test('protected preflight reads only capabilities, chain ID and disabled commercial state',async()=>{
 const {calls,fetchImpl}=fixture();
 const result=await checkXpayNoFunds({env:env(),fetchImpl,workerOrigin:worker});
 assert.equal(result.status,'PASS');assert.equal(result.payment_attempted,false);
 assert.equal(result.payment_enabled,false);
 assert.equal(result.checks.quarantine,true);
 assert.equal(result.checks.commercial_x402_disabled,true);
 assert.equal(result.checks.base_rpc_chain,'eip155:8453');
 assert.equal(calls.length,4);
 assert(calls.every(x=>!/(?:\/verify|\/settle|eth_sendRawTransaction)/u.test(x.url)));
 assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
});
test('missing quarantine or attempted real-funds ACK fails before any network',async()=>{
 for(const bad of [
  {GEOMACRO_COMMERCE_DISABLED_PROVIDERS:'x402'},
  {GEOMACRO_COMMERCE_DISABLED_PROVIDERS:''},
  {GEOMACRO_REAL_FUNDS_SECURITY_ACK:'I_ACCEPT_REAL_FUNDS_SECURITY_GATES'}]){
  const {calls,fetchImpl}=fixture();
  await assert.rejects(checkXpayNoFunds({env:{...env(),...bad},fetchImpl,workerOrigin:worker}));
  assert.equal(calls.length,0);
 }
});
test('wrong payee, unsafe RPC and alternate facilitator rejected without a network call',async()=>{
 for(const bad of [
  {COINBASE_X402_PAY_TO:'0x'+'aa'.repeat(20)},
  {BASE_RPC_URL:'http://alchemy.example'},
  {BASE_RPC_URL:'https://localhost/v2/abc'},
  {BASE_RPC_URL:''},
  {GEOMACRO_COMMERCIAL_X402_FACILITATOR_URL:'https://x402.dexter.cash'},
  {GEOMACRO_COMMERCIAL_X402_FACILITATOR_URL:'https://facilitator.xpay.sh/v2'},
 ]){
  const {calls,fetchImpl}=fixture();
  await assert.rejects(checkXpayNoFunds({env:{...env(),...bad},fetchImpl,workerOrigin:worker}));
  assert.equal(calls.length,0);
 }
});
test('wrong x402 protocol and wrong Base RPC chain fail closed',async()=>{
 for(const fixtureOptions of [{support:{supportedNetworks:[{networkId:'eip155:84532',version:'v2'}]}},
  {network:'0x89'}, {network:'0x1'}]){
  const {fetchImpl}=fixture(fixtureOptions);
  await assert.rejects(checkXpayNoFunds({env:env(),fetchImpl,workerOrigin:worker}));
 }
});
test('commercial Worker must remain disabled with ledger and signing readable',async()=>{
 for(const fixtureOptions of [
  {h:{...health,x402_configured:true}},
  {h:{...health,signer_configured:false}},
  {h:{...health,execution_authorized:true}},
  {ready:{...readiness,ledger_verified:false}}
 ]){
  const {fetchImpl}=fixture(fixtureOptions);
  await assert.rejects(checkXpayNoFunds({env:env(),fetchImpl,workerOrigin:worker}));
 }
});
test('network failure reports only a generic code without URL or API secret',async()=>{
 const broken=async()=>{throw Error('sensitive RPC detail')};
 await assert.rejects(checkXpayNoFunds({env:env(),fetchImpl:broken,workerOrigin:worker}),
  /XPAY_SUPPORTED_READ_FAILED/);
});
