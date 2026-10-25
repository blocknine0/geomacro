import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCanonical195Codes,rollupCountry195Proofs} from "../lib/country-195-proof-rollup.mjs";
const known=parseCanonical195Codes(readFileSync("src/lib/canonical-country-registry-195.ts","utf8"));
const now=new Date("2026-10-24T12:00:00.000Z");
const CAT=["geopolitics","macro","rare_earth"];
function mock(start=0,count=3){
 const cells=known.slice(start,start+count).flatMap(iso3=>CAT.map(category=>({
  iso3,category,ROUTING_VERIFIED:true,SOURCE_ADAPTER_REGISTERED:true,
  LIVE_SOURCE_REACHABLE:true,COUNTRY_RELEVANCE_VERIFIED:false,
  ORIGINAL_EVIDENCE_VERIFIED:false,ORIGINAL_PAGE_VERIFIED:false,
  INDEPENDENT_FALLBACK_VERIFIED:false,RIGHTS_QUALIFIED:null,
  SIGNED_DELIVERY_VERIFIED:null,original_page_publication_utc:null,
  original_publisher_families_reached:1,original_country_relevant_candidates:0,
  original_pages_verified:0,independent_verified_publisher_families:0,
  restricted_publisher_attempts:0,rate_limited_publisher_attempts:0,
  NO_QUALIFYING_EVIDENCE_FOUND:true,BLOCKED:"NO_COUNTRY_RELEVANT_ORIGINAL",
  verdict:"NO_QUALIFYING_CURRENT_EVIDENCE",
 })));
 return {schema:"geomacro.195-country-safe-readonly-batch.v2",
  probe_started_at:"2026-10-23T08:23:00Z",probe_finished_at:"2026-10-23T08:25:00Z",
  batch_start:start,batch_count:count,category_count:3,observed_cells:count*3,
  countries_actually_tested:count,requests_per_country_cap:12,
  original_pages_per_country_cap:4,total_country_baseline:195,total_category_cells:585,
  source_urls_logged:false,source_titles_logged:false,raw_data_persisted:false,
  supabase_requests:0,b2_requests:0,real_money_payments:0,
  commercial_rights_verified:0,signed_delivery_verified:0,cells};
}
test("reads exactly the canonical 193+2 country registry and never infers coverage",()=>{
 assert.equal(known.length,195);assert.ok(known.includes("PSE"));assert.ok(known.includes("VAT"));
 const out=rollupCountry195Proofs([mock()],known,{now});
 assert.equal(out.distinct_probed_countries,3);
 assert.equal(out.cells_probed,9);
 assert.equal(out.unprobed_cells,576);
 assert.equal(out.category_coverage.geopolitics.live_transport_observed,3);
 assert.equal(out.category_coverage.macro.first_party_original_page_verified,0);
 assert.equal(out.complete_195x3_current_live_original_coverage_verified,false);
});

test("a current-page claim is rejected unless the exact native publication clock is present",()=>{
 const report=mock();
 const cell=report.cells[0];
 cell.COUNTRY_RELEVANCE_VERIFIED=true;
 cell.ORIGINAL_EVIDENCE_VERIFIED=true;cell.ORIGINAL_PAGE_VERIFIED=true;
 cell.original_country_relevant_candidates=1;cell.original_pages_verified=1;
 cell.NO_QUALIFYING_EVIDENCE_FOUND=false;cell.BLOCKED=null;
 cell.verdict="PARTIAL_SOURCE_COVERAGE";
 assert.throws(()=>rollupCountry195Proofs([report],known,{now}),
  /RECEIPT_UNTRUSTED/);
});

test("fresh source probe with an older-than-24h native article is not current coverage",()=>{
 const report=mock();
 report.probe_started_at="2026-10-23T14:00:00.000Z";
 report.probe_finished_at="2026-10-23T14:05:00.000Z";
 report.cells.forEach(cell=>{
  cell.COUNTRY_RELEVANCE_VERIFIED=true;
  cell.ORIGINAL_EVIDENCE_VERIFIED=true;cell.ORIGINAL_PAGE_VERIFIED=true;
  cell.original_page_publication_utc="2026-10-22T15:00:00.000Z";
  cell.original_country_relevant_candidates=1;cell.original_pages_verified=1;
  cell.NO_QUALIFYING_EVIDENCE_FOUND=false;cell.BLOCKED=null;
  cell.verdict="PARTIAL_SOURCE_COVERAGE";
 });
 const out=rollupCountry195Proofs([report],known,{now});
 assert.equal(out.category_coverage.geopolitics.freshly_probed_within_24h,3);
 assert.equal(out.category_coverage.geopolitics.first_party_original_page_verified,3);
 assert.equal(out.cells.filter(c=>c.status==="ORIGINAL_PAGE_STALE").length,9);
 assert.equal(out.current_original_verified_cells,0);
 assert.equal(out.complete_195x3_current_live_original_coverage_verified,false);
});

test("rejects duplicated cells, fabricated signing, omitted proof and unauthorized country",()=>{
 const dup=mock();dup.cells[1]={...dup.cells[0]};
 assert.throws(()=>rollupCountry195Proofs([dup],known,{now}),/RECEIPT_UNTRUSTED/);
 const signed=mock();signed.cells[0].SIGNED_DELIVERY_VERIFIED=true;
 assert.throws(()=>rollupCountry195Proofs([signed],known,{now}),/RECEIPT_UNTRUSTED/);
 const changed=mock();changed.cells[0].iso3="ZZZ";
 assert.throws(()=>rollupCountry195Proofs([changed],known,{now}),/RECEIPT_UNTRUSTED/);
 assert.deepEqual(rollupCountry195Proofs([],known,{now}).category_coverage.rare_earth.unprobed_country_cells,195);
});
test("publishes all 585 actionable cell statuses and never confuses historical transport with fresh originals",()=>{
 const out=rollupCountry195Proofs([mock()],known,{now});
 assert.equal(out.cells.length,585);assert.equal(out.repair_queue.length,585);
 assert.equal(out.cells[0].status,"PROOF_OLDER_THAN_24H");
 assert.equal(out.cells[9].status,"UNPROBED");
 const reports=Array.from({length:65},(_,i)=>{
  const r=mock(i*3,3);
  r.probe_started_at="2026-10-24T11:23:00Z";
  r.probe_finished_at="2026-10-24T11:25:00Z";
  r.cells.forEach(c=>{
   c.COUNTRY_RELEVANCE_VERIFIED=true;
   c.ORIGINAL_EVIDENCE_VERIFIED=true;c.ORIGINAL_PAGE_VERIFIED=true;
   c.original_page_publication_utc="2026-10-24T11:24:00.000Z";
   c.original_country_relevant_candidates=1;c.original_pages_verified=1;
   c.NO_QUALIFYING_EVIDENCE_FOUND=false;c.BLOCKED=null;
   c.verdict="PARTIAL_SOURCE_COVERAGE";
  });
  return r;
 });
 const complete=rollupCountry195Proofs(reports,known,{now});
 assert.equal(complete.current_original_verified_cells,585);
 assert.equal(complete.complete_195x3_current_live_original_coverage_verified,true);
 assert.equal(complete.repair_queue.length,0);
 assert.equal(rollupCountry195Proofs(reports,known,{now:new Date("2026-10-26T12:00:00Z")})
  .complete_195x3_current_live_original_coverage_verified,false);
});
