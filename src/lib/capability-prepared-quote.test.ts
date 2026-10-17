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
   for(const variant of Object.keys(variants)){
    const q=quoteGeomacroPreparedCapability({...base,capability,variant});
    expect(q.prepared_answer_sha256).toBe(newHash);
    expect(q.amount_usdc).toBe(variants[variant as keyof typeof variants]);
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
});
