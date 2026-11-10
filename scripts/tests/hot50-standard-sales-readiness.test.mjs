import test from "node:test";
import assert from "node:assert/strict";
import {RISK_GATE_HOT50} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";
import {summarizeHot50StandardSalesReadiness,STANDARD_DELIVERIES_PER_UTC_DAY_TARGET}
 from "../lib/hot50-standard-sales-readiness.mjs";
const CATS=["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"];
function fixtures(ids,{readyCountry=null}={}){
 return ids.flatMap(id=>["basic_focused","standard","complex_full"].map(tier=>({
  country_iso3:id,tier,contract_valid:true,
  ready:tier==="standard"&&id===readyCountry,
  verified_current_three_category:tier==="standard"&&id===readyCountry,
  category_statuses:Object.fromEntries(CATS.map(cat=>[
   cat,id===readyCountry?"VERIFIED_SIGNED_GRO":"NO_VERIFIED_SIGNAL"
  ])),
 })));
}
test("150/day target is not a quota, invoice, throughput proof or guaranteed sale",()=>{
 assert.equal(STANDARD_DELIVERIES_PER_UTC_DAY_TARGET,150);
 const ids=[RISK_GATE_HOT50[0]];
 const report=summarizeHot50StandardSalesReadiness({ids,receipts:fixtures(ids),now:Date.parse("2026-11-10T20:00:00Z")});
 assert.equal(report.target_average_paid_deliveries_per_hour,6.25);
 assert.equal(report.target_inter_delivery_minutes,9.6);
 assert.equal(report.target_is_not_a_request_cap,true);
 assert.equal(report.actual_successful_paid_standard_deliveries_today,null);
 assert.equal(report.measured_sustained_paid_standard_delivery_capacity_per_day,null);
 assert.equal(report.paid_150_daily_target_verified,false);
 assert.equal(report.supply_diagnostic,"SAMPLED_NOT_CERTIFIED");
 assert.equal(report.country_category_cells_checked,3);
 assert.equal(report.missing_signed_country_category_cells,3);
 assert.equal(report.activation_or_settlement_performed,false);
});
test("one ready Standard country cannot be extrapolated to 50 or 150 sales",()=>{
 const ids=RISK_GATE_HOT50;
 const report=summarizeHot50StandardSalesReadiness({ids,full:true,receipts:fixtures(ids,{readyCountry:"IND"})});
 assert.equal(report.standard_product_ready_countries,1);
 assert.equal(report.signed_three_category_high_assurance_countries,1);
 assert.equal(report.missing_signed_country_category_cells,147);
 assert.deepEqual(report.category_signed_evidence_gaps,{
  GEOPOLITICS:49,MACRO_FX:49,CRITICAL_MINERALS:49,
 });
 assert.equal(report.supply_diagnostic,"STANDARD_QUALIFICATION_GAPS_REMAIN");
 assert.equal(report.paid_150_daily_target_verified,false);
});
test("a genuine 50x3 passing audit does not certify paid capacity without ledger proof",()=>{
 const ids=RISK_GATE_HOT50;
 const r=summarizeHot50StandardSalesReadiness({ids,full:true,receipts:fixtures(ids)
 .map(x=>({...x,ready:x.tier==="standard",verified_current_three_category:true,
 category_statuses:Object.fromEntries(CATS.map(c=>[c,"VERIFIED_SIGNED_GRO"]))}))});
 assert.equal(r.supply_diagnostic,"HOT50_ALL_STANDARD_PROFILES_READY");
 assert.equal(r.standard_product_ready_countries,50);
 assert.equal(r.missing_signed_country_category_cells,0);
 assert.equal(r.paid_150_daily_target_verified,false);
});
test("refuse missing, duplicated or out-of-scope country evidence",()=>{
 const ids=["USA"];
 for(const receipts of [
  [],
  fixtures(ids).map((r,i)=>i===0?{...r,tier:"standard"}:r),
  fixtures(ids).map((r,i)=>i===0?{...r,country_iso3:"AFG"}:r),
 ])assert.throws(()=>summarizeHot50StandardSalesReadiness({ids,receipts}),/HOT50_STANDARD_READINESS_/);
 assert.throws(()=>summarizeHot50StandardSalesReadiness({
  ids,receipts:fixtures(ids),full:true}),/HOT50_STANDARD_READINESS_/);
});
test("invalid Standard contracts do not create qualified supply",()=>{
 const ids=["IND"],receipts=fixtures(ids,{readyCountry:"IND"});
 receipts[1].contract_valid=false;
 const r=summarizeHot50StandardSalesReadiness({ids,receipts});
 assert.equal(r.standard_product_ready_countries,0);
 assert.equal(r.missing_signed_country_category_cells,3);
 assert.deepEqual([...new Set(r.prioritized_missing_category_cells.map(x=>x.state))],
  ["INVALID_OR_MISSING"]);
});
