import test from "node:test";
import assert from "node:assert/strict";
import {normalizeRiskStreamInternalCorroboration,
 summarizeRiskStreamInternalCorroboration,isRiskStreamInternalCorroboration,
 riskStreamInternalEventMatches}
 from "../../workers/control-plane/src/risk-stream-internal-corroboration.mjs";

test("Private OSINT and Telegram watch input reduces to country, event, weight and corridor features",()=>{
 for(const [source_kind,text] of [
  ["PRIVATE_OSINT","Currency crisis and sovereign debt distress reported; https://private.invalid/story"],
  ["TELEGRAM_WATCH","Missile strike warning from @private_channel; headline omitted"],
 ]){
  const item=normalizeRiskStreamInternalCorroboration({source_kind,country_iso3:"USA",
   category:"GEOPOLITICS",text,severity_weight:71.2,corroboration_weight:.7,
   corridors:["USA>IND"]});
  assert.equal(isRiskStreamInternalCorroboration(item),true);
  const json=JSON.stringify(item);
  assert.doesNotMatch(json,/https?:|private\.invalid|private_channel|headline|@/iu);
  assert.deepEqual(Object.keys(item).sort(),["category","corridors","country_iso3",
   "corroboration_weight_0_1","event_code","origin_kind","raw_source_redacted",
   "schema","severity_weight_0_100"].sort());
 }
});

test("corroboration rollup records only closed enums and bounded numeric summaries",()=>{
 const a=normalizeRiskStreamInternalCorroboration({source_kind:"PRIVATE_OSINT",
  country_iso3:"IND",category:"MACRO_FX",text:"FX stress identified",severity_weight:50,
  corroboration_weight:.4});
 const b=normalizeRiskStreamInternalCorroboration({source_kind:"DERIVED_BASELINE",
  country_iso3:"IND",category:"MACRO_FX",text:"Sovereign default risk",severity_weight:66,
  corroboration_weight:.8,corridors:["IND>USA"]});
 const summary=summarizeRiskStreamInternalCorroboration([a,b]);
 assert.deepEqual(summary.families,["DERIVED_BASELINE","PRIVATE_OSINT"]);
 assert.equal(summary.max_severity_weight_0_100,66);
 assert.equal(summary.max_corroboration_weight_0_1,.8);
 assert.equal(summary.raw_source_redacted,true);
 assert.doesNotMatch(JSON.stringify(summary),/FX stress|default risk|https?:|title|channel/iu);
});

test("invalid source categories and raw/unbounded feature values fail closed",()=>{
 assert.throws(()=>normalizeRiskStreamInternalCorroboration({source_kind:"TELEGRAM_WATCH",
  country_iso3:"USA",category:"GEOPOLITICS",text:"x",severity_weight:101,
  corroboration_weight:.5}),/RISK_STREAM_INTERNAL_CORROBORATION_INVALID/u);
 assert.throws(()=>normalizeRiskStreamInternalCorroboration({source_kind:"RESTRICTED_NEWS",
  country_iso3:"USA",category:"GEOPOLITICS",text:"x",severity_weight:50,
  corroboration_weight:.5}),/RISK_STREAM_INTERNAL_CORROBORATION_INVALID/u);
});

test("normalized internal events cover chokepoints, conflict, macro crypto, and broad minerals",()=>{
 const cases=[
  ["GEOPOLITICS","shipping_chokepoints","CHOKEPOINT_DISRUPTION"],
  ["GEOPOLITICS","conflict escalation","CONFLICT"],
  ["MACRO_FX","central_bank monetary_policy inflation interest_rate","MACRO_POLICY_STRESS"],
  ["MACRO_FX","stablecoin crypto liquidity","FX_SOVEREIGN_STRESS"],
  ["CRITICAL_MINERALS","dysprosium refining capacity","MINERAL_SUPPLY_SHOCK"],
  ["CRITICAL_MINERALS","polysilicon smelting","MINERAL_SUPPLY_SHOCK"],
 ];
 for(const [category,text,eventCode] of cases){
  for(const source_kind of ["PRIVATE_OSINT","TELEGRAM_WATCH"]){
   const item=normalizeRiskStreamInternalCorroboration({source_kind,
    country_iso3:"USA",category,text,severity_weight:60,corroboration_weight:.7});
   assert.equal(item.event_code,eventCode,`${source_kind}: ${text} normalization`);
   assert.equal(riskStreamInternalEventMatches(category,text,eventCode),true,
    `${category} event should match ${text}`);
   assert.equal(riskStreamInternalEventMatches(category,text.replaceAll("_","-"),eventCode),true,
    `${category} event should normalize hyphens`);
  }
 }
 assert.equal(riskStreamInternalEventMatches("GEOPOLITICS","conflict escalation","CONFLICT"),true);
 assert.equal(riskStreamInternalEventMatches("CRITICAL_MINERALS","rare earth battery supply","MINERAL_SUPPLY_SHOCK"),true);
});
