import {describe,expect,it} from "vitest";
import {quoteGeomacroPreparedCapability} from "./capability-prepared-quote.server";
import {GEOMACRO_CAPABILITY_PRICES,
 resolveGeomacroCapabilityPrice} from "./capability-pricing";
import {coinbaseRequirementsForCapabilityQuote,circleRequirementsForCapabilityQuote,
 assertCapabilityPaymentBinding,capabilityLedgerRequestFingerprint,
 capabilityQuotePaymentExtension,assertAcceptedCapabilityQuote} from "./capability-x402-payment-contract.server";
import type {CoinbaseX402Config} from "./coinbase-x402.server";
import {CIRCLE_X402_BASE_MAINNET_USDC,CIRCLE_X402_BASE_MAINNET_NETWORK,
 CIRCLE_X402_MAX_TIMEOUT_SECONDS,
 type CircleGatewayProductionConfig,type CircleGatewayPaymentRequirement
} from "./circle-gateway-x402-production.server";

const now=new Date("2026-10-15T09:02:30.000Z");
const base="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const seller=("0x"+"b".repeat(40)) as `0x${string}`;
const coinbase:CoinbaseX402Config={
 environment:"production",commercialEnvironment:"mainnet",network:"eip155:8453",
 networkName:"Base",chainId:"8453",asset:base,payTo:seller,
 priceUsdc:"0.05",amountAtomic:"50000",apiKeyId:null,apiKeySecret:null,
};
const circle:CircleGatewayProductionConfig={
 environment:"production",sellerAddress:seller,priceUsdc:"0.05",amountAtomic:"50000",
 networks:[CIRCLE_X402_BASE_MAINNET_NETWORK],
};
const supported:CircleGatewayPaymentRequirement={
 scheme:"exact",network:CIRCLE_X402_BASE_MAINNET_NETWORK,
 asset:CIRCLE_X402_BASE_MAINNET_USDC,amount:"50000",payTo:seller,
 maxTimeoutSeconds:CIRCLE_X402_MAX_TIMEOUT_SECONDS,
 extra:{name:"GatewayWalletBatched",verifyingContract:("0x"+"c".repeat(40)) as `0x${string}`},
};
function offer(capability:string,variant:string,rail:"coinbase_x402"|"circle_gateway_x402"){
 return quoteGeomacroPreparedCapability({
  capability,variant,rail,now,
  requestFingerprint:"a".repeat(64),preparedAnswerSha256:"d".repeat(64),
  network:"eip155:8453",asset:base,recipient:seller,availabilityVerified:true,preparedAnswerVerified:true,
 });
}
function payload(quote:ReturnType<typeof offer>,requirement:{
 scheme:string;network:string;asset:string;amount:string;payTo:string
 }){
 return {x402Version:2,accepted:{...requirement},
 extensions:capabilityQuotePaymentExtension(quote,now)};
}
const pairs=Object.entries(GEOMACRO_CAPABILITY_PRICES).flatMap(([cap,variants])=>
 Object.keys(variants).map(v=>[cap,v] as const));
describe("approved capability x402 exact payments, NO FUNDS",()=>{
 it.each(pairs)("locks Coinbase and Circle %s / %s with byte-bound claim", (cap,variant)=>{
  const coinQuote=offer(cap,variant,"coinbase_x402");
  const circleQuote=offer(cap,variant,"circle_gateway_x402");
  const expected=resolveGeomacroCapabilityPrice(cap,variant).amount_atomic;
  const cb=coinbaseRequirementsForCapabilityQuote(coinbase,coinQuote,now);
  const cr=circleRequirementsForCapabilityQuote(circle,supported,circleQuote,now);
  expect(cb.amount).toBe(expected);
  expect(cr.amount).toBe(expected);
  expect(cb.payTo).toBe(seller);
  expect(cr.payTo).toBe(seller);
  expect(()=>assertCapabilityPaymentBinding(payload(coinQuote,cb),coinQuote,cb,now)).not.toThrow();
  expect(()=>assertCapabilityPaymentBinding(payload(circleQuote,cr),circleQuote,cr,now)).not.toThrow();
  expect(capabilityLedgerRequestFingerprint(coinQuote,now)).toMatch(/^[0-9a-f]{64}$/);
  expect(capabilityLedgerRequestFingerprint(coinQuote,now)).not.toBe(
    capabilityLedgerRequestFingerprint(circleQuote,now));
 });
 it("rejects undercharge, overcharge, altered buyer quote and provider swap",()=>{
  const q=offer("risk_gate_bundle","complex_multi_source","coinbase_x402");
  const r=coinbaseRequirementsForCapabilityQuote(coinbase,q,now);
  for(const amount of ["49999","50001","249999","300000"]){
   const p=payload(q,{...r,amount});
   expect(()=>assertCapabilityPaymentBinding(p,q,r,now)).toThrow();
  }
  const p=payload(q,r);
  expect(()=>assertCapabilityPaymentBinding({...p,extensions:{geomacro:{info:{
    capability_quote:{...q,variant:"standard"}
  }}}},q,r,now)).toThrow();
  for(const swapped of [
    {...r,network:"eip155:84532"},
    {...r,asset:"0x"+"a".repeat(40)},
    {...r,payTo:"0x"+"a".repeat(40)},
  ]){
   expect(()=>assertCapabilityPaymentBinding(payload(q,swapped),q,r,now)).toThrow();
  }
  expect(()=>circleRequirementsForCapabilityQuote(circle,supported,q,now)).toThrow();
  expect(()=>coinbaseRequirementsForCapabilityQuote({...coinbase,payTo:"0x"+"a".repeat(40)},q,now)).toThrow();
 });
 it("enforces expiry, prepared bytes identity and quote/ledger isolation",()=>{
  const q=offer("risk_gate_bundle","standard","coinbase_x402");
  const r=coinbaseRequirementsForCapabilityQuote(coinbase,q,now);
  expect(()=>assertCapabilityPaymentBinding(payload(q,r),q,r,
   new Date("2026-10-15T09:05:00Z"))).toThrow("CAPABILITY_PREPARED_QUOTE_EXPIRED");
  const changed=offer("signed_risk_object","existing_valid_signed","coinbase_x402");
  expect(changed.quote_id).not.toBe(q.quote_id);
  expect(capabilityLedgerRequestFingerprint(changed,now)).not.toBe(
    capabilityLedgerRequestFingerprint(q,now));
  expect(()=>assertAcceptedCapabilityQuote({...q,prepared_answer_sha256:undefined} as unknown as typeof q,now)).toThrow();
  expect(()=>assertAcceptedCapabilityQuote({...q,prepared_answer_sha256:"f".repeat(64)},now)).toThrow();
  expect(()=>quoteGeomacroPreparedCapability({
    capability:"risk_gate_bundle",variant:"premium",rail:"coinbase_x402",
    requestFingerprint:"a".repeat(64),preparedAnswerSha256:"d".repeat(64),
    network:"eip155:8453",asset:base,recipient:seller,
    availabilityVerified:true,preparedAnswerVerified:true,now,
  })).toThrow();
 });
 it("does not double-charge included Risk Objects for any Risk Gate variant",()=>{
  for(const v of Object.keys(GEOMACRO_CAPABILITY_PRICES.risk_gate_bundle)){
   const q=offer("risk_gate_bundle",v,"coinbase_x402");
   expect(q.included_signed_object_charge).toBe("INCLUDED_NO_DOUBLE_CHARGE");
   expect(coinbaseRequirementsForCapabilityQuote(coinbase,q,now).amount).toBe(q.amount_atomic);
  }
 });
});
