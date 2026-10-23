import test from "node:test";
import assert from "node:assert/strict";
import {chooseOriginalReviewCountry,finalizeOriginalReviewCountry,ORIGINAL_REVIEW_PUBLISHER_HUBS}
 from "./original-review-opportunity-router.mjs";

const REGISTRY=new Set([...ORIGINAL_REVIEW_PUBLISHER_HUBS,"VAT","PSE","MWI"]);
const select=hour=>chooseOriginalReviewCountry({
 now:new Date(hour*3_600_000),
 fairnessCountryForRun:at=>{
  const n=Math.floor(at.getTime()/3_600_000);
  return ["VAT","PSE","MWI"][((n%3)+3)%3];
 },
 existsInRegistry:code=>REGISTRY.has(code)
});
test("every fourth UTC hour is a guaranteed CANONICAL country fairness slot, not an issuer-biased bypass",()=>{
 const all=Array.from({length:120},(_,i)=>select(i));
 assert.equal(all.filter((x,i)=>i%4===0&&x.selection_mode==="CANONICAL_195_FAIRNESS_ORIGINAL_REVIEW").length,30);
 assert.equal(all.filter((x,i)=>i%4!==0&&x.selection_mode==="FIRST_PARTY_ISSUER_OPPORTUNITY_HEURISTIC").length,90);
 assert.deepEqual(all.filter((_,i)=>i%4===0).slice(0,6).map(x=>x.country_iso3),
  ["VAT","PSE","MWI","VAT","PSE","MWI"]);
 assert.ok(all.every(x=>x.network_requests_added===0&&
  x.verification_guaranteed===false&&
  x.category_coverage_verified===false&&
  x.commercial_rights_verified===false));
});
test("all independently pinned original-issuer country subjects receive bounded repeats, not just UK",()=>{
 const sites=new Set();
 for(let h=0;h<17;h++){
  if(h%4!==0)sites.add(select(h).country_iso3);
 }
 assert.deepEqual([...sites].sort(),[...ORIGINAL_REVIEW_PUBLISHER_HUBS].sort());
 assert.equal(select(1).country_iso3,select(1).country_iso3);
 assert.equal(select(1).country_iso3,select(1.25).country_iso3);
});
test("fail-closed if hub drift, missing canonical country registry, clock or origin selection",()=>{
 assert.throws(()=>chooseOriginalReviewCountry({
  now:new Date(NaN),fairnessCountryForRun:()=> "VAT",
  existsInRegistry:()=>true
 }),/ORIGINAL_REVIEW_OPPORTUNITY_ROUTER_INVALID/);
 assert.throws(()=>chooseOriginalReviewCountry({
  now:new Date(0),fairnessCountryForRun:()=> "NOT_A_COUNTRY",
  existsInRegistry:()=>true
 }),/ORIGINAL_REVIEW_OPPORTUNITY_ROUTER_INVALID/);
 assert.throws(()=>chooseOriginalReviewCountry({
  now:new Date(),fairnessCountryForRun:()=> "VAT",
  existsInRegistry:code=>code!=="CAN"
 }),/ORIGINAL_REVIEW_OPPORTUNITY_ROUTER_INVALID/);
});

test("canonical 195 fairness survives even rich recent unscored journal priorities",()=>{
 const d1={country_iso3:"CAN",selection_mode:"SHARED_D1_RECENT_COUNTRY_LEAD",
   eligible_country_count:9,selected_country_observed_categories:3};
 let fair=0,hubs=0;
 const saw=new Set();
 for(let hour=0;hour<120;hour++){
  const op=select(hour);
  const out=finalizeOriginalReviewCountry({opportunity:op,priority:d1,
    existsInRegistry:code=>REGISTRY.has(code)});
  assert.equal(out.actual_native_source_qualified,false);
  assert.equal(out.review_approved,false);
  assert.equal(out.journal_eligible_countries,9);
  if(hour%4===0){
    fair++;saw.add(out.country_iso3);
    assert.equal(out.country_iso3,op.country_iso3);
    assert.equal(out.fairness_slot_preserved,true);
    assert.equal(out.mode,"CANONICAL_195_FAIRNESS_ORIGINAL_REVIEW");
  }else{
    hubs++;
    assert.equal(out.country_iso3,"CAN");
    assert.equal(out.fairness_slot_preserved,false);
    assert.equal(out.mode,"SHARED_D1_RECENT_COUNTRY_LEAD");
  }
 }
 assert.equal(fair,30);assert.equal(hubs,90);
 assert.deepEqual([...saw].sort(),["MWI","PSE","VAT"]);
});
test("manual owner dispatch wins; invalid priority falls back to issuer hub",()=>{
 const op=select(1);
 const malformed={country_iso3:"EXTERNAL",selection_mode:"SHARED_D1_RECENT_COUNTRY_LEAD",
   eligible_country_count:1};
 const kept=finalizeOriginalReviewCountry({opportunity:op,priority:malformed,
   existsInRegistry:code=>REGISTRY.has(code)});
 assert.equal(kept.country_iso3,op.country_iso3);
 assert.equal(kept.actual_native_source_qualified,false);
 const manual=finalizeOriginalReviewCountry({opportunity:op,priority:malformed,
   manualCountry:"PSE",existsInRegistry:code=>REGISTRY.has(code)});
 assert.equal(manual.country_iso3,"PSE");
 assert.equal(manual.mode,"MANUAL_COUNTRY_ORIGINAL_REVIEW");
 assert.throws(()=>finalizeOriginalReviewCountry({opportunity:op,
   manualCountry:"ZZZ",existsInRegistry:code=>REGISTRY.has(code)}));
});
