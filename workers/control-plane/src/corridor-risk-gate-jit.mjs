/** Authenticated D1-only continuous strategic corridor watch and JIT preflight.
 * No paid API call, risk score, GRO signing, execution approval, or PREDGE.
 */
import {TRACKED_CORRIDORS,buildStrategicCorridorReadiness,
 chooseRiskGateProcessingTier,RG_CORRIDOR_FIRST_VERSION}
 from "../../../lib/risk-gate-corridor-first.mjs";
import {phase2hCountry,phase2hHeadlineCountryCandidate}
 from "../../../scripts/lib/phase2h-country-originals-195.mjs";
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
  if(typeof subject_id!=="string"||!phase2hCountry(subject_id))
   return respond({ok:false,error:"RG_JIT_CANONICAL_ISO3_INVALID",chargeable:false},400);
  const tier=chooseRiskGateProcessingTier({country_iso3:subject_id});
  // JIT, index-backed selective discovery: existing canonical
  // (category, original_published_at DESC) index allows 64 latest rows
  // per category. This avoids a full JSON-column LIKE scan on a large D1
  // table and bounds both rows read and headline-attribution CPU.
  const cutoff=new Date(now-AGE).toISOString();
  const cats=["geopolitics","macro","rare_earth"];
  try{
   const rows=[];
   for(const category of cats){
    const data=(await env.DB.prepare("SELECT record_id,category,original_published_at,"+
      "raw_sha256,raw_json FROM phase2h_private_raw_news "+
      "WHERE category=? AND original_published_at>=? AND original_published_at<=? "+
      "ORDER BY original_published_at DESC LIMIT 64")
      .bind(category,cutoff,new Date(now).toISOString()).all())?.results??[];
    if(!Array.isArray(data)||data.length>64)
      throw Error("RG_JIT_CATEGORY_BOUND_INVALID");
    rows.push(...data);
   }
   rows.sort((a,b)=>String(b.original_published_at).localeCompare(String(a.original_published_at)));
   const seen=new Set();
   const evidence=[];
   for(const r of rows){
    if(seen.has(r.record_id))continue;
    if(!HEX.test(r.record_id)||!HEX.test(r.raw_sha256)||
     !["geopolitics","macro","rare_earth"].includes(r.category)||
     typeof r.original_published_at!=="string"||
     !Number.isFinite(Date.parse(r.original_published_at))||
     now-Date.parse(r.original_published_at)>AGE)continue;
    let original;
    try{original=JSON.parse(r.raw_json).original}catch{continue}
    if(!original||typeof original.original_title!=="string"||
       original.original_published_at!==r.original_published_at||
       phase2hHeadlineCountryCandidate(original.original_title)!==subject_id)
     continue;
    seen.add(r.record_id);
    evidence.push({record_id:r.record_id,category:r.category,
     original_published_at:r.original_published_at,raw_sha256:r.raw_sha256,
     original_article_verified:false,commercial_rights_verified:false});
    if(evidence.length>=12)break;
   }
   return respond({ok:true,schema:"geomacro.risk-gate-jit-preflight.v1",
    subject:{type:"country",id:subject_id},processing_tier:tier.tier,
    discovery_evidence_count:evidence.length,evidence_references:evidence,
    search_scope:"BOUNDED_72H_LATEST_64_PER_CATEGORY",
    sampled_record_limit:192,
    verification_status:evidence.length?
      "ORIGINAL_HEADLINE_COUNTRY_CANDIDATES_UNVERIFIED":
      "COUNTRY_SPECIFIC_VERIFIED_EVIDENCE_REQUIRED",
    independently_verified_events:0,signed_gro:null,risk_gate_decision:null,
    customer_credits_debited:0,execution_authorized:false,
    chargeable:false,new_sales_enabled:false},202);
  }catch{
   return respond({ok:false,error:"RG_JIT_COUNTRY_D1_UNAVAILABLE",
    chargeable:false,customer_credits_debited:0},503);
  }
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
