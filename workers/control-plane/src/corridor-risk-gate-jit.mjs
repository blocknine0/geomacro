/** Authenticated D1-only continuous strategic corridor watch and JIT preflight.
 * No paid API call, risk score, GRO signing, execution approval, or PREDGE.
 */
import {TRACKED_CORRIDORS,buildStrategicCorridorReadiness,
 chooseRiskGateProcessingTier,RG_CORRIDOR_FIRST_VERSION}
 from "../../../lib/risk-gate-corridor-first.mjs";
const AGE=72*3600000,HEX=/^[a-f0-9]{64}$/u;
const respond=(value,status=200)=>Response.json(value,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"
}});
async function hash(text){
 const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
 return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function rowsForCorridor(db,id,now){
 const selected=TRACKED_CORRIDORS.find(x=>x.id===id);
 if(!selected)throw Error("RG_UNKNOWN_CORRIDOR");
 const rows=(await db.prepare("SELECT candidate_id,source_id,native_published_at,article_url,"+
   "source_title_sha256,candidate_corridor_ids_json FROM corridor_native_news_candidates "+
   "WHERE native_published_at>=? AND native_published_at<=? "+
   "AND instr(candidate_corridor_ids_json,?)>0 "+
   "ORDER BY native_published_at DESC LIMIT 60")
  .bind(new Date(now-AGE).toISOString(),new Date(now).toISOString(),
   '"'+selected.native+'"').all())?.results??[];
 return rows;
}
async function calculate(db,corridor,now){
 const checked_at=new Date(now).toISOString();
 return buildStrategicCorridorReadiness({
  corridor_id:corridor,rows:await rowsForCorridor(db,corridor,now),checked_at
 });
}
export async function tickPrivateStrategicRiskGate(env,now=Date.now()){
 if(!env?.DB?.prepare||!env?.DB?.batch)
  return respond({ok:false,error:"RG_STRATEGIC_D1_UNAVAILABLE",chargeable:false},503);
 try{
  const snapshots=await Promise.all(TRACKED_CORRIDORS.map(x=>calculate(env.DB,x.id,now)));
  const digests=await Promise.all(snapshots.map(s=>hash(JSON.stringify(s))));
  await env.DB.batch(snapshots.map((s,i)=>{
   const json=JSON.stringify(s);
   return env.DB.prepare("INSERT INTO corridor_risk_gate_strategic_snapshots "+
     "(corridor_id,checked_at,content_sha256,source_candidate_count,structured_json) "+
     "VALUES (?,?,?,?,?) ON CONFLICT(corridor_id) DO UPDATE SET "+
     "checked_at=excluded.checked_at,content_sha256=excluded.content_sha256,"+
     "source_candidate_count=excluded.source_candidate_count,"+
     "structured_json=excluded.structured_json")
    .bind(s.corridor_id,s.checked_at,digests[i],s.native_evidence_count,json);
  }));
  // Hash generated before insertion and then independently compared.
  for(let i=0;i<snapshots.length;i++){
   const s=snapshots[i],integrity=digests[i];
   const row=await env.DB.prepare("SELECT checked_at,content_sha256,source_candidate_count,structured_json "+
    "FROM corridor_risk_gate_strategic_snapshots WHERE corridor_id=?")
    .bind(s.corridor_id).first();
   if(!row||row.checked_at!==s.checked_at||row.content_sha256!==integrity||
      row.source_candidate_count!==s.native_evidence_count||
      row.structured_json!==JSON.stringify(s))
    return respond({ok:false,error:"RG_STRATEGIC_D1_READBACK_MISMATCH",chargeable:false},503);
  }
  return respond({ok:true,schema:"geomacro.risk-gate-corridor-first-receipt.v1",
   strategic_corridors_monitored:snapshots.length,
   canonical_d1_readback:true,source_reference_counts:snapshots.map(s=>({
    corridor_id:s.corridor_id,article_candidates:s.native_evidence_count,
    two_domain_six_hour_title_matches:s.potential_corroboration_pairs
   })),
   verified_real_world_events:0,signed_gro_generated:false,
   paid_quote_enabled:false,customer_credits_debited:0,
   execution_authorized:false,predge_writes:0,
   website_intelligence_writes:0,chargeable:false});
 }catch{
  return respond({ok:false,error:"RG_STRATEGIC_D1_TICK_UNAVAILABLE",chargeable:false},503);
 }
}
export async function readPrivateRiskGateJit(env,query,now=Date.now()){
 const subject_type=query.get("subject_type");
 const subject_id=query.get("subject_id");
 if(!env?.DB?.prepare)return respond({ok:false,error:"RG_JIT_D1_UNAVAILABLE",chargeable:false},503);
 if(subject_type==="country"){
  if(typeof subject_id!=="string"||!/^[A-Z]{3}$/u.test(subject_id))
   return respond({ok:false,error:"RG_JIT_ISO3_INVALID",chargeable:false},400);
  const tier=chooseRiskGateProcessingTier({country_iso3:subject_id});
  // The corridor source tables carry no independently verified ISO3 subject.
  // A country claim cannot be manufactured from a global news-index record.
  return respond({ok:false,schema:"geomacro.risk-gate-jit-preflight.v1",
   subject:{type:"country",id:subject_id},processing_tier:tier.tier,
   verification_status:"COUNTRY_SPECIFIC_VERIFIED_EVIDENCE_REQUIRED",
   evidence_references:[],signed_gro:null,risk_gate_decision:null,
   customer_credits_debited:0,execution_authorized:false,
   chargeable:false,new_sales_enabled:false},202);
 }
 if(subject_type!=="corridor"||typeof subject_id!=="string"||
    !/^[a-z][a-z-]{2,70}$/u.test(subject_id))
  return respond({ok:false,error:"RG_JIT_SUBJECT_INVALID",chargeable:false},400);
 const tier=chooseRiskGateProcessingTier({corridor_id:subject_id});
 if(tier.tier!=="STRATEGIC_CONTINUOUS")
  return respond({ok:false,schema:"geomacro.risk-gate-jit-preflight.v1",
   subject:{type:"corridor",id:subject_id},processing_tier:"JIT_REQUEST_ONLY",
   verification_status:"UNKNOWN_CORRIDOR_REQUIRES_CANONICAL_ROUTE_MAPPING",
   signed_gro:null,risk_gate_decision:null,customer_credits_debited:0,
   chargeable:false,execution_authorized:false},202);
 try{
  // Compute the latest bounded D1-backed answer JUST IN TIME for requests;
  // never rely on an old cached observation to claim a current incident.
  const snapshot=await calculate(env.DB,subject_id,now);
  const verified=await hash(JSON.stringify(snapshot));
  return respond({ok:true,schema:"geomacro.risk-gate-jit-preflight.v1",
   processing_tier:tier.tier,subject:{type:"corridor",id:subject_id},
   checked_at:snapshot.checked_at,source_hash_sha256:verified,
   candidate_count:snapshot.native_evidence_count,
   potential_corroboration_pairs:snapshot.potential_corroboration_pairs,
   same_event_verified:false,verification_status:"SOURCE_METADATA_ONLY",
   signed_gro:null,risk_gate_decision:null,customer_credits_debited:0,
   chargeable:false,execution_authorized:false});
 }catch{
  return respond({ok:false,error:"RG_JIT_EVIDENCE_UNAVAILABLE",chargeable:false},503);
 }
}
export async function purgePrivateStrategicRiskGate(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 try{
  await env.DB.prepare("DELETE FROM corridor_risk_gate_strategic_snapshots "+
   "WHERE checked_at < ?").bind(new Date(now-AGE).toISOString()).run();
  return {ok:true};
 }catch{return {ok:false}}
}
