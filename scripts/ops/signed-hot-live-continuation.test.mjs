import {test} from "node:test";
import assert from "node:assert/strict";
import {planSignedHotContinuation} from "./signed-hot-live-continuation.mjs";
const fields=["intelligence","global-risk","risk-indices"];
function fixture(ages={intelligence:12,"global-risk":12,"risk-indices":12}){
 return {schema:"geomacro.signed-hot-expiry-early-warning.v1",
 products:Object.fromEntries(fields.map(key=>[key,{
   status:"WITHIN_WINDOW",source_age_minutes:ages[key],
   live_freshness_eligible:ages[key]<=60,
 }]))};
}
test("warning at 45min gives the 15m genuine-source lead",()=>{
 const p=planSignedHotContinuation(fixture({intelligence:44,"global-risk":45,"risk-indices":45}));
 assert.equal(p.currentness.intelligence.state,"LIVE_METADATA_WINDOW");
 assert.equal(p.currentness["global-risk"].state,"LIVE_RENEWAL_DUE");
 assert.equal(p.currentness["risk-indices"].original_source_minutes_remaining,15);
 assert.equal(p.all_three_live_metadata_current,false);
 assert.equal(p.three_public_signed_products_verified,false);
});
test("expired GRI locks dependent indices, even if their own D1 row appears recent",()=>{
 const f=fixture();
 f.products["global-risk"].status="EXPIRED";
 f.products["global-risk"].live_freshness_eligible=false;
 const p=planSignedHotContinuation(f);
 // The child must never remain independently eligible when its parent
 // cannot serve current, regardless of a newer child-looking D1 clock.
 assert.ok(p.blocking.includes("INDICES_WAIT_FOR_AUTHENTIC_CURRENT_GRI_PARENT"));
 assert.equal(p.currentness["risk-indices"].state,"WAITING_FOR_CURRENT_SIGNED_GRI_PARENT");
 assert.equal(p.currentness["global-risk"].state,"EXPIRED");
 assert.equal(p.three_public_signed_products_verified,false);
});
test("child renewal only after a fresh GRI parent is available",()=>{
 const f=fixture({intelligence:12,"global-risk":12,"risk-indices":79});
 const p=planSignedHotContinuation(f);
 assert.ok(p.blocking.includes("INDICES_REBUILD_FROM_VERIFIED_CURRENT_GRI_PARENT"));
 assert.equal(p.currentness["risk-indices"].state,"LIVE_SOURCE_TOO_OLD");
});
test("all within D1 age still requires exact three public cryptographic proofs",()=>{
 const p=planSignedHotContinuation(fixture());
 assert.equal(p.all_three_live_metadata_current,true);
 assert.equal(p.immutable_b2_readback_verified,false);
 assert.equal(p.signatures_generated,false);
 assert.equal(p.paid_settlement_authorized,false);
 assert.equal(p.three_public_signed_products_verified,false);
});
test("no secrets, original source, payment or unsupported status in diagnosis",()=>{
 const f=fixture();
 f.products.intelligence.article="VERY_PRIVATE_ORIGINAL";
 f.products.intelligence.token="DO_NOT_LOG";
 const p=planSignedHotContinuation(f);
 assert.ok(!JSON.stringify(p).includes("VERY_PRIVATE_ORIGINAL"));
 assert.ok(!JSON.stringify(p).includes("DO_NOT_LOG"));
 assert.throws(()=>planSignedHotContinuation({...f,products:{...f.products,intelligence:{status:"FORGED"}}}));
});
