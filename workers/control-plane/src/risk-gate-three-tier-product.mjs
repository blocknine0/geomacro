/**
 * GeoMacro Risk Gate Part 1: exactly three per-call product tiers.
 * This module is purely a response assembler. Price discovery and a
 * prepared response do not charge, activate a merchant or execute a trade.
 *
 * BASIC: one observed original is sufficient for a labelled activity proxy.
 * STANDARD: verified three-category score + >=2 same-event independent issuers.
 * COMPLEX: actually verified Ed25519 GRO + B2 readback + 7-day D1 history.
 */
import {CATEGORIES,WEIGHTS,validatedSignedCategoryScores}
 from "./unified-risk-categories.mjs";
import {calculateUnifiedRisk} from "./unified-risk-engine.mjs";

export const RISK_GATE_PRODUCT_SCHEMA="geomacro.risk-gate-commercial-three-tier.v1";
export const RISK_GATE_PRODUCT_TIERS=Object.freeze({
 basic_focused:Object.freeze({tier:"BASIC_FOCUSED",legacy_variant:"existing_proof_preflight",
  display_name:"Basic / Focused",usd_per_call:"0.10",usdc_atomic:"100000",
  requirement:"SINGLE_OBSERVED_SOURCE",confidence:"LOW",verification:"PROVISIONAL"}),
 standard:Object.freeze({tier:"STANDARD",legacy_variant:"standard",
  display_name:"Standard",usd_per_call:"0.15",usdc_atomic:"150000",
  requirement:"THREE_CATEGORY_INDEPENDENT_CORROBORATION",
  confidence:"MEDIUM",verification:"VERIFIED"}),
 complex_full:Object.freeze({tier:"COMPLEX_FULL",legacy_variant:"complex_multi_source",
  display_name:"Complex / Full",usd_per_call:"0.25",usdc_atomic:"250000",
  requirement:"SIGNED_GRO_B2_READBACK_AND_SEVEN_DAY_HISTORY",
  confidence:"HIGH",verification:"CRYPTO_SIGNED"}),
});
const HEX=/^[a-f0-9]{64}$/u;
const ISO=/^\d{4}-\d{2}-\d{2}$/u;
const HTTPS=s=>{
 try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&
  !u.hash&&u.href.length<=400?u.href:null;}catch{return null;}
};
const boundedScore=n=>Number.isFinite(n)&&n>=0&&n<=100?Number(n.toFixed(2)):null;
const dayDate=(now,offset)=>new Date(now-offset*86400000).toISOString().slice(0,10);

