import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import worker,{CommerceLedger} from '../../workers/commerce-ledger/src/index.mjs';
import {resolveGeomacroCapabilityPrice,capabilityPricingCatalog} from '../../src/lib/capability-pricing-catalog.ts';
import {capabilityQuoteHash,CAPABILITY_PREQUOTE_LIMIT} from '../../workers/commerce-ledger/src/capability-prequote.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const customerBytes='{"synthetic":"storage-contract-only-no-payment"}';
const scope={provider:'coinbase_x402',providerEnvironment:'mainnet'};
async function quote(capability='gri_read',variant='verified_cached',salt='one'){
 const issued=Math.floor(Date.now()/300000)*300000;
 const q={...resolveGeomacroCapabilityPrice(capability,variant),
  issued_at:new Date(issued).toISOString(),expires_at:new Date(issued+300000).toISOString(),
  quote_window_seconds:300,request_fingerprint_sha256:sha(salt),
  network:'eip155:8453',asset_contract:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  recipient:'0x'+'a'.repeat(40),availability:'VERIFIED_DELIVERABLE',
  payment_rail:'coinbase_x402',prepared_answer_sha256:sha(customerBytes),execution_authorized:false};
 q.quote_id=await capabilityQuoteHash(q);return q;
}
function vault(){
 const map=new Map();
 const txn={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),
  delete:async k=>map.delete(k),list:async({prefix,limit})=>new Map([...map].filter(([k])=>k.startsWith(prefix)).slice(0,limit))};
 const storage={...txn,transaction:async cb=>cb(txn)};
 return {map,ledger:new CommerceLedger({storage},{})};
}
async function post(ledger,action,body){
 const r=await ledger.fetch(new Request('https://internal/'+action,{
  method:'POST',body:JSON.stringify({...scope,...body})}));
 return {status:r.status,body:await r.json()};
}
test('every locked catalogue variant freezes and independently reads its exact byte/hash/price binding',async()=>{
 const {ledger}=vault();
 for(const c of capabilityPricingCatalog())for(const variant of c.variants){
  const q=await quote(c.capability,variant.variant);
  const first=await post(ledger,'capability-prequote-freeze',{quote:q,customerBytes});
  assert.equal(first.status,200);assert.equal(first.body.disposition,'FROZEN');
  for(let i=0;i<2;i++){
   const r=await post(ledger,'capability-prequote-readback',{quoteId:q.quote_id});
   assert.equal(r.status,200);assert.equal(r.body.customerBytes,customerBytes);
   assert.equal(r.body.quote.amount_atomic,variant.amount_atomic);
   assert.equal(r.body.payment_authorized,false);assert.equal(r.body.settlement_attempted,false);
  }
  assert.equal((await post(ledger,'capability-prequote-freeze',{quote:q,customerBytes})).body.disposition,'EXACT_REPLAY');
 }
});
test('wrong terms, amount, quote digest, body hash, rail/environment and network never write a prequote',async()=>{
 for(const change of [
  {amount_atomic:'6000'},{amount_usdc:'0.006'},{recipient:'0x'+'b'.repeat(40)},
  {capability:'unknown'},{variant:'invented'},{quote_id:'f'.repeat(64)},
  {prepared_answer_sha256:'f'.repeat(64)},{network:'eip155:84532'},
  {asset_contract:'0x'+'0'.repeat(40)},{execution_authorized:true},{extra:'not-approved'},
 ]){
  const {ledger,map}=vault();const q={...await quote(),...change};
  assert.equal((await post(ledger,'capability-prequote-freeze',{quote:q,customerBytes})).status,409);
  assert.equal(map.size,0);
 }
 for(const providerEnvironment of ['production','prelaunch']){
  const {ledger,map}=vault();
  assert.equal((await post(ledger,'capability-prequote-freeze',{
   quote:await quote(),customerBytes,providerEnvironment})).status,409);
  assert.equal(map.size,0);
 }
});
test('two provider namespaces remain exact, including Circle environment binding',async()=>{
 const {ledger}=vault();const q={...await quote(),payment_rail:'circle_gateway_x402'};
 q.quote_id=await capabilityQuoteHash(q);
 const payload={quote:q,customerBytes,provider:q.payment_rail,providerEnvironment:'production'};
 assert.equal((await post(ledger,'capability-prequote-freeze',payload)).status,200);
 assert.equal((await post(ledger,'capability-prequote-readback',{
  quoteId:q.quote_id,provider:q.payment_rail,providerEnvironment:'production'})).status,200);
 assert.equal((await post(ledger,'capability-prequote-readback',{quoteId:q.quote_id})).status,409);
});
test('expiry and stored-byte/price corruption fail closed at readback',async()=>{
 const {ledger,map}=vault();const q=await quote();
 await post(ledger,'capability-prequote-freeze',{quote:q,customerBytes});
 const key='capability-prequote:'+q.quote_id,good=structuredClone(map.get(key));
 for(const value of [{...good,customerBytes:'tampered'},
  {...good,expiresAtMs:Date.now()-1},{...good,quote:{...q,amount_atomic:'6000'}}]){
  map.set(key,value);
  assert.equal((await post(ledger,'capability-prequote-readback',{quoteId:q.quote_id})).status,409);
 }
 const old={...q,issued_at:'2020-01-01T00:00:00.000Z',expires_at:'2020-01-01T00:05:00.000Z'};
 old.quote_id=await capabilityQuoteHash(old);
 assert.equal((await post(ledger,'capability-prequote-freeze',{quote:old,customerBytes})).status,409);
});
test('vault cap and expired-only pruning leave payment, usage, audit and WDI records untouched',async()=>{
 const {ledger,map}=vault();
 for(const key of ['payment:retained','usage:retained','audit:retained','wdi-prequote:retained'])map.set(key,{retain:true});
 for(let i=0;i<CAPABILITY_PREQUOTE_LIMIT;i++){
  assert.equal((await post(ledger,'capability-prequote-freeze',{
   quote:await quote('gri_read','verified_cached',String(i)),customerBytes})).status,200);
 }
 const overflow=await quote('gri_read','verified_cached','overflow');
 assert.equal((await post(ledger,'capability-prequote-freeze',{quote:overflow,customerBytes})).status,409);
 const first=[...map.keys()].find(k=>k.startsWith('capability-prequote:'));
 map.get(first).expiresAtMs=Date.now()-1;
 assert.equal((await post(ledger,'capability-prequote-freeze',{quote:overflow,customerBytes})).status,200);
 assert.equal(map.has(first),false);assert.equal(map.size,CAPABILITY_PREQUOTE_LIMIT+4);
 for(const key of ['payment:retained','usage:retained','audit:retained','wdi-prequote:retained'])assert.deepEqual(map.get(key),{retain:true});
});
test('public Worker denies unauthorized capability storage operations before Durable Object access',async()=>{
 let hits=0;
 const env={LEDGER_SHARED_TOKEN:'s'.repeat(64),COMMERCE_LEDGER:{idFromName(){hits++;throw Error('must-not-access')}}};
 const response=await worker.fetch(new Request('https://ledger/v1/delivery/capability-prequote-freeze',{
  method:'POST',headers:{authorization:'Bearer wrong'},body:'{}'}),env);
 assert.equal(response.status,401);assert.equal(hits,0);
});
test('delivered-only replay never promotes processing/prepared state and matches every immutable delivery term',async()=>{
 const {ledger,map}=vault();
 const binding={paymentFingerprint:sha('test-payment-only'),requestFingerprint:sha('test-request'),
  productId:'synthetic-capability',network:'eip155:8453',asset:'0x'+'1'.repeat(40),
  amountAtomic:'5000',recipientHash:sha('synthetic-payee'),rail:'synthetic-no-funds'};
 assert.equal((await post(ledger,'replay',binding)).body.disposition,'NOT_FOUND');
 assert.equal(map.size,0);
 const claimed=await post(ledger,'claim',binding);
 assert.equal(claimed.body.disposition,'CLAIMED');
 assert.equal((await post(ledger,'replay',binding)).body.disposition,'NOT_FOUND');
 const responsePayload={synthetic:'no-payment'};
 const responseSha256=sha(JSON.stringify(responsePayload));
 const claimToken=claimed.body.claim_token;
 assert.equal((await post(ledger,'prepare',{...binding,claimToken,responsePayload,responseSha256})).body.ok,true);
 assert.equal((await post(ledger,'replay',binding)).body.disposition,'NOT_FOUND');
 // State transition fixture only: no provider SDK or real settlement exists here.
 assert.equal((await post(ledger,'complete',{...binding,claimToken,
  settlementReference:'synthetic-test-only-reference',settlementNetwork:'none'})).body.ok,true);
 const result=await post(ledger,'replay',binding);
 assert.equal(result.body.disposition,'REPLAY');assert.equal(result.body.response_sha256,responseSha256);
 assert.deepEqual(result.body.response_payload,responsePayload);
 const count=map.size;
 for(const change of [{amountAtomic:'6000'},{recipientHash:sha('different-payee')},
  {network:'eip155:84532'},{asset:'0x'+'2'.repeat(40)},{productId:'other-product'},
  {requestFingerprint:sha('different-request')},{rail:'other-rail'}]){
  assert.equal((await post(ledger,'replay',{...binding,...change})).body.disposition,'NOT_FOUND');
 }
 assert.equal(map.size,count);
});
test('deployment health wait cannot accept the prior WDI-only Worker as the new capability version',async()=>{
 // Turn only the successful CLI exit into a return so the test process stays alive.
 const source=readFileSync(new URL('./wait-commerce-ledger-health.mjs',import.meta.url),'utf8')
  .replace(/^#!.*\n/u,'').replace('process.exit(0);','return 0;');
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const run=new AsyncFunction('process','fetch','setTimeout','console',source);
 let calls=0;
 const old={ok:true,service:'geomacro-commerce-ledger',storage:'durable_objects_sqlite',
  wdi_prequote_contract_version:'geomacro.wdi-prequote-worker.v1',wdi_prequote_available:true};
 const result=await run({env:{GEOMACRO_COMMERCE_LEDGER_URL:'https://synthetic.invalid',
  GEOMACRO_COMMERCE_LEDGER_EXPECTED_WDI_VERSION:old.wdi_prequote_contract_version,
  GEOMACRO_COMMERCE_LEDGER_EXPECTED_CAPABILITY_VERSION:'geomacro.capability-prequote-worker.v1'},
  },async()=>{
   const payload=++calls===1?old:{...old,capability_prequote_contract_version:'geomacro.capability-prequote-worker.v1',capability_prequote_available:true};
   return Response.json(payload);
  },fn=>fn(),{log(){}});
 assert.equal(calls,2);assert.equal(result,0);
});
