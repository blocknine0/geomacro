import {describe,it,expect} from "vitest";
import {
 quoteGeomacroPreparedCapability,verifyGeomacroPreparedCapabilityQuote,
} from "./capability-prepared-quote.server";
import {GEOMACRO_CAPABILITY_PRICES} from "./capability-pricing-catalog";
import {assertCapabilityPrequote} from "../../workers/commerce-ledger/src/capability-prequote.mjs";

const hash="a".repeat(64),newHash="b".repeat(64);
const now=new Date("2026-10-17T12:02:00.000Z");
const recipient="0x"+"1".repeat(40);
const base={
 capability:"intelligence_query",variant:"focused",
 requestFingerprint:hash,preparedAnswerSha256:newHash,
 network:"eip155:8453",
 asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
 recipient,rail:"coinbase_x402" as const,
 availabilityVerified:true,preparedAnswerVerified:true,now,
};
describe("exact prepared-answer capability binding (no funds)",()=>{
 it("matches production Worker quote digest and all approved 14 prices",async()=>{
  let count=0;
  for(const [capability,variants] of Object.entries(GEOMACRO_CAPABILITY_PRICES)){
   for(const [variant,amount] of Object.entries(variants)){
    const q=quoteGeomacroPreparedCapability({...base,capability,variant});
    expect(q.prepared_answer_sha256).toBe(newHash);
    expect(q.amount_usdc).toBe(amount);
    expect(q.execution_authorized).toBe(false);
    await expect(assertCapabilityPrequote(q,{
      provider:"coinbase_x402",providerEnvironment:"mainnet",
    },now.getTime())).resolves.toBe(Date.parse(q.expires_at));
    count++;
   }
  }
  expect(count).toBe(14);
 });
 it("only exact price, customer bytes, request, rail and recipient are accepted",async()=>{
  const q=quoteGeomacroPreparedCapability(base);
  for(const bad of [
   {...q,amount_usdc:"0.15"},
   {...q,prepared_answer_sha256:hash},
   {...q,request_fingerprint_sha256:newHash},
   {...q,payment_rail:"circle_gateway_x402"},
   {...q,recipient:"0x"+"2".repeat(40)},
   {...q,quote_id:"0".repeat(64)},
  ]){
   expect(()=>verifyGeomacroPreparedCapabilityQuote(bad,base,now)).toThrow();
   await expect(assertCapabilityPrequote(bad,{
     provider:"coinbase_x402",providerEnvironment:"mainnet",
   },now.getTime())).rejects.toThrow();
  }
  expect(()=>verifyGeomacroPreparedCapabilityQuote(q,base,new Date("2026-10-17T12:05:00Z")))
    .toThrow("CAPABILITY_PREPARED_QUOTE_EXPIRED");
 });
 it("fails closed on unverified source, bytes, unsupported chain or unsupported variant",()=>{
  for(const edited of [
   {availabilityVerified:false},{preparedAnswerVerified:false},
   {network:"eip155:84532"},{asset:"0x"+"2".repeat(40)},
   {preparedAnswerSha256:"bad"},{requestFingerprint:"bad"},
   {variant:"premium"},{capability:"unknown"},
  ]){
   expect(()=>quoteGeomacroPreparedCapability({...base,...edited} as never)).toThrow();
  }
 });
 it("Circle and Coinbase use disjoint quote ids, without changing price",async()=>{
  const coinbase=quoteGeomacroPreparedCapability(base);
  const circle=quoteGeomacroPreparedCapability({...base,rail:"circle_gateway_x402"});
  expect(circle.amount_atomic).toBe(coinbase.amount_atomic);
  expect(circle.quote_id).not.toBe(coinbase.quote_id);
  await expect(assertCapabilityPrequote(circle,{
    provider:"circle_gateway_x402",providerEnvironment:"production",
  },now.getTime())).resolves.toBe(Date.parse(circle.expires_at));
  await expect(assertCapabilityPrequote(circle,{
    provider:"coinbase_x402",providerEnvironment:"mainnet",
  },now.getTime())).rejects.toThrow();
 });
 it("accepts all fourteen founder prices on Circle Base Arc and Polygon while preserving immutable chain identity",async()=>{
  const rails=[
    ["eip155:8453","0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
    ["eip155:5042","0x3600000000000000000000000000000000000000"],
    ["eip155:137","0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"],
  ] as const;
  let checked=0;
  for(const [capability,variants] of Object.entries(GEOMACRO_CAPABILITY_PRICES)){
   for(const [variant,amount] of Object.entries(variants)){
    const quotes=[];
    for(const [network,asset] of rails){
     const cfg={...base,capability,variant,network,asset,rail:"circle_gateway_x402" as const};
     const quote=quoteGeomacroPreparedCapability(cfg);
     expect(quote.amount_usdc).toBe(amount);
     expect(quote.amount_atomic).toBe(quote.amount_usdc==="0.005"?"5000":
       String(Math.round(Number(amount)*1_000_000)));
     expect(verifyGeomacroPreparedCapabilityQuote(quote,cfg,now)).toEqual(quote);
     await expect(assertCapabilityPrequote(quote,{
      provider:"circle_gateway_x402",providerEnvironment:"production",
     },now.getTime())).resolves.toBe(Date.parse(quote.expires_at));
     quotes.push(quote);
     checked++;
    }
    expect(new Set(quotes.map(q=>q.quote_id)).size).toBe(3);
   }
  }
  expect(checked).toBe(42);
 });
 it("rejects cross-chain asset substitution, unsupported Coinbase settlement and a changed Circle scope",async()=>{
  const native=[
   {network:"eip155:5042",asset:"0x3600000000000000000000000000000000000000"},
   {network:"eip155:137",asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"},
  ];
  for(const input of native){
   const cfg={...base,...input,rail:"circle_gateway_x402" as const};
   const good=quoteGeomacroPreparedCapability(cfg);
   await expect(assertCapabilityPrequote(good,{
    provider:"coinbase_x402",providerEnvironment:"mainnet",
   },now.getTime())).rejects.toThrow();
   expect(()=>quoteGeomacroPreparedCapability({...cfg,rail:"coinbase_x402"})).toThrow();
   expect(()=>quoteGeomacroPreparedCapability({...cfg,asset:base.asset})).toThrow();
   expect(()=>quoteGeomacroPreparedCapability({...cfg,asset:"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"})).toThrow();
   expect(()=>verifyGeomacroPreparedCapabilityQuote({...good,network:"eip155:8453"},cfg,now)).toThrow();
   expect(()=>verifyGeomacroPreparedCapabilityQuote({...good,asset_contract:base.asset.toLowerCase()},cfg,now)).toThrow();
   await expect(assertCapabilityPrequote({...good,network:"eip155:8453"},{
    provider:"circle_gateway_x402",providerEnvironment:"production",
   },now.getTime())).rejects.toThrow();
   await expect(assertCapabilityPrequote({...good,asset_contract:base.asset.toLowerCase()},{
    provider:"circle_gateway_x402",providerEnvironment:"production",
   },now.getTime())).rejects.toThrow();
  }
  expect(()=>quoteGeomacroPreparedCapability({...base,network:"eip155:1"})).toThrow();
 });

});
