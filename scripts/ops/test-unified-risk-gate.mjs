import test from "node:test";
import assert from "node:assert/strict";
import {PHASE2H_COUNTRIES_195} from "../../scripts/lib/phase2h-country-originals-195.mjs";
import {DAILY_RG_CORRIDORS} from "../../workers/control-plane/src/daily-risk-gate-generator.mjs";
import {CATEGORIES,validatedSignedCategoryScores} from "../../workers/control-plane/src/unified-risk-categories.mjs";
import {calculateUnifiedRisk,generateCommercialTiers,categoryView} from "../../workers/control-plane/src/unified-risk-engine.mjs";
import {scheduledUnifiedRisk,unifiedRiskGateEvaluate} from "../../workers/control-plane/src/unified-risk-gate.mjs";

test("canonical 195 x 3 plus 12 corridor registry",()=>{
 assert.equal(PHASE2H_COUNTRIES_195.length,195);
 assert.deepEqual(CATEGORIES,["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]);
 assert.equal(DAILY_RG_CORRIDORS.length,12);
 assert.equal(new Set(PHASE2H_COUNTRIES_195.map(x=>x.iso3)).size,195);
});
test("known weighted score and corridor multiplier",()=>{
 const s=calculateUnifiedRisk({GEOPOLITICS:.82,MACRO_FX:.45,CRITICAL_MINERALS:.88});
 assert.equal(s.unifiedScore,.7055);
 assert.equal(s.dominantFactor,"CRITICAL_MINERALS");
 const b=calculateUnifiedRisk({GEOPOLITICS:.82,MACRO_FX:.45,CRITICAL_MINERALS:.88},{corridorExposureMultiplier:1.2});
 assert.equal(b.unifiedScore,.8466);
});
test("unverified and unknown never silently mean zero risk",()=>{
 const s=calculateUnifiedRisk({GEOPOLITICS:.82,MACRO_FX:null,CRITICAL_MINERALS:0});
 assert.equal(s.unifiedScore,null);
 assert.equal(generateCommercialTiers(s).core.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.equal(generateCommercialTiers(s).signal.alert_level,"UNKNOWN");
 assert.equal(categoryView("MACRO_FX",2,null,null).status,"OBSERVED_UNVERIFIED");
});
test("source counts and authority host alone never hard block/pass",()=>{
 const s=calculateUnifiedRisk({GEOPOLITICS:.9,MACRO_FX:.8,CRITICAL_MINERALS:.7});
 assert.equal(generateCommercialTiers(s,{groVerified:false,confidence:1,
   policy:{block_at:.7,pass_below:.3,minimum_confidence:.8}}).core.gate_decision,"GATE_INSUFFICIENT_EVIDENCE");
 assert.deepEqual(validatedSignedCategoryScores({verification:{status:"UNVERIFIED"},attribution:[
  {driver:"conflict",score_contribution:90}]}),{});
});
test("verified signed-GRO driver contributions map only known categories",()=>{
 const g={verification:{status:"VERIFIED"},commercial_eligibility:{status:"VERIFIED"},attribution:[
  {driver:"conflict",score_contribution:40},{driver:"currency_fx",score_contribution:20},
  {driver:"critical_minerals",score_contribution:10},{driver:"shipping_logistics",score_contribution:30}]};
 assert.deepEqual(validatedSignedCategoryScores(g),
  {GEOPOLITICS:.4,MACRO_FX:.2,CRITICAL_MINERALS:.1});
});
test("unified route requires private token and valid 195-country target",async()=>{
 const env={RISK_GATE_TIERED_TOKEN:"a".repeat(64)};
 const req=(body,token="a".repeat(64))=>new Request("https://example.org/v1/risk-gate/unified/evaluate",{
  method:"POST",headers:{authorization:"Bearer "+token},body:JSON.stringify(body)});
 const unauthorized=await unifiedRiskGateEvaluate(req({target_type:"COUNTRY",target_id:"TWN"},"b".repeat(64)),env);
 assert.equal(unauthorized.status,401);
 const unknown=await unifiedRiskGateEvaluate(req({target_type:"COUNTRY",target_id:"ZZZ"}),env);
 assert.equal(unknown.status,400);
});
test("scheduler outside windows never triggers D1",async()=>{
 const env={};const output=await scheduledUnifiedRisk(env,Date.parse("2026-11-03T12:00:00Z"));
 assert.equal(output.not_due,true);
});
