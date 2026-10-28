import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reconcileCountry195Publication} from "../lib/reconcile-country-195-publication.mjs";
import {parseCanonical195Codes} from "../lib/country-195-proof-rollup.mjs";
const iso=parseCanonical195Codes(readFileSync("src/lib/canonical-country-registry-195.ts","utf8"));
const C=["geopolitics","macro","rare_earth"],now=new Date("2026-10-22T15:00:00Z");
const rows=()=>iso.flatMap(code=>C.map(category=>({
 iso3:code,category,status:"UNPROBED",last_probe_at:null,
 current_original_proof_verified:false
})));
function fixture(occupied=false){
 const cells=iso.flatMap(code=>C.map(category=>{
  const hit=occupied&&code==="IND"&&category==="geopolitics";
  return {
   country_iso3:code,country_name:code,category,
   status:hit?"DERIVED_COUNTRY_MENTION_OBSERVED_UNVERIFIED":
     "NO_MATCHING_COUNTRY_MENTION_IN_ROLLING_STATIC_ARCHIVE",
   observed_derived_records_72h:hit?1:0,
   classified_topic_releases_72h:hit?1:0,unclassified_candidates_72h:0,
   latest_original_published_at:hit?"2026-10-22T13:00:00Z":null,
   country_subject_verified:false,local_original_publisher_verified:false,
   independent_same_event_verified:false,commercial_rights_verified:false,
   all_news_exhaustive:false,paid_delivery_eligible:false
  };
 }));
 return {
  schema:"geomacro.195x3-public-finds-coverage.v2",
  country_count:195,category_count:3,total_country_category_cells:585,
  returned_cells:585,
  coverage_scope:"OBSERVED_PUBLIC_GEOMACRO_FINDS_IN_PERMANENT_STATIC_ARCHIVE_ROLLING_LATEST_250",
  country_routing_basis:"EXACT_PUBLIC_TITLE_OR_GEOGRAPHY_MENTION_ONLY",
  not_observed_means_no_news:false,
  exhaustive_country_news_coverage_verified:false,
  producer_country_original_coverage_verified:false,
  original_release_delay_minutes:0,retention_hours:72,
  generated_at:now.toISOString(),source_neutral_derived_records_in_public_archive_latest_250:occupied?1:0,
  unassigned_or_regional_derived_records_72h:0,
  observed_derived_records_by_category:{geopolitics:occupied?1:0,macro:0,rare_earth:0},
  payment_required_now:false,chargeable:false,scored:false,signed:false,
  raw_upstream_delivered:false,cells
 };
}
function rolling(){
 return {
  schema:"geomacro.country-195-live-original-proof-rollup.v1",
  total_expected_cells:585,as_of:now.toISOString(),
  cells:rows(),b2_requests:0,supabase_requests:0,payments:0
 };
}
test("actual 195x3 route receipt remains zero current evidence with no source proofs",()=>{
 const x=reconcileCountry195Publication({rolling:rolling(),website:fixture(),now});
 assert.equal(x.examined_cells,585);
 assert.equal(x.verified_source_probe_cells_last_24h,0);
 assert.equal(x.website_country_mentioned_cells_last_72h,0);
 assert.equal(x.unprobed_or_stale_source_cells,585);
 assert.equal(x.domain_totals.macro.neither_current_original_probe_nor_journal_mention,195);
 assert.equal(x["country_195x3_current_signed_commercial_coverage_verified"],false);
 assert.equal(x.payments,0);
});
test("a recent source probe and actual journal are separate and counted once",()=>{
 const a=rolling();
 a.cells.find(x=>x.iso3==="IND"&&x.category==="geopolitics").status="CURRENT_ORIGINAL_PROOF_VERIFIED";
 a.cells.find(x=>x.iso3==="IND"&&x.category==="geopolitics").current_original_proof_verified=true;
 const x=reconcileCountry195Publication({rolling:a,website:fixture(true),now});
 assert.equal(x.verified_source_probe_cells_last_24h,1);
 assert.equal(x.website_country_mentioned_cells_last_72h,1);
 assert.equal(x.source_and_journal_overlap_cells,1);
 assert.equal(x.unprobed_or_stale_source_cells,584);
 assert.equal(x.public_archive_record_total_72h,1);
 assert.equal(x.paid_delivery_authorized,false);
});
test("a website country mention does not promote an unprobed source to verified",()=>{
 const x=reconcileCountry195Publication({rolling:rolling(),website:fixture(true),now});
 assert.equal(x.website_country_mentioned_cells_last_72h,1);
 assert.equal(x.verified_source_probe_cells_last_24h,0);
 assert.equal(x.domain_totals.geopolitics.journal_mention_without_24h_probe_proof,1);
 assert.equal(x.actual_original_fact_rights_certificates_verified,false);
});
test("duplicate, missing, forged signed and stale website rows are rejected",()=>{
 const duplicate=rolling();duplicate.cells[1]={...duplicate.cells[0]};
 assert.throws(()=>reconcileCountry195Publication({rolling:duplicate,website:fixture(),now}),/RECONCILIATION_SOURCE_PROOF_CELL_INVALID/);
 const missing=rolling();missing.cells.pop();
 assert.throws(()=>reconcileCountry195Publication({rolling:missing,website:fixture(),now}),/ROLLUP_MISSING/);
 const signed=fixture();signed.signed=true;
 assert.throws(()=>reconcileCountry195Publication({rolling:rolling(),website:signed,now}),/LIVE_195X3_/);
 const stale=rolling();stale.as_of="2026-10-21T00:00:00Z";
 assert.throws(()=>reconcileCountry195Publication({rolling:stale,website:fixture(),now}),/ROLLUP_STALE/);
 const mismatched=fixture();mismatched.cells[0].country_iso3="ZZZ";
 assert.throws(()=>reconcileCountry195Publication({rolling:rolling(),website:mismatched,now}),/(?:LIVE_195X3_COUNTRY_MATRIX_INCOMPLETE|RECONCILIATION_WEBSITE_COUNTRY_CELL_MISMATCH)/);
});
