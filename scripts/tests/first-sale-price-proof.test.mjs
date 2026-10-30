import test from "node:test";
import assert from "node:assert/strict";
import {verifyFirstSalePriceManifest} from "../agentic/first-sale-price-proof.mjs";
const valid={
 schema:"geomacro.public-launch-pricing-catalog.v2",
 pricing_version:"geomacro.capability-usdc.v2",
 pricing_status:"FOUNDER_APPROVED_LOW_BARRIER_PRECHECKOUT",
 payment_authorized:false,money_transferred:false,
 x402_payment_requirement_issued:false,source_and_rights_required:true,
 capabilities:[{capability:"structural_country_digest",variants:[{
  variant:"standard",price_usdc:"0.02",amount_atomic:"20000",
  currency:"USDC",decimals:6,output_contract:"GEOMACRO_DERIVED_STRUCTURED_ONLY",
  structured_delivery:{fields:["observation","limitations"]},
  included_signed_object_charge:"NOT_APPLICABLE"
 }]}]
};
test("first sale pilot accepts only owner-approved 0.02 USDC as a nonpayable catalog entry",()=>{
 const p=verifyFirstSalePriceManifest(valid);
 assert.equal(p.catalog_only_usdc,"0.02");
 assert.equal(p.catalog_only_atomic,"20000");
 assert.equal(p.payable_quote_verified,false);
 assert.equal(p.real_money_authorized,false);
});
test("marketplace or client pricing cannot replace the authoritative founder schedule",()=>{
 for(const patch of [
  {payment_authorized:true},{money_transferred:true},
  {x402_payment_requirement_issued:true},{source_and_rights_required:false},
  {capabilities:[]},{capabilities:[valid.capabilities[0],valid.capabilities[0]]},
  {capabilities:[{...valid.capabilities[0],variants:[{...valid.capabilities[0].variants[0],price_usdc:"0.05"}]}]},
  {capabilities:[{...valid.capabilities[0],variants:[{...valid.capabilities[0].variants[0],amount_atomic:"50000"}]}]},
  {capabilities:[{...valid.capabilities[0],variants:[{...valid.capabilities[0].variants[0],structured_delivery:null}]}]}
 ]) assert.throws(()=>verifyFirstSalePriceManifest({...valid,...patch}),/FIRST_SALE_/);
});
