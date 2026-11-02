/**
 * Private, source-evidence-only Risk Gate staging packs for all three canonical
 * risk_gate_bundle price variants. NOT a commercial quote or a Risk Gate v1
 * decision. Original incident and GRO proof are never inferred from metadata.
 *
 * All checks below are deterministic and can be regenerated inside the Worker.
 * D1 still independently checks the exact upstream source rows before writes.
 */
export const RG_SOURCE_PACK_SCHEMA="geomacro.risk-gate-source-pack.v1";
export const RG_PRICE_CATALOG="geomacro.capability-usdc.v2";
export const RG_VARIANTS=Object.freeze([
 "existing_proof_preflight","standard","complex_multi_source"
]);
const HEX=/^[0-9a-f]{64}$/u;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const VALID_KINDS=new Set(["NATIVE_RSS","CRYPTO_INDIVIDUAL","OFFICIAL_REFERENCE"]);
const MODES=Object.freeze({
 existing_proof_preflight:"REQUIRE_EXISTING_VERIFIED_SIGNED_GRO",
 standard:"REQUIRE_VERIFIED_EVENT_RIGHTS_AND_SIGNED_GRO",
 complex_multi_source:"REQUIRE_INDEPENDENT_MULTISOURCE_EVENTS_RIGHTS_AND_SIGNED_GRO"
});
export function validateRiskGateSourceRefs(refs,now=Date.now()){
 if(!Array.isArray(refs)||refs.length>18)throw Error("RG_SOURCE_REFS_INVALID");
 const seen=new Set();
 for(const r of refs){
  if(!r||Array.isArray(r)||typeof r!=="object"||
    Object.keys(r).sort().join("|")!=="id|kind|source_id|source_period"||
    !HEX.test(r.id)||!VALID_KINDS.has(r.kind)||
    typeof r.source_id!=="string"||!/^[a-z0-9_]{4,70}$/u.test(r.source_id)||
    typeof r.source_period!=="string"||r.source_period.length>32||
    !/^\d{4}-\d\d(?:-\d\d(?:T\d\d:\d\d:\d\d\.\d{3}Z)?)?$/u.test(r.source_period)||
    seen.has(r.kind+":"+r.id))throw Error("RG_SOURCE_REFS_INVALID");
  if(r.kind==="CRYPTO_INDIVIDUAL"&&r.source_id!=="cryptocompare_news")
   throw Error("RG_SOURCE_REFS_INVALID");
  if(r.kind!=="OFFICIAL_REFERENCE"&&(!ISO.test(r.source_period)||
     Date.parse(r.source_period)>now||now-Date.parse(r.source_period)>72*3600000))
   throw Error("RG_SOURCE_REFS_INVALID");
  seen.add(r.kind+":"+r.id);
 }
 return refs;
}
export function buildRiskGateSourcePack({checked_at,refs}={}){
 if(typeof checked_at!=="string"||!ISO.test(checked_at)||
   !Number.isFinite(Date.parse(checked_at)))throw Error("RG_SOURCE_CLOCK_INVALID");
 validateRiskGateSourceRefs(refs,Date.parse(checked_at));
 const items=refs.map(({id,kind,source_id,source_period})=>({
  id,kind,source_id,source_period
 }));
 const counts={
  native_rss:items.filter(r=>r.kind==="NATIVE_RSS").length,
  crypto_news:items.filter(r=>r.kind==="CRYPTO_INDIVIDUAL").length,
  official_reference:items.filter(r=>r.kind==="OFFICIAL_REFERENCE").length,
  distinct_registered_source_ids:new Set(items.map(x=>x.source_id)).size
 };
 const price_variants=RG_VARIANTS.map(variant=>({
  capability:"risk_gate_bundle",price_variant:variant,
  pricing_catalog_version:RG_PRICE_CATALOG,
  evidence_sample_count:items.length,
  source_class_counts:counts,
  qualification_mode:MODES[variant],
  readiness:"EVIDENCE_ONLY_VERIFICATION_REQUIRED",
  what_happened:"GeoMacro observed "+items.length+
    " independently persisted source-reference candidate(s) sampled for Risk Gate preflight. "+
    "No independently verified risk event or signed object is established by these references.",
  why_it_matters:"News timestamps, index records and macro observations are potential external-risk leads, not certified event facts or country/corridor impact.",
  market_relevance:"Market, trade, shipping and critical-minerals effects require original incident verification and subject-scoped signed risk evidence; no exposure effect is inferred.",
  what_to_watch:"Verify original reports and licensed reuse, correlate independent event facts, qualify a signed GRO, then apply caller policy before any eligible delivery.",
  evidence_and_confidence:{
   source_evidence_type:"CANONICAL_PRIVATE_D1_REFERENCE_SAMPLE",
   reference_count:items.length,
   source_independent_events_verified:0,
   signed_gro_verified:false,
   commercial_rights_verified:false,
   confidence:"SOURCE_METADATA_ONLY"
  },
  action_decision:null,execution_authorized:false,chargeable:false,
  eligible_for_quote:false,customer_delivery_authorized:false,
  signed_gro_generated:false
 }));
 return {
  schema:RG_SOURCE_PACK_SCHEMA,channel:"CORRIDOR_ONLY",
  checked_at,source_refs:items,price_variants,
  risk_gate_new_sales_allowed:false,
  evidence_classification:"SOURCE_METADATA_NOT_VERIFIED_EVENT",
  verified_event_count:0,source_rights_verified:false,
  signed_gro_qualified:false,commercial_eligible:false,
  chargeable:false,execution_authorized:false,
  website_intelligence_writes:0,predge_writes:0
 };
}
