import {describe,expect,it} from "vitest";
import {GEOMACRO_CAPABILITY_PRICES,GEOMACRO_CAPABILITY_PRICING_VERSION,
  capabilityPricingCatalog,quoteGeomacroCapability,resolveGeomacroCapabilityPrice,
  usdcDecimalToAtomic,verifyGeomacroCapabilityQuote} from "./capability-pricing";
import {GEOMACRO_CREDIT_COSTS} from "./commercial-access-contract";

const FIXED=[
 ["gri_read","verified_cached","0.005","5000"],
 ["gri_read","verified_change_attribution","0.01","10000"],
 ["structural_country_digest","standard","0.02","20000"],
 ["structural_corridor_digest","standard","0.03","30000"],
 ["structural_country_profile","standard","0.03","30000"],
 ["structural_corridor_profile","standard","0.05","50000"],
 ["intelligence_query","focused","0.02","20000"],
 ["intelligence_query","standard","0.03","30000"],
 ["intelligence_query","complex_multi_source","0.05","50000"],
 ["signed_risk_object","existing_valid_signed","0.03","30000"],
 ["signed_risk_object","newly_qualified_signed","0.05","50000"],
 ["risk_gate_bundle","existing_proof_preflight","0.03","30000"],
 ["risk_gate_bundle","standard","0.05","50000"],
 ["risk_gate_bundle","complex_multi_source","0.05","50000"],
] as const;
const now=new Date("2026-10-15T00:02:00.000Z");
const opts={capability:"risk_gate_bundle",variant:"complex_multi_source",
 requestFingerprint:"c".repeat(64),network:"eip155:8453",
 asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
 recipient:"0x"+"a".repeat(40),rail:"coinbase_x402" as const,
 availabilityVerified:true,now};
describe("founder-approved deterministic capability pricing — NO FUNDS",()=>{
 it.each(FIXED)("locks %s / %s to %s USDC = %s atomic", (cap,variant,usdc,atomic)=>{
   expect(resolveGeomacroCapabilityPrice(cap,variant)).toMatchObject({
     capability:cap,variant,amount_usdc:usdc,amount_atomic:atomic,
     version:GEOMACRO_CAPABILITY_PRICING_VERSION,
   });
   expect(usdcDecimalToAtomic(usdc)).toBe(atomic);
 });
 it("catalog has exactly 8 product IDs, identical to independent CREDIT accounting",()=>{
   const catalog=capabilityPricingCatalog();
   expect(catalog.map(x=>x.capability).sort()).toEqual(Object.keys(GEOMACRO_CREDIT_COSTS).sort());
   expect(catalog).toHaveLength(8);
   expect(catalog.reduce((n,x)=>n+x.variants.length,0)).toBe(FIXED.length);
   expect(GEOMACRO_CREDIT_COSTS.gri_read).toBe(1);
   expect(GEOMACRO_CREDIT_COSTS.risk_gate_bundle).toBe(15);
   expect(Object.keys(GEOMACRO_CAPABILITY_PRICES).length).toBe(8);
 });
 it("retires new gri_read quotes without rewriting signed historical rates",()=>{
    expect(()=>quoteGeomacroCapability({...opts,capability:"gri_read",variant:"verified_cached"}))
      .toThrow("CAPABILITY_RETIRED_NO_CHARGE");
    expect(resolveGeomacroCapabilityPrice("gri_read","verified_cached").amount_atomic).toBe("5000");
  });
 it("does not float-convert money, invent variants or charge outside bounds",()=>{
   for(const value of ["0","0.0000001","0.0010e2","-0.01","00.01",
     "0.250001","0.50","1","Infinity","","0.05 USDC"]){
     expect(()=>usdcDecimalToAtomic(value)).toThrow();
   }
   for(const [cap,v] of [["gri_read","complex"],["intelligence_query","premium"],
     ["risk_gate_bundle","plus_signed_object"],["unknown","standard"]]){
     expect(()=>resolveGeomacroCapabilityPrice(cap,v)).toThrow();
   }
 });
 it("risk gate is ONE bundled quote without extra signed-object charge",()=>{
   const risk=resolveGeomacroCapabilityPrice("risk_gate_bundle","standard");
   expect(risk.amount_atomic).toBe("50000");
   expect(risk.included_signed_object_charge).toBe("INCLUDED_NO_DOUBLE_CHARGE");
   const one=resolveGeomacroCapabilityPrice("signed_risk_object","existing_valid_signed");
   expect(one.included_signed_object_charge).toBe("NOT_APPLICABLE");
 });
 it("binds exact capability/variant, query fingerprint, chain, USDC, recipient, rail and quote expiry",()=>{
   const first=quoteGeomacroCapability(opts);
   expect(first).toMatchObject({amount_atomic:"50000",amount_usdc:"0.05",
     issued_at:"2026-10-15T00:00:00.000Z",expires_at:"2026-10-15T00:05:00.000Z",
     execution_authorized:false});
   expect(quoteGeomacroCapability({...opts,now:new Date("2026-10-15T00:04:59.999Z")}))
     .toEqual(first);
   expect(()=>verifyGeomacroCapabilityQuote(first,first,new Date("2026-10-15T00:05:00Z")))
     .toThrow("CAPABILITY_QUOTE_EXPIRED");
   expect(()=>verifyGeomacroCapabilityQuote(first,first,now)).not.toThrow();
   for(const modified of [
     {capability:"signed_risk_object"},
     {variant:"existing_proof_preflight"},
     {requestFingerprint:"d".repeat(64)},
     {network:"eip155:84532"},
     {asset:"0x"+"b".repeat(40)},
     {recipient:"0x"+"b".repeat(40)},
     {rail:"circle_gateway_x402" as const},
   ]){
     // Wrong/unauthorized variants fail at resolution, never return old valid quote.
     let changed;
     try{changed=quoteGeomacroCapability({...opts,...modified});}catch{continue;}
     expect(changed.quote_id).not.toBe(first.quote_id);
     expect(()=>verifyGeomacroCapabilityQuote(first,changed,now)).toThrow();
   }
   expect(()=>quoteGeomacroCapability({...opts,availabilityVerified:false}))
     .toThrow("CAPABILITY_NOT_DELIVERABLE_NO_CHARGE");
   expect(()=>verifyGeomacroCapabilityQuote({...first,amount_atomic:"50000"},first,now)).toThrow();
   expect(()=>verifyGeomacroCapabilityQuote({...first,price_version:"testnet"},first,now)).toThrow();
 });
});