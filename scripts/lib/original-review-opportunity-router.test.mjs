import test from "node:test";
import assert from "node:assert/strict";
import {chooseOriginalReviewCountry,ORIGINAL_REVIEW_PUBLISHER_HUBS}
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
