import test from "node:test";
import assert from "node:assert/strict";
import {DIRECT_GLOBAL_CORRIDOR_SOURCES} from "./direct-global-corridor-sources.mjs";
import {RISK_GATE_SOURCE_RULES_VERSION,riskGateSuppliedSourceRegistry,
 riskGateSuppliedSourceCensus,RISK_GATE_SUPPLIED_MARITIME_SOURCE_IDS,
 RISK_GATE_SUPPLIED_MINERAL_SOURCE_IDS,CAMEO_RISK_GATE_DECISIONS,
 mapVerifiedCameoToRiskGate,strongestVerifiedCameoRiskGateDecision}
 from "./risk-gate-supplied-source-rules.mjs";
test("all 37 existing direct source IDs and endpoints are registered for Risk Gate",()=>{
 const reg=riskGateSuppliedSourceRegistry();
 const byId=new Map(reg.map(s=>[s.source_id,s]));
 assert.equal(reg.length,37);
 assert.deepEqual(reg.map(s=>s.source_id),DIRECT_GLOBAL_CORRIDOR_SOURCES.map(s=>s.id));
 for(const original of DIRECT_GLOBAL_CORRIDOR_SOURCES){
   const got=byId.get(original.id);
   assert.equal(got.url,original.url);
   assert.equal(got.registered_for_risk_gate,true);
   assert.equal(got.verified_event_feed,false);
 }
 for(const id of [...RISK_GATE_SUPPLIED_MARITIME_SOURCE_IDS,
                   ...RISK_GATE_SUPPLIED_MINERAL_SOURCE_IDS])assert.ok(byId.has(id));
 const census=riskGateSuppliedSourceCensus();
 assert.equal(census.schema,RISK_GATE_SOURCE_RULES_VERSION);
 assert.equal(census.registered_sources,37);
 assert.equal(census.source_link_occurrences,39);
 assert.equal(census.automatically_applied_decisions,0);
 assert.equal(census.numerical_maritime_thresholds_provided,false);
 assert.equal(census.predge_writes,0);
 assert.equal(census.website_intelligence_writes,0);
});
test("CAMEO mapping exactly preserves operator-supplied groups",()=>{
 assert.deepEqual(Object.entries(CAMEO_RISK_GATE_DECISIONS),
  [["01","CONTINUE"],["02","CONTINUE"],["03","CONTINUE"],
   ["04","CONTINUE"],["05","CONTINUE"],["10","REDUCE_LIMIT"],
   ["11","REQUIRE_APPROVAL"],["12","REQUIRE_APPROVAL"],
   ["13","REQUIRE_APPROVAL"],["17","REQUIRE_APPROVAL"],
   ["18","PAUSE"],["19","PAUSE"],["20","PAUSE"]]);
 for(const [code,expected] of Object.entries(CAMEO_RISK_GATE_DECISIONS)){
   const signal=mapVerifiedCameoToRiskGate({
     source_id:"gdelt_v2_15m",event_id:"verified-1",
     verification_status:"VERIFIED",cameo_code:code+"01"
   });
   assert.equal(signal.decision,expected);
   assert.equal(signal.execution_authorized,false);
 }
 for(const sanction_scope of ["COMPREHENSIVE_TRADE_BAN","ASSET_FREEZE"]){
   assert.equal(mapVerifiedCameoToRiskGate({source_id:"gdelt_v2_15m",
      event_id:"verified-2",verification_status:"VERIFIED",
      cameo_code:"17",sanction_scope}).decision,"PAUSE");
 }
});
test("missing, unverified, unknown, and batch-index records never trigger a decision",()=>{
 const event={source_id:"gdelt_v2_15m",event_id:"x",
   verification_status:"VERIFIED",cameo_code:"19"};
 assert.equal(mapVerifiedCameoToRiskGate({...event,verification_status:"UNVERIFIED"}),null);
 assert.equal(mapVerifiedCameoToRiskGate({...event,event_id:""}),null);
 assert.equal(mapVerifiedCameoToRiskGate({...event,cameo_code:"lastupdate.txt"}),null);
 assert.equal(mapVerifiedCameoToRiskGate({...event,cameo_code:"16"}),null);
 assert.equal(mapVerifiedCameoToRiskGate({...event,source_id:"unregistered"}),null);
 assert.equal(strongestVerifiedCameoRiskGateDecision([]),null);
 assert.equal(strongestVerifiedCameoRiskGateDecision([event,{
   ...event,event_id:"y",cameo_code:"03"
 }]).decision,"PAUSE");
 assert.equal(strongestVerifiedCameoRiskGateDecision([{
   ...event,verification_status:"CANDIDATE"
 }]),null);
});
