import test from "node:test";
import assert from "node:assert/strict";
import {planHot50StandardSourceRecovery} from "../lib/hot50-standard-source-recovery.mjs";
const make=(cells,full=false)=>({
 schema:"geomacro.hot50-standard-150day-readiness.v1",scope:"HOT50",
 generated_at:"2026-11-11T00:00:00.000Z",
 full_hot50_census:full,
 country_category_cells_checked:full?150:3,
 missing_signed_country_category_cells:cells.length,
 prioritized_missing_category_cells:cells,
});
test("a Chinese mineral gap without vetted first-party candidate remains a repair, not evidence",()=>{
 const report=planHot50StandardSourceRecovery(make([
  {country_iso3:"CHN",category:"CRITICAL_MINERALS",state:"NO_VERIFIED_SIGNAL"},
 ]));
 assert.equal(report.missing_verified_signed_cells,1);
 assert.equal(report.action_queue[0].priority_class,"P0_NO_ORIGINAL_CANDIDATE");
 assert.equal(report.action_queue[0].independently_qualified_original_issuers,null);
 assert.equal(report.no_source_activation_or_commercial_promotion,true);
 assert.equal(report.no_synthetic_issuers_signatures_or_sales,true);
 assert.equal(report.target_successful_paid_standard_deliveries_per_day,150);
 assert.equal(JSON.stringify(report).includes("https://"),false);
});
test("invalid verifier is the first repair, not an automatic issuer promotion",()=>{
 const report=planHot50StandardSourceRecovery(make([
  {country_iso3:"USA",category:"MACRO_FX",state:"OBSERVED_UNVERIFIED"},
  {country_iso3:"IND",category:"GEOPOLITICS",state:"INVALID_OR_MISSING"},
 ]));
 assert.equal(report.action_queue[0].priority_class,"P0_CONTRACT_OR_SIGNER");
 assert.equal(report.category_gap_counts.MACRO_FX,1);
 assert.equal(report.category_gap_counts.GEOPOLITICS,1);
 assert.equal(report.category_gap_counts.CRITICAL_MINERALS,0);
 assert.equal(report.action_queue.every(x=>x.commercial_rights_verified===false),true);
});
test("empty fully verified census produces empty action queue, not claimed sales",()=>{
 const r=planHot50StandardSourceRecovery(make([],true));
 assert.equal(r.cells_checked,150);
 assert.equal(r.missing_verified_signed_cells,0);
 assert.deepEqual(r.action_queue,[]);
 assert.equal(r.preserve_20m_priority_and_independent_paid_ledger,true);
});
test("reject out-of-scope, duplicates and false 50-country claims",()=>{
 const duplicate={country_iso3:"USA",category:"MACRO_FX",state:"NO_VERIFIED_SIGNAL"};
 for(const cells of [
  [{...duplicate,country_iso3:"AFG"}],
  [{...duplicate,category:"MINERALS"}],
  [duplicate,duplicate],
  [{...duplicate,state:"VERIFIED_SIGNED_GRO"}],
 ]){
  assert.throws(()=>planHot50StandardSourceRecovery(make(cells)),/HOT50_SOURCE_RECOVERY_/);
 }
 assert.throws(()=>planHot50StandardSourceRecovery({
  ...make([]),full_hot50_census:true}),/HOT50_SOURCE_RECOVERY_PARTIAL_CENSUS/);
});
