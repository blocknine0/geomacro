import test from "node:test";
import assert from "node:assert/strict";
import {buildNativeCountryRepairWorklist} from "../ops/build-native-country-repair-worklist.mjs";
const cats=["geopolitics","macro","rare_earth"];
const countries=Array.from({length:195},(_,i)=> String.fromCharCode(65+Math.floor(i/26),65+i%26,65));
function cell(country_iso3,category,i){
 const local={registered:i%4===0?0:1,healthy:i%4===1?0:i%4===0?0:1};
 const regional={healthy:i%4===0?0:1};
 const global={healthy:i%4===0?0:1};
 const healthy=i%4===0?0:local.healthy+regional.healthy+global.healthy;
 return {country_iso3,category,source_tier_status:
  i%4===0?"NO_HEALTHY_SOURCE_IN_LAST_TICK":
  local.healthy?"LOCAL_SOURCE_HEALTHY":"REGIONAL_FALLBACK_HEALTHY",
  local,regional,global,healthy_source_slots:healthy,
  observed_private_items_this_tick:0,event_country_verified:false,
  original_source_rights_verified:false};
}
const fixture=()=>({schema:"geomacro.private-osint-live-coverage-report.v1",
 status:"DEGRADED_LIVE_SOURCE_COVERAGE",generated_at:"2026-10-27T09:00:00Z",
 scope:"READ_ONLY_PUBLIC_FEED_GETS_NO_PRIVATE_D1_WRITE_NO_B2_WRITE_NO_PUBLICATION",
 source_checks_completed:500,observed_native_dated_items:0,
 country_category_source_coverage:{returned_country_category_cells:585,
  cells:countries.flatMap((country,i)=>cats.map((cat,j)=>cell(country,cat,i*3+j)))}});
test("exact 585 native source worklist ranks failures, never fabricates ingestion",()=>{
 const report=buildNativeCountryRepairWorklist(fixture());
 assert.equal(report.cells,585);
 assert.equal(report.country_count,195);
 assert.equal(report.priority_worklist.length,585);
 assert.equal(report.priority_worklist[0].priority,0);
 assert.equal(report.all_585_native_ingestion_verified,false);
 assert.equal(report.cells_without_observed_native_items_this_tick,585);
 assert.equal(report.no_d1_reads_or_writes,true);
});
test("missing/duplicate source-country cells are not a green source-coverage report",()=>{
 const f=fixture();f.country_category_source_coverage.cells[1]={...f.country_category_source_coverage.cells[0]};
 assert.throws(()=>buildNativeCountryRepairWorklist(f),/DUPLICATE/);
 const g=fixture();g.country_category_source_coverage.cells.pop();
 assert.throws(()=>buildNativeCountryRepairWorklist(g),/UNVERIFIED/);
});
test("a previously healthy feed without a native news item cannot count as delivery",()=>{
 const f=fixture();f.country_category_source_coverage.cells[0].source_tier_status="GLOBAL_FALLBACK_HEALTHY";
 const r=buildNativeCountryRepairWorklist(f);
 assert.equal(r.observed_native_country_cells_this_tick,0);
 assert.equal(r.all_585_native_ingestion_verified,false);
});

test("observed native source item is not a verified stored D1 event-country cell",()=>{
 const f=fixture();
 f.country_category_source_coverage.cells[4].observed_private_items_this_tick=2;
 const r=buildNativeCountryRepairWorklist(f);
 assert.equal(r.observed_native_country_cells_this_tick,1);
 assert.equal(r.all_585_native_ingestion_verified,false);
 assert.equal(r.no_d1_reads_or_writes,true);
 const item=r.priority_worklist.find(x=>x.country_iso3===f.country_category_source_coverage.cells[4].country_iso3
   &&x.category===f.country_category_source_coverage.cells[4].category);
 assert.equal(item.native_country_attributed_items_this_tick,2);
 assert.equal(item.event_country_verified,false);
 assert.equal(item.live_ingestion_585_verified,false);
});
