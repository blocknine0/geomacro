import test from "node:test";
import assert from "node:assert/strict";
import {inspectHot50TierResponse,HOT50_CATEGORY_KEYS} from "./hot50-production-proof.mjs";
const price={tier:"STANDARD",usd_per_call:"0.15",usdc_atomic:"150000"};
const now=Date.parse("2026-11-06T12:00:00Z");
const categories=Object.fromEntries(HOT50_CATEGORY_KEYS.map(k=>[k,{status:"VERIFIED_SIGNED_GRO"}]));
function response(){
 return {ok:true,target_type:"COUNTRY",target_id:"USA",categories:structuredClone(categories),
  policy_evaluation_has_complete_verified_score:true,
  verified_live_scoring:{trusted_signed_gro_verified:true,
   gro_generated_at:"2026-11-06T11:20:00Z",gro_expires_at:"2026-11-06T14:20:00Z",
   category_scores:{GEOPOLITICS:.2,MACRO_FX:0,CRITICAL_MINERALS:.6}},
  tiered_product:{subject:{type:"COUNTRY",id:"USA"},tier:"STANDARD",
   price:{usd_per_call:"0.15",usdc_atomic_at_1_usdc_per_usd:"150000"},
   status:"READY",execution_authorized:false,charged:false}};
}
const inspect=(body,httpStatus=200)=>inspectHot50TierResponse({country:"USA",tier:"standard",price,httpStatus,body,now});
test("requires exact three-domain live signed proof and price contract",()=>{
 const got=inspect(response());
 assert.equal(got.ready,true);
 assert.equal(got.contract_valid,true);
 assert.equal(got.verified_current_three_category,true);
 assert.equal(Object.keys(got.category_statuses).length,3);
 assert.doesNotMatch(JSON.stringify(got),/source_ids|private|signature|tokens/);
});
test("Basic/Standard READY is not proof of live signed three-domain cells",()=>{
 const body=response();
 body.policy_evaluation_has_complete_verified_score=false;
 body.verified_live_scoring.trusted_signed_gro_verified=false;
 body.categories.MACRO_FX.status="OBSERVED_UNVERIFIED";
 const got=inspect(body);
 assert.equal(got.ready,true);
 assert.equal(got.verified_current_three_category,false);
});
test("expiry, missing category, unknown categories, bad prices and charged response fail closed",()=>{
 for(const change of [
  b=>{b.verified_live_scoring.gro_expires_at="2026-11-06T11:00:00Z"},
  b=>{b.verified_live_scoring.category_scores.CRITICAL_MINERALS=null},
 ]){
  const b=response();change(b);
  assert.equal(inspect(b).verified_current_three_category,false);
 }
 for(const change of [
  b=>{delete b.categories.CRITICAL_MINERALS},
  b=>{b.categories.SUPERFLUOUS={status:"VERIFIED_SIGNED_GRO"}},
  b=>{b.categories.MACRO_FX.status="UNKNOWN"},
  b=>{b.tiered_product.price.usd_per_call="0.25"},
  b=>{b.tiered_product.charged=true},
  b=>{b.target_id="CHN"},
 ]){
  const b=response();change(b);
  assert.equal(inspect(b).contract_valid,false);
  assert.equal(inspect(b).ready,false);
 }
 assert.equal(inspect(response(),503).contract_valid,false);
});

test("a claimed signed score never upgrades an observed-only cell to verified",()=>{
 const body=response();
 body.categories.MACRO_FX.status="OBSERVED_UNVERIFIED";
 const got=inspect(body);
 assert.equal(got.contract_valid,true);
 assert.equal(got.verified_current_three_category,false);
 assert.equal(got.category_statuses.MACRO_FX,"OBSERVED_UNVERIFIED");
});
