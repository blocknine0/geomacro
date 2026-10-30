import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {CATEGORIES,NETWORKS,inspectTwoChainMerchant}
 from "../ops/verify-base-polygon-three-category-no-funds.mjs";
const SHA="a".repeat(40);
const receiver="0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5";
const origin="https://geomacro.live";
const replies=(mode="good")=>async request=>{
  const url=new URL(String(request));
  let json,status=200;
  if(url.pathname==="/.well-known/geomacro-build.json")
    json={canonical_repository:"blocknine0/geomacro",
      canonical_main_sha:mode==="stale"? "b".repeat(40):SHA};
  else if(url.pathname==="/api/v1/payments/networks")
    json={ok:true,merchant_receiver:{
      address:mode==="wrong_receiver"?"0x"+"3".repeat(40):receiver,
      same_address_configuration_verified:true,
      wallet_control_verified:true,
      state:"RECEIVER_CONFIGURED_CONTROL_ATTESTED",
    }};
  else {
    const network=url.searchParams.get("network");
    if(mode==="no_evidence"){
      status=422;
      json={chargeable:false,payment_required_now:false,
        error:{code:"INSUFFICIENT_COVERAGE"}};
    }else{
      status=402;
      json={x402Version:2,resource:{
        url:origin+"/api/v1/intelligence/query?network="+network},
        accepts:[{scheme:"exact",network:NETWORKS[network].id,
          asset:NETWORKS[network].asset,
          payTo:mode==="wrong_payee"?"0x"+"4".repeat(40):receiver,
          amount:"50000"}]};
    }
  }
  return new Response(JSON.stringify(json),{status,headers:{"content-type":"application/json"}});
};
describe("six-category-chain no-funds merchant acceptance",()=>{
 it("accepts only real-shaped six matching merchant quotes without claiming payments",async()=>{
   const x=await inspectTwoChainMerchant({origin,expectedSha:SHA,fetcher:replies()});
   assert.equal(x.status,"SIX_QUALIFIED_PREQUOTES_NO_FUNDS");
   assert.equal(x.qualified_offers,6);
   assert.deepEqual(new Set(x.categories.map(c=>c.category)),new Set(CATEGORIES));
   assert.deepEqual(new Set(x.categories.map(c=>c.network)),new Set(["base","polygon"]));
   assert.equal(x.payment_signature_sent,false);
   assert.equal(x.money_transferred,false);
   assert.equal(x.settlement_verified,false);
   assert.equal(x.customer_paid_delivery_verified,false);
 });
 for(const mode of ["stale","wrong_receiver","wrong_payee","no_evidence"]){
   it("fails closed on "+mode,async()=>{
     const x=await inspectTwoChainMerchant({origin,expectedSha:SHA,fetcher:replies(mode)});
     assert.equal(x.status,"BLOCKED");
     if(mode==="no_evidence"){
       assert.equal(x.qualified_offers,0);
       assert.ok(x.categories.every(y=>y.no_charge_verified));
     }
     if(mode==="wrong_payee")
       assert.ok(x.categories.every(y=>y.blocker_code==="INVALID_PAYMENT_QUOTE_SCOPE"));
   });
 }
});