/** Single source = a metadata observation, not a verified event. */
function observedByCategory(snapshot,rows){
 const found=new Map();
 for(const r of rows??[]){
  if(!CATEGORIES.includes(r?.category)||found.has(r.category))continue;
  const count=Number(r.source_count);
  if(!Number.isSafeInteger(count)||count<0||count>40)continue;
  let payload;try{payload=JSON.parse(r.evidence_payload)}catch{continue}
  if(payload?.schema!=="geomacro.risk-observation.v1"||!Array.isArray(payload.sources)||
    payload.sources.length>40)continue;
  const alerts=payload.sources.slice(0,6).filter(s=>
    typeof s.published_at==="string"&&Number.isFinite(Date.parse(s.published_at))&&
    HEX.test(String(s.title_hash??""))).map(s=>({
    title_sha256:s.title_hash,
    observed_at:s.published_at,
    source_type:String(s.origin??"OBSERVED_METADATA").slice(0,60),
    source_reference_id:String(s.id??"").slice(0,64),
    category:r.category,
    status:"OBSERVED_UNVERIFIED",
  }));
  found.set(r.category,{count,alerts});
 }
 return CATEGORIES.map(category=>{
  const count=found.get(category)?.count??Math.max(0,
    Math.min(40,Number(snapshot?.categories?.[category]?.source_count??0)));
  return {category,observed_count:count,
   observed_alerts:found.get(category)?.alerts??[],
   status:count>0?"OBSERVED_UNVERIFIED":"NO_OBSERVATION"};
 });
}
function provisionalScore(categoryRows){
 const count=categoryRows.reduce((n,r)=>n+r.observed_count,0);
 if(count===0)return null;
 // Count-only *activity proxy* 0..100. No incident severity is inferred.
 // One signal in the geopolitical lane gives 10/100, not a verified risk fact.
 const score=categoryRows.reduce((n,r)=>
  n+WEIGHTS[r.category]*25*Math.min(r.observed_count,4),0);
 return boundedScore(score);
}
function corroborationProof(gro){
 if(!gro||!Array.isArray(gro.evidence)||!gro.evidence_summary||
    gro.evidence_summary.independent_source_count<2)return null;
 const corroborated=gro.evidence.filter(e=>
  e?.corroboration_status==="CONFIRMED"&&
  Number.isSafeInteger(e.independent_source_count)&&e.independent_source_count>=2);
 if(!corroborated.length)return null;
 const source_references=[];
 for(const evidence of corroborated.slice(0,12)){
  const refs=Array.isArray(evidence.source_ids)?
    evidence.source_ids.filter(x=>typeof x==="string"&&x.length<=128).slice(0,6):[];
  const hashes=Array.isArray(evidence.content_hashes)?
    evidence.content_hashes.filter(x=>HEX.test(x)).slice(0,6):[];
  const urls=Array.isArray(evidence.source_urls)?
    evidence.source_urls.map(HTTPS).filter(Boolean).slice(0,6):[];
  if(refs.length+hashes.length+urls.length===0)continue;
  source_references.push({
   event_reference:String(evidence.event_id??"").slice(0,128),
   independent_source_count:evidence.independent_source_count,
   source_ids:refs,content_sha256:hashes,source_urls:urls,
  });
 }
 return source_references.length?source_references:null;
}
function sevenDays(rows,now,subject){
 const indexed=new Map();
 for(const row of rows??[]){
  if(!ISO.test(row?.day_utc)||indexed.has(row.day_utc)||
    row.entity_type!==subject.type||row.entity_id!==subject.id||
    row.proof_verified!==true)continue;
  const score=row.snapshot?.unified_risk_score;
  const numeric=typeof score==="number"&&score>=0&&score<=1?
    boundedScore(score*100):null;
  indexed.set(row.day_utc,{score:numeric,
   snapshot_sha256:HEX.test(row.content_sha256)?row.content_sha256:null});
 }
 const observations=[];
 for(let age=6;age>=0;age--){
  const day=dayDate(now,age),row=indexed.get(day);
  observations.push({day_utc:day,friction_score_0_100:row?.score??null,
   snapshot_sha256:row?.snapshot_sha256??null,
   data_status:row&&row.score!==null?"SIGNED_SCORE_IN_DAILY_SNAPSHOT":
    "NO_VERIFIED_HISTORICAL_FRICTION_SCORE"});
 }
 const rated=observations.filter(r=>r.friction_score_0_100!==null);
 const direction=rated.length<2?"INSUFFICIENT_VERIFIED_HISTORY":
  rated.at(-1).friction_score_0_100>rated[0].friction_score_0_100?"RISING":
  rated.at(-1).friction_score_0_100<rated[0].friction_score_0_100?"FALLING":"FLAT";
 return {window_days:7,points:observations,verified_score_days:rated.length,
  trend:direction,
  latest_minus_earliest:rated.length<2?null:
   boundedScore(rated.at(-1).friction_score_0_100-
    rated[0].friction_score_0_100)};
}
function archiveLocation(proof,gro){
 if(!proof||proof.archive_readback_verified!==1||
    proof.archive_write_acknowledged!==1||proof.object_id!==gro.object_id||
    !HEX.test(String(proof.archive_sha256??""))||
    typeof proof.archive_key!=="string"||
    !/^geomacro-evidence\/v1\/[a-zA-Z0-9_./-]{1,420}\.json$/u.test(proof.archive_key)||
    proof.archive_key.includes(".."))return null;
 return {
  b2_archive_link:"b2://geomacro-private-archive/"+proof.archive_key,
  archive_sha256:proof.archive_sha256,
  access:"PRIVATE_AUTHENTICATED_B2_OBJECT",
  public_download_url:null,
 };
}
/** Build current, evidence-calibrated tier payload; never invent a signed GRO. */
export function composeRiskGateThreeTierResponse({
 tier,snapshot,observations=[],verified_gro=null,archive_proof=null,
 history=[],now=Date.now(),
}={}){
 if(!Object.hasOwn(RISK_GATE_PRODUCT_TIERS,tier)||!snapshot||
    !["COUNTRY","CORRIDOR"].includes(snapshot.target_type)||
    typeof snapshot.target_id!=="string"||!Number.isFinite(now))
  throw Error("RISK_GATE_THREE_TIER_INPUT_INVALID");
 const product=RISK_GATE_PRODUCT_TIERS[tier];
 const subject={type:snapshot.target_type,id:snapshot.target_id};
 const categoryRows=observedByCategory(snapshot,observations);
 const base={
  schema:RISK_GATE_PRODUCT_SCHEMA,product:"risk_gate_bundle",
  tier:product.tier,product_variant:product.legacy_variant,
  tier_name:product.display_name,
  price:{currency:"USD",usd_per_call:product.usd_per_call,
   usdc_atomic_at_1_usdc_per_usd:product.usdc_atomic,
   billing_unit:"PER_SUCCESSFUL_DELIVERY"},
  subject,evaluated_at:new Date(now).toISOString(),
  execution_authorized:false,charged:false,
  payment_required_now:false,
 };
 if(tier==="basic_focused"){
  const score=provisionalScore(categoryRows);
  const alerts=categoryRows.flatMap(r=>r.observed_alerts).sort((a,b)=>
   b.observed_at.localeCompare(a.observed_at)).slice(0,12);
  return {...base,status:score===null?"NO_OBSERVED_SIGNAL":"READY",
   confidence:score===null?null:{level:"LOW",verification:"PROVISIONAL"},
   risk_score_0_100:score,risk_score_kind:"INDICATIVE_UNVERIFIED_ACTIVITY_PROXY",
   indicative_risk_score_0_100:score,
   signal_alerts:alerts,fast_sla_monitoring:true,
   data_basis:"SINGLE_SOURCE_AND_OBSERVED_METADATA",
   category_observations:categoryRows.map(({category,observed_count,status})=>({
    category,observed_count,status,
   })),
   signed_gro:null,
  };
 }
 const scores=validatedSignedCategoryScores(verified_gro);
 const calculated=calculateUnifiedRisk(Object.fromEntries(
  CATEGORIES.map(c=>[c,scores[c]??null])));
 const references=corroborationProof(verified_gro);
 const qualified=calculated.unifiedScore!==null&&references!==null;
 const factsheets=CATEGORIES.map(category=>({
  category,verified_category_score_0_100:
   qualified?boundedScore(scores[category]*100):null,
  evidence_status:qualified?"VERIFIED_CORROBORATED":"NOT_FULLY_VERIFIED",
  observed_count:categoryRows.find(r=>r.category===category)?.observed_count??0,
 }));
 if(tier==="standard"){
  return {...base,status:qualified?"READY":"INSUFFICIENT_CORROBORATION",
   confidence:qualified?{level:"MEDIUM",verification:"VERIFIED"}:null,
   risk_score_0_100:qualified?boundedScore(calculated.unifiedScore*100):null,
   risk_score_kind:"CORROBORATED_RISK_SCORE",
   corroborated_risk_score_0_100:
    qualified?boundedScore(calculated.unifiedScore*100):null,
   category_fact_sheets:factsheets,source_references:qualified?references:[],
   auto_search_enrichment:"EXISTING_D1_FIRST_AND_BOUNDED_RSS_GAP_FILL",
   independent_corroboration_verified:qualified,
   signed_gro:null,
  };
 }
 const archived=verified_gro?archiveLocation(archive_proof,verified_gro):null;
 const ready=qualified&&archived!==null&&
  verified_gro.integrity?.signature_scheme==="Ed25519"&&
  typeof verified_gro.integrity.signature==="string"&&
  verified_gro.integrity.signature.length>=40&&
  HEX.test(String(verified_gro.integrity.payload_hash??""))&&
  subject.type==="CORRIDOR";
 const friction=sevenDays(history,now,subject);
 return {...base,status:ready?"READY":"SIGNED_GRO_OR_ARCHIVE_NOT_READY",
  confidence:ready?{level:"HIGH",verification:"CRYPTO_SIGNED"}:null,
  risk_score_0_100:ready?boundedScore(verified_gro.risk.score):null,
  risk_score_kind:"PROPRIETARY_INSTITUTIONAL_SIGNED_SCORE",
  proprietary_institutional_score_0_100:
   ready?boundedScore(verified_gro.risk.score):null,
  category_fact_sheets:factsheets,
  source_references:qualified?references:[],
  gro_signature:ready?{
   object_id:verified_gro.object_id,
   scheme:"Ed25519",
   signature:verified_gro.integrity.signature,
   signing_key_id:verified_gro.integrity.signing_key_id,
   payload_sha256:verified_gro.integrity.payload_hash,
   generated_at:verified_gro.generated_at,
   expires_at:verified_gro.expires_at,
  }:null,
  seven_day_corridor_friction_history:ready?friction:null,
  raw_evidence_chain:ready?{
   gro_object_id:verified_gro.object_id,
   evidence_references:references,
   archived_originals_not_redistributed:true,
  }:null,
  b2_archive:ready?archived:null,
 };
}
