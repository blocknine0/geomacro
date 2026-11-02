/**
 * Exact operator-supplied GeoMacro Risk Gate source/CAMEO mapping, 2026-11-02.
 * Reuses the pinned 37-source global/corridor registry; no shadow provider URLs.
 * Never treats source availability, portal probes, article counts or GDELT batch
 * indices as events. No access to PREDGE, checkout, live GRO or website publishing.
 */
import {directGlobalCorridorRouteSources} from "./direct-global-corridor-sources.mjs";

export const RISK_GATE_SOURCE_RULES_VERSION="geomacro.risk-gate-supplied-source-rules.v1";
export const RISK_GATE_DECISIONS=Object.freeze([
 "CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE"
]);
export const CAMEO_RISK_GATE_DECISIONS=Object.freeze({
 "01":"CONTINUE","02":"CONTINUE","03":"CONTINUE",
 "04":"CONTINUE","05":"CONTINUE",
 "10":"REDUCE_LIMIT",
 "11":"REQUIRE_APPROVAL","12":"REQUIRE_APPROVAL","13":"REQUIRE_APPROVAL",
 "17":"REQUIRE_APPROVAL",
 "18":"PAUSE","19":"PAUSE","20":"PAUSE"
});
export const RISK_GATE_SUPPLIED_MARITIME_SOURCE_IDS=Object.freeze([
 "ukmto_incidents","ukmto_advisories","suez_navigation",
 "panama_canal","recaap_isc","imb_piracy"
]);
export const RISK_GATE_SUPPLIED_MINERAL_SOURCE_IDS=Object.freeze([
 "usgs_mcs","iea_minerals","mining_com"
]);
const rank={CONTINUE:0,REDUCE_LIMIT:1,REQUIRE_APPROVAL:2,PAUSE:3};

/**
 * Source membership is registration, not risk-event certification. All 37
 * original source IDs and their direct URLs are inherited from the live
 * corridor-only directory. No duplicate source inventory is maintained.
 */
export function riskGateSuppliedSourceRegistry(){
 const sources=directGlobalCorridorRouteSources();
 if(sources.length!==37||new Set(sources.map(s=>s.id)).size!==37||
    sources.some(s=>s.channel!=="CORRIDOR_ONLY"||
      s.website_intelligence_enabled!==false||s.risk_gate_verified!==false))
   throw Error("RISK_GATE_SUPPLIED_SOURCE_REGISTRY_DRIFT");
 const ids=new Set(sources.map(s=>s.id));
 for(const id of [...RISK_GATE_SUPPLIED_MARITIME_SOURCE_IDS,
   ...RISK_GATE_SUPPLIED_MINERAL_SOURCE_IDS])
   if(!ids.has(id))throw Error("RISK_GATE_SUPPLIED_SPECIALIST_SOURCE_MISSING");
 return Object.freeze(sources.map(s=>Object.freeze({
   source_id:s.id,name:s.name,url:s.url,format:s.format,
   integration_state:s.state,
   categories:Object.freeze([...s.categories]),
   corridor_ids:Object.freeze([...s.corridors]),
   source_references:s.source_references.length,
   registered_for_risk_gate:true,
   verified_event_feed:false,
   source_access_does_not_trigger_gate:true
 })));
}

export function riskGateSuppliedSourceCensus(){
 const sources=riskGateSuppliedSourceRegistry();
 return Object.freeze({
   schema:RISK_GATE_SOURCE_RULES_VERSION,
   registered_sources:sources.length,
   source_link_occurrences:sources.reduce((sum,s)=>sum+s.source_references,0),
   maritime_source_ids:RISK_GATE_SUPPLIED_MARITIME_SOURCE_IDS,
   minerals_source_ids:RISK_GATE_SUPPLIED_MINERAL_SOURCE_IDS,
   sources,
   cameo_rule_prefixes:Object.keys(CAMEO_RISK_GATE_DECISIONS),
   verified_event_count:0,
   automatically_applied_decisions:0,
   numerical_maritime_thresholds_provided:false,
   numerical_mineral_thresholds_provided:false,
   predge_writes:0,website_intelligence_writes:0,
   signed_gro_changed:false
 });
}

/**
 * Evaluate ONLY an externally verified, normalized source event. This function
 * does not perform verification and is not connected to live Risk Gate v1.
 * Verified provenance must come from the trusted event-verification pipeline.
 * CAMEO 17: PAUSE for comprehensive trade bans/asset freezes; otherwise
 * REQUIRE_APPROVAL, exactly as supplied. Never infer an event from a codebook.
 */
export function mapVerifiedCameoToRiskGate(event){
 if(event?.verification_status!=="VERIFIED"||
    typeof event.source_id!=="string"||
    typeof event.event_id!=="string"||!event.event_id.trim()||
    typeof event.cameo_code!=="string"||
    !/^\d{2}(?:\d{1,2})?$/u.test(event.cameo_code))
   return null;
 const source=riskGateSuppliedSourceRegistry().find(x=>x.source_id===event.source_id);
 if(!source)return null;
 const prefix=event.cameo_code.slice(0,2);
 let decision=CAMEO_RISK_GATE_DECISIONS[prefix];
 if(!decision)return null;
 if(prefix==="17"&&
   ["COMPREHENSIVE_TRADE_BAN","ASSET_FREEZE"].includes(event.sanction_scope))
   decision="PAUSE";
 return Object.freeze({
   ruleset:RISK_GATE_SOURCE_RULES_VERSION,
   source_id:source.source_id,event_id:event.event_id,
   cameo_code:event.cameo_code,cameo_root:prefix,decision,
   evidence_verified:true,execution_authorized:false
 });
}

/** Strongest verified-event decision wins; no inferred CONTINUE for no data. */
export function strongestVerifiedCameoRiskGateDecision(events){
 if(!Array.isArray(events))throw Error("RISK_GATE_EVENTS_MUST_BE_ARRAY");
 let strongest=null;
 for(const event of events){
   const next=mapVerifiedCameoToRiskGate(event);
   if(next&&(!strongest||rank[next.decision]>rank[strongest.decision]))
     strongest=next;
 }
 return strongest;
}
