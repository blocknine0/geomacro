import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertCapabilityPriceHealth} from './capability-price-health.mjs';
const meta={pricing_policy:'SERVER_VERIFIED_CAPABILITY_AND_VARIANT',exact_price_usdc:null};
const asset='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ready=(price,atomic)=>({ok:true,chargeable:true,payment_required_now:false,
 availability:{deliverable:true},exact_price:{amount_usdc:price,amount_atomic:atomic,
 asset:'USDC',asset_contract:asset,network:'eip155:8453'}});
const req=(amount)=>({amount,asset,network:'eip155:8453'});
test('accepts query-specific prices with null GET price for both public health scripts',()=>{
 for(const [price,atomic] of [['0.005','5000'],['0.02','20000'],['0.05','50000'],['0.10','100000'],['0.15','150000']])
  assert.equal(assertCapabilityPriceHealth(meta,ready(price,atomic),req(atomic)),atomic);
});
test('rejects stale flat-price metadata, changed amount, rail and non-deliverable requests',()=>{
 assert.throws(()=>assertCapabilityPriceHealth({...meta,exact_price_usdc:'0.05'},ready('0.10','100000'),req('100000')));
 assert.throws(()=>assertCapabilityPriceHealth(meta,ready('0.10','100000'),req('50000')));
 assert.throws(()=>assertCapabilityPriceHealth(meta,ready('0.10','100000'),{...req('100000'),network:'eip155:84532'}));
 assert.throws(()=>assertCapabilityPriceHealth(meta,ready('0.10','100000'),{...req('100000'),asset:'other'}));
 assert.throws(()=>assertCapabilityPriceHealth(meta,{...ready('0.10','100000'),availability:{deliverable:false}},req('100000')));
 assert.throws(()=>assertCapabilityPriceHealth(meta,ready('0.10','50000'),req('50000')));
});
