import test from 'node:test';
import assert from 'node:assert/strict';
import { XpayFacilitator,XPAY_ORIGIN,createCommercialFacilitator } from '../src/payments/xpay.mjs';
import { requirements,NETWORK,Facilitator } from '../src/payments/base.mjs';

const payer='0x'+'11'.repeat(20),payee='0x'+'22'.repeat(20),tx='0x'+'ab'.repeat(32);
const expected=requirements('100000',payee);
const payment=()=>({x402Version:2,accepted:{...expected},payload:{authorization:{from:payer}}});

function client(reply) {
 const calls=[];
 const facilitator=new XpayFacilitator({url:XPAY_ORIGIN,fetchImpl:async(url,options)=>{
  calls.push({url,options,body:JSON.parse(options.body)});
  return Response.json(typeof reply==='function'?reply(url):reply);
 }});
 return {facilitator,calls};
}
test('xpay requests standard exact v2 body and verification NEVER settles',async()=>{
 const {facilitator,calls}=client({valid:true});
 const result=await facilitator.verify(payment(),expected);
 assert.deepEqual(result,{isValid:true,payer});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,XPAY_ORIGIN+'/verify');
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.redirect,'manual');
 assert.equal(calls[0].body.x402Version,2);
 assert.deepEqual(calls[0].body.paymentPayload,payment());
 assert.deepEqual(calls[0].body.paymentRequirements,expected);
});
test('standard x402 isValid works; explicit false or malformed response fails closed',async()=>{
 for(const valid of [{isValid:true,payer},{valid:true},{isValid:true,valid:true}]){
  assert.equal((await client(valid).facilitator.verify(payment(),expected)).isValid,true);
 }
 for(const invalid of [null,{},[],{valid:'true'},{valid:false},{isValid:false},
  {isValid:true,valid:false},{valid:true,isValid:false},{valid:true,payer:payee},
  {valid:true,payer:15}]){
  await assert.rejects(client(invalid).facilitator.verify(payment(),expected));
 }
});
test('xpay settled/txHash and standard success/transaction map only to Base intent',async()=>{
 for(const raw of [{settled:true,txHash:tx},
  {success:true,transaction:tx,network:NETWORK,payer},
  {settled:true,success:true,txHash:tx,transaction:tx}]){
  const {facilitator,calls}=client(raw);
  const r=await facilitator.settle(payment(),expected);
  assert.deepEqual(r,{success:true,transaction:tx,network:NETWORK,payer});
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,XPAY_ORIGIN+'/settle');
 }
});
test('xpay ambiguous, malformed and cross-chain settlement results reject',async()=>{
 const invalid=[null,{}, {settled:true},{settled:false,txHash:tx},
  {success:true,settled:false,transaction:tx},
  {settled:true,txHash:'0x1234'},
  {settled:true,txHash:tx,transaction:'0x'+'cc'.repeat(32)},
  {settled:true,txHash:tx,network:'eip155:137'},
  {success:true,transaction:tx,payer:payee},
  {success:'true',transaction:tx}];
 for(const raw of invalid)await assert.rejects(client(raw).facilitator.settle(payment(),expected));
});
test('mismatched payment terms, endpoint, credentials and provider shape reject',async()=>{
 const mismatched=payment();mismatched.accepted.network='eip155:137';
 await assert.rejects(client({valid:true}).facilitator.verify(mismatched,expected));
 await assert.rejects(client({settled:true,txHash:tx}).facilitator.settle(mismatched,expected));
 assert.throws(()=>new XpayFacilitator({url:XPAY_ORIGIN+'/v2'}),/XPAY_ENDPOINT_MISMATCH/);
 assert.throws(()=>new XpayFacilitator({url:XPAY_ORIGIN,headers:{Authorization:'secret'}}),/XPAY_AUTH_HEADERS_NOT_REQUIRED/);
 assert(createCommercialFacilitator({url:XPAY_ORIGIN+'/'} ) instanceof XpayFacilitator);
 assert.throws(()=>createCommercialFacilitator({url:XPAY_ORIGIN+'/other'}),/XPAY_ENDPOINT_MISMATCH/);
 assert(createCommercialFacilitator({url:'https://x402.dexter.cash'}) instanceof Facilitator);
});
test('xpay HTTP failures never count as payments',async()=>{
 const facilitator=new XpayFacilitator({url:XPAY_ORIGIN,fetchImpl:async()=>Response.json({valid:true},{status:503})});
 await assert.rejects(facilitator.verify(payment(),expected),/FACILITATOR_UNAVAILABLE/);
 const settlement=new XpayFacilitator({url:XPAY_ORIGIN,fetchImpl:async()=>Response.json({settled:true,txHash:tx},{status:503})});
 await assert.rejects(settlement.settle(payment(),expected),/FACILITATOR_UNAVAILABLE/);
});
