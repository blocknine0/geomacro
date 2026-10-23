import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCanonical195Codes,rollupCountry195Proofs}
 from "../lib/country-195-proof-rollup.mjs";
import {reconcileCountry195OriginalWithSignedReview as run}
 from "../lib/country-195-commercial-original-review-join.mjs";
const registry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const codes=parseCanonical195Codes(registry);
const now=new Date("2026-10-23T12:00:00.000Z");
const empty=()=>rollupCountry195Proofs([],codes,{now});
const invoke=(patch={})=>run({
 rolling:empty(),canonicalCountrySource:registry,
 now,signedReviewRows:[],signedEventPackages:[],...patch
});
test("585 exact canonical cells remain proof-unverified without real original and independent review",()=>{
 const x=invoke();
 assert.equal(x.schema,"geomacro.country-195x3-original-independent-review-readiness.v1");
 assert.equal(x.exact_cells_evaluated,585);
 assert.equal(x.per_country_category.length,585);
 assert.equal(x.missing_country_category_cells.length,585);
 assert.equal(x.signed_commercial_delivery_cells_verified,0);
 assert.equal(x.entire_195x3_commercial_live_coverage_verified,false);
 assert.equal(x.x402_charge_authorized,false);
 assert.deepEqual(x.per_country_category.find(c=>c.iso3==="VAT"&&c.category==="rare_earth"),{
  iso3:"VAT",category:"rare_earth",status:"COUNTRY_NOT_PROBED",
  current_original_probe_verified:false,
  genuine_independent_signed_event_review_verified:false,
  qualifying_signed_review_event_count:0,
  both_prepublication_gates_met:false,
  signed_commercial_product_readback_verified:false,charge_authorized:false,
 });
});
test("A genuinely probed first-party original is only pre-review, not independently reviewed or licensed",()=>{
 const r=empty();
 const cell=r.cells.find(c=>c.iso3==="USA"&&c.category==="macro");
 cell.current_original_proof_verified=true;
 cell.status="CURRENT_ORIGINAL_PROOF_VERIFIED";
 cell.last_probe_at=now.toISOString();
 // A report's aggregate original count is separate from cryptographic
 // reviewer packages and cannot be promoted as a licensed delivery.
 const x=invoke({rolling:r});
 assert.equal(x.original_source_probe_cells,1);
 assert.equal(x.genuinely_independent_signed_review_cells,0);
 assert.equal(x.both_prepublication_gates_verified,0);
 assert.equal(x.per_country_category.find(c=>c.iso3==="USA"&&c.category==="macro").status,
 "ORIGINAL_READBACK_ACCEPTED_INDEPENDENT_REVIEW_REQUIRED");
 assert.equal(x.paid_delivery_enabled,false);
});
test("A forged positive reviewer row without real Ed25519 event-package proof is rejected",()=>{
 assert.throws(()=>invoke({
  signedReviewRows:[{iso3:"USA",category:"macro",signed:true}],
  signedEventPackages:[{fake:"approval"}],trustedReviewerPublicKeyPem:"FAKE_PEM",
 }),/COUNTRY_EVENT_EVIDENCE_|INDEPENDENT_|SOURCE_|REVIEW_|INVALID_/);
});
test("Do not accept manual source flags, duplicated ISO category, wrong denominators or stale report",()=>{
 const tests=[
  r=>{r.cells[0].current_original_proof_verified=true},
  r=>{r.cells[1]=r.cells[0]},
  r=>{r.total_expected_cells=750},
  r=>{r.unprobed_cells=0},
  r=>{r.as_of="2026-10-22T10:00:00Z"},
  r=>{r.cells[0].iso3="ZZZ"},
 ];
 for(const mutate of tests){
  const r=empty();mutate(r);
  assert.throws(()=>invoke({rolling:r}),/COUNTRY_195_COMMERCIAL_EVIDENCE_/);
 }
});
test("Unverifiable signed review rows don't become commercial scores or source rights",()=>{
 const r=empty();
 const clean=invoke({rolling:r});
 assert.equal(clean.input_signed_reviewer_event_count,0);
 assert.equal(clean.independent_B2_D1_product_readback_per_country_verified,false);
 assert.equal(clean.raw_articles_or_original_urls_present,false);
 assert.equal(clean.b2_requests,0);
 assert.equal(clean.d1_writes,0);
 assert.equal(clean.payments,0);
});
