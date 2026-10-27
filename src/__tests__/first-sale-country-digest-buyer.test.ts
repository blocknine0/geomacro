import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {GEOMACRO_USDC_NATIVE_RAILS} from "../lib/usdc-native-rail-identities";
import {
 FIRST_SALE_CAPABILITY,FIRST_SALE_VARIANT,FIRST_SALE_PRICE,
 FIRST_SALE_TOPIC_BY_CATEGORY,buildFirstSaleCountryDigestRequest,
 acceptFirstSaleNoFundsPreflight,validateFirstSaleCountryDigestQuote,
} from "../lib/first-sale-country-digest-buyer";

const eligible={
 ok:true,schema_version:"geomacro.earn-first-preflight.v1",
 delivery_tier:"structural_baseline",chargeable:false,
 payment_required_now:false,execution_authorized:false,
 query_plan_hash:"a".repeat(64),status:"ELIGIBLE_FOR_X402_QUOTE",
 payment_rail_ready:true
};
const origin="https://geomacro.live";
function quote(capability:string=FIRST_SALE_CAPABILITY,variant:string=FIRST_SALE_VARIANT){
 const rail=GEOMACRO_USDC_NATIVE_RAILS.base;
 const payTo="0x1111111111111111111111111111111111111111";
 return {
  x402Version:2,
  resource:{url:origin+"/api/v1/intelligence/query",mimeType:"application/json"},
  accepts:[{scheme:"exact",network:rail.caip2,asset:rail.asset,
   amount:FIRST_SALE_PRICE.amount_atomic,payTo,maxTimeoutSeconds:60,
   extra:{name:"USDC",version:"2"}}],
  extensions:{geomacro:{info:{execution_authorized:false,
   capability_quote:{quote_id:"b".repeat(64),prepared_answer_sha256:"c".repeat(64),
    version:FIRST_SALE_PRICE.version,recipient:payTo.toLowerCase(),
    network:rail.caip2,asset_contract:rail.asset.toLowerCase(),
    capability,variant,amount_usdc:FIRST_SALE_PRICE.amount_usdc,
    amount_atomic:FIRST_SALE_PRICE.amount_atomic,expires_at:"2026-11-01T12:00:00Z"}
  }}}
 };
}
describe("first real-sale country digest buyer contract (zero funds)",()=>{
 it("binds all 3 domains to exactly one existing 0.02 country digest; no fake signed product",()=>{
  expect(FIRST_SALE_PRICE.amount_usdc).toBe("0.02");
  expect(FIRST_SALE_PRICE.amount_atomic).toBe("20000");
  expect(Object.keys(FIRST_SALE_TOPIC_BY_CATEGORY)).toHaveLength(3);
  for(const category of Object.keys(FIRST_SALE_TOPIC_BY_CATEGORY) as
      (keyof typeof FIRST_SALE_TOPIC_BY_CATEGORY)[]){
   const raw=buildFirstSaleCountryDigestRequest(category,"ind","buyer-0001");
   const parsed=JSON.parse(raw);
   expect(parsed.product).toEqual({capability:"structural_country_digest",variant:"standard"});
   expect(parsed.delivery_tier).toBe("structural_baseline");
   expect(parsed.fulfillment_mode).toBe("published_only");
   expect(parsed.topics).toEqual([FIRST_SALE_TOPIC_BY_CATEGORY[category]]);
   expect(parsed.subjects).toEqual([{type:"country",country_iso3:"IND"}]);
   expect(parsed.question).toBeUndefined();
   expect(raw).not.toContain("signed_risk_object");
   expect(raw).not.toContain("risk_gate");
   expect(raw).not.toContain("payment-signature");
  }
  expect(()=>buildFirstSaleCountryDigestRequest("macro-fx","IND;DROP","buyer-0001"))
   .toThrow("FIRST_SALE_REQUEST_INVALID");
 });
 it("does not contact a payment endpoint on stale, unavailable or merchant-locked inputs",()=>{
  for(const status of [422,429,503,400])
   expect(acceptFirstSaleNoFundsPreflight(status,{error:"private"}).quote_ready).toBe(false);
  expect(acceptFirstSaleNoFundsPreflight(200,{
   ...eligible,status:"ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED",payment_rail_ready:false
  })).toEqual({quote_ready:false,state:"MERCHANT_RAIL_LOCKED"});
  expect(acceptFirstSaleNoFundsPreflight(200,eligible).quote_ready).toBe(true);
  for(const bad of [
   {...eligible,chargeable:true},{...eligible,payment_required_now:true},
   {...eligible,execution_authorized:true},
   {...eligible,query_plan_hash:"bad"},
   {...eligible,payment_rail_ready:false},
   {...eligible,delivery_tier:"signed_risk_intelligence"}
  ])expect(()=>acceptFirstSaleNoFundsPreflight(200,bad)).toThrow();
 });
 it("rejects expensive variant, GRO substitution, wrong receiver and stale quote",()=>{
  const now=Date.parse("2026-10-27T12:00:00Z");
  expect(validateFirstSaleCountryDigestQuote(quote(),origin,now).amount_usdc).toBe("0.02");
  expect(()=>validateFirstSaleCountryDigestQuote(quote("risk_gate_bundle","standard"),origin,now)).toThrow();
  expect(()=>validateFirstSaleCountryDigestQuote(quote("structural_corridor_digest","standard"),origin,now)).toThrow();
  const invalid=quote();
  invalid.accepts[0].payTo="0x"+"0".repeat(40);
  expect(()=>validateFirstSaleCountryDigestQuote(invalid,origin,now)).toThrow();
  expect(()=>validateFirstSaleCountryDigestQuote(quote(),origin,Date.parse("2026-12-01T00:00:00Z"))).toThrow();
 });
 it("Store links to exact no-funds launch panel and retains unlocked price authority",()=>{
  const pricing=readFileSync("src/routes/pricing.tsx","utf8");
  const panel=readFileSync("src/components/category-api-launch-panel.tsx","utf8");
  expect(pricing).toContain('<CategoryApiLaunchPanel initialMode="country_digest" />');
  expect(panel).toContain('buildFirstSaleCountryDigestRequest');
  expect(panel).toContain('acceptFirstSaleNoFundsPreflight');
  expect(panel).toContain('validateFirstSaleCountryDigestQuote');
  expect(panel).toContain('new URL("/api/v1/intelligence/query",window.location.origin)');
  expect(panel).toContain('"PAYMENT-SIGNATURE":payment.proof');
  expect(panel).toContain("Qualified country digest found, but merchant settlement is not active. No payment requested.");
  expect(panel).not.toContain('COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC');
 });
});
