import test from "node:test";
import assert from "node:assert/strict";
import {evaluateSourceContinuity} from "../lib/195x3-source-continuity.mjs";
const SHA="a".repeat(64),MORE="b".repeat(64);
const clock=new Date("2026-10-29T12:00:00Z");
const candidate=(id,family,status="OK",overrides={})=>({
  country_iso3:"USA",category:"geopolitics",
  source_id:id,publisher_family:family,source_kind:"ORIGINAL_FIRST_PARTY",
  registered_publisher_adapter:true,
  commercial_rights_status:"REVIEWED_ELIGIBLE",
  original_evidence_sha256:SHA,corroboration_receipt_sha256:MORE,
  original_published_at:"2026-10-29T10:00:00Z",
  last_probe:{status,checked_at:"2026-10-29T11:45:00Z"},
  ...overrides,
});
test("unavailable source retains last good reference but never marks payment allowed",()=>{
 const r=evaluateSourceContinuity({country_iso3:"USA",category:"geopolitics",
   candidates:[candidate("first.gov","first", "HTTP_503".replace("503","5XX"))],
   last_good:{country_iso3:"USA",category:"geopolitics",
     original_published_at:"2026-10-25T10:00:00Z",verified_sha256:SHA},now:clock});
 assert.equal(r.continuity_state,"ARCHIVE_ONLY_NO_CURRENT_VERIFIED_SOURCE");
 assert.equal(r.last_good_reference.archive_never_claims_new_observation,true);
 assert.equal(r.last_good_reference.stale_for_current_product,true);
 assert.equal(r.commercial_delivery_authorized,false);
 assert.equal(r.retry_pending,true);
});
test("reviewed alternate official family is a candidate, NOT automatically payable",()=>{
 const r=evaluateSourceContinuity({country_iso3:"USA",category:"geopolitics",now:clock,
   candidates:[candidate("first.gov","first","HTTP_5XX"),
     candidate("second.gov","second","OK")]});
 assert.equal(r.selected_source_candidate,"second.gov");
 assert.equal(r.current_verified_source_candidates,1);
 assert.equal(r.commercial_delivery_authorized,false);
 assert.equal(r.signed_country_object_verified,false);
});
test("two independent original families are distinct, repeated same family is not",()=>{
 const r=evaluateSourceContinuity({country_iso3:"USA",category:"geopolitics",now:clock,
  candidates:[candidate("first.gov","first"),candidate("second.gov","first")]});
 assert.equal(r.current_distinct_publisher_families,1);
 assert.equal(r.alternate_independent_family_available,false);
});
test("no original proof, rights denied, stale or bad native time cannot become current",()=>{
 for(const overrides of [
   {commercial_rights_status:"DENIED"},
   {original_evidence_sha256:null},
   {original_published_at:"2026-01-01T00:00:00Z"},
   {original_published_at:null},
   {corroboration_receipt_sha256:null}
 ]){
  const r=evaluateSourceContinuity({country_iso3:"USA",category:"macro",now:clock,
   candidates:[candidate("first.gov","first","OK",{category:"macro",...overrides})]});
  assert.equal(r.current_verified_source_candidates,0);
  assert.equal(r.commercial_delivery_authorized,false);
 }
});
test("HTTP 401/403 does not trigger a bypass; 429 uses retry cooldown",()=>{
 const denied=evaluateSourceContinuity({country_iso3:"USA",category:"rare_earth",now:clock,
   candidates:[candidate("first.gov","first","HTTP_403",{category:"rare_earth"})]});
 assert.equal(denied.source_health_candidates[0].live,"OPERATOR_REVIEW_REQUIRED");
 assert.equal(denied.retry_pending,false);
 const throttle=evaluateSourceContinuity({country_iso3:"USA",category:"rare_earth",now:clock,
  candidates:[candidate("first.gov","first","HTTP_429",{category:"rare_earth"})]});
 assert.equal(throttle.source_health_candidates[0].live,"CIRCUIT_OPEN");
 assert.equal(throttle.retry_pending,true);
});
test("never rebrand another country's publisher proof as local evidence",()=>{
 assert.throws(()=>evaluateSourceContinuity({country_iso3:"USA",category:"macro",now:clock,
   candidates:[candidate("first.gov","first","OK",{category:"macro",country_iso3:"IND"})]}),
   /SCOPE|UNTRUSTED/);
 assert.throws(()=>evaluateSourceContinuity({country_iso3:"USA",category:"macro",now:clock,
   candidates:[candidate("first.gov","first","OK",{category:"macro"}),
     candidate("first.gov","first","OK",{category:"macro"})]}),/DUPLICATE/);
});
