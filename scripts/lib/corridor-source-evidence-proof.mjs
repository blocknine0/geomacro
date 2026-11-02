/**
 * Deterministic evidence verification for privately derived corridor research.
 *
 * Evidence = reproducible source-observation integrity, not independent
 * real-world corroboration. SHA256 identifies the numeric assertion, source,
 * reporting period and original link. No source content is invented or saved.
 */
import {createHash} from "node:crypto";
const HASH=/^[0-9a-f]{64}$/u,ALLOWED_ROUTE=/^[a-z_]{3,45}$/u;
const sha=s=>createHash("sha256").update(s).digest("hex");
const canonical=x=>Array.isArray(x)?x.map(canonical):
 x&&typeof x==="object"?
 Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))
   .map(([k,v])=>[k,canonical(v)])):x;
export const hashStructuredEvidence=object=>sha(JSON.stringify(canonical(object)));
function sameOriginalSource(raw,at){
 if(typeof raw!=="string"||raw.length>2048)return false;
 const u=new URL(raw);
 return u.protocol==="https:"&&!u.username&&!u.password&&!u.hash&&
    typeof at==="string"&&at.length<100&&Number.isFinite(Date.parse(at));
}
export function evidenceFromCorridorObservations({receipt,sourceLookup,checkedAt=receipt?.checked_at}={}){
 if(receipt?.channel!=="CORRIDOR_ONLY"||
   !Array.isArray(receipt.official_reference_observations)||
   receipt.official_reference_observations.length>65||
   typeof sourceLookup!=="function"||!Number.isFinite(Date.parse(checkedAt??"")))
   throw Error("CORRIDOR_EVIDENCE_INPUT_INVALID");
 const seen=new Set(),proofs=[];
 for(const item of receipt.official_reference_observations){
  const source=sourceLookup(item.source_id);
  const nativeID=sha([item.source_id,item.metric_id,item.observation_period,
    String(item.numeric_value)].join("\x1f"));
  if(!source||!sameOriginalSource(source.source_url,checkedAt)||
    typeof item.id!=="string"||!HASH.test(item.id)||nativeID!==item.id||
    seen.has(item.id)||!Number.isFinite(item.numeric_value)||
    !Number.isFinite(Date.parse(item.observed_at??""))||
    Math.abs(Date.parse(checkedAt)-Date.parse(item.observed_at))>15*60_000||
    !Array.isArray(item.corridor_ids)||
    item.corridor_ids.some(id=>!ALLOWED_ROUTE.test(id))||
    item.source_observation_is_not_live_event!==true||
    item.commercial_rights_verified!==false||
    item.independently_verified_event!==false||
    item.context_only!==true||item.customer_delivery_enabled!==false)
   throw Error("CORRIDOR_EVIDENCE_PROVENANCE_UNVERIFIED");
  seen.add(item.id);
  const claim={
    source_id:item.source_id,source_url:source.source_url,
    metric_id:item.metric_id,observation_period:item.observation_period,
    numeric_value:item.numeric_value,corridor_ids:[...item.corridor_ids]
  };
  const proof={
   evidence_schema:"geomacro.corridor-source-proof.v1",
   source_reference_id:item.id,
   claim_sha256:hashStructuredEvidence(claim),
   claim,
   source_record_id_recomputed:nativeID===item.id,
   provenance:"REPRODUCIBLE_SOURCE_OBSERVATION_CHECKSUM",
   native_report_release_time_verified:false,
   originating_article_body_verified:false,
   independent_sources_checked:0,
   independently_corroborated:false,
   conflicting_source_records:0,
   event_facts_verified:false,
   evidence_status:"SINGLE_SOURCE_OBSERVATION_ONLY",
   commercial_rights_verified:false,
   customer_delivery_authorized:false
  };
  proofs.push({...proof,proof_sha256:hashStructuredEvidence(proof)});
 }
 // Cross-check only genuinely comparable source metric + period and route.
 // Different metrics are not independent confirmation of a single event.
 const keys=new Map();
 for(const p of proofs){
  const c=p.claim,key=JSON.stringify([c.metric_id,c.observation_period,c.corridor_ids]);
  const group=keys.get(key)??[];group.push(p);keys.set(key,group);
 }
 for(const group of keys.values()){
  const publishers=new Set(group.map(p=>new URL(p.claim.source_url).hostname));
  const values=new Set(group.map(p=>String(p.claim.numeric_value)));
  for(const p of group){
   const independent=[...group].filter(q=>
    new URL(q.claim.source_url).hostname!==new URL(p.claim.source_url).hostname);
   p.independent_sources_checked=independent.length;
   p.conflicting_source_records=independent.filter(q=>
     q.claim.numeric_value!==p.claim.numeric_value).length;
   // Matching independent source values corroborate a *numeric claim* only.
   p.independently_corroborated=publishers.size>=2&&values.size===1;
   p.evidence_status=p.conflicting_source_records>0?
     "CONFLICTING_SOURCE_OBSERVATIONS":
     p.independently_corroborated?"MULTISOURCE_NUMERIC_CLAIM_MATCH":
     "SINGLE_SOURCE_OBSERVATION_ONLY";
   p.proof_sha256=hashStructuredEvidence(Object.fromEntries(
    Object.entries(p).filter(([k])=>k!=="proof_sha256")));
  }
 }
 return Object.freeze({
  schema:"geomacro.corridor-source-evidence-bundle.v1",
  channel:"CORRIDOR_ONLY",checked_at:checkedAt,
  proof_count:proofs.length,proofs,
  source_fact_integrity_checked:true,
  independent_real_world_event_verified:false,
  raw_publisher_content_stored:false,
  commercial_eligible:false,customer_delivery_authorized:false,
  website_intelligence_writes:0,predge_writes:0
 });
}
