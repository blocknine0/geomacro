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
  SIGNED_DELIVERY_VERIFIED:null,
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
test("rejects duplicated cells, fabricated signing, omitted proof and unauthorized country",()=>{
 const dup=mock();dup.cells[1]={...dup.cells[0]};
 assert.throws(()=>rollupCountry195Proofs([dup],known,{now}),/RECEIPT_UNTRUSTED/);
 const signed=mock();signed.cells[0].SIGNED_DELIVERY_VERIFIED=true;
 assert.throws(()=>rollupCountry195Proofs([signed],known,{now}),/RECEIPT_UNTRUSTED/);
 const changed=mock();changed.cells[0].iso3="ZZZ";
 assert.throws(()=>rollupCountry195Proofs([changed],known,{now}),/RECEIPT_UNTRUSTED/);
 assert.deepEqual(rollupCountry195Proofs([],known,{now}).category_coverage.rare_earth.unprobed_country_cells,195);
});
