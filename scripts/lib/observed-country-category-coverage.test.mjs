import test from "node:test";
import assert from "node:assert/strict";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {observedCountryCategoryCoverage} from "./observed-country-category-coverage.mjs";

const now=Date.parse("2026-10-27T12:00:00.000Z");
const row=(id,iso3,category="macro",stamp="2026-10-27T11:45:00.000Z")=>({
 id:"news-"+id.padStart(16,"0"),country_iso3:iso3,category,
 source:{original_published_at:stamp},
});
test("private D1 census is exactly 195x3, actual observations only, no invented coverage",()=>{
 const current=[
  row("1","IND","macro"),
  row("2","IND","rare_earth"),
  row("3","USA","geopolitics"),
  row("4",null,"macro"),
  row("5","ZZZ","macro"),
  row("6","CHN","macro","2026-10-25T11:44:59.000Z"),
  row("7","IND","macro","2026-10-27T12:01:00.000Z"),
  row("1","IND","macro"),
 ];
 const census=observedCountryCategoryCoverage(current,COUNTRIES_195,now);
 assert.equal(census.country_universe,195);
 assert.equal(census.required_cells,585);
 assert.equal(census.coverage_records.length,195);
 assert.equal(census.observed_cells,3);
 assert.deepEqual(census.actual_observed_countries_by_category,{
  geopolitics:1,macro:1,rare_earth:1,
 });
 assert.equal(census.coverage_records.find(x=>x.iso3==="IND").counts.macro,1);
 assert.equal(census.coverage_records.find(x=>x.iso3==="CHN").counts.macro,0);
 assert.ok(census.missing_countries_by_category.macro.includes("CHN"));
 assert.ok(!census.missing_countries_by_category.macro.includes("IND"));
 assert.equal(census.exclusions.missing_country,1);
 assert.equal(census.exclusions.unknown_iso3,1);
 assert.equal(census.exclusions.invalid_native_clock,2);
 assert.equal(census.exclusions.duplicate_ids,1);
 assert.equal(census.derived_from_existing_d1_readback,true);
 assert.equal(census.additional_source_fetches,0);
 assert.equal(census.additional_d1_queries,0);
 assert.equal(census.complete_195x3_live_ingestion_certified,false);
 assert.equal(JSON.stringify(census).includes("https://"),false);
});
test("empty 25h readback never counts 195 registered country routes as observed",()=>{
 const census=observedCountryCategoryCoverage([],COUNTRIES_195,now);
 assert.equal(census.observed_cells,0);
 for(const domain of ["geopolitics","macro","rare_earth"]){
  assert.equal(census.missing_countries_by_category[domain].length,195);
  assert.equal(census.actual_observed_countries_by_category[domain],0);
 }
});
test("rejects counterfeit country registry and bad observation shape",()=>{
 assert.throws(()=>observedCountryCategoryCoverage([],COUNTRIES_195.slice(1),now),
  /SOURCE_COUNTRY_COVERAGE_INPUT_INVALID/);
 assert.throws(()=>observedCountryCategoryCoverage([],COUNTRIES_195,NaN),
  /SOURCE_COUNTRY_COVERAGE_INPUT_INVALID/);
 const result=observedCountryCategoryCoverage([{id:"unsupported",category:"macro"}],COUNTRIES_195,now);
 assert.equal(result.exclusions.unrecognized_record,1);
});
