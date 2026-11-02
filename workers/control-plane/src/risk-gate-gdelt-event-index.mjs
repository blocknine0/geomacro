/** Private D1, authenticated GDELT CAMEO index shortlist.
 * Publication timestamp, facts, independent source, rights and signed GRO
 * remain UNVERIFIED; never a paid or customer-facing event.
 */
import {validGdeltPrivateItem,GDELT_RISK_EVENT_SCHEMA}
 from "../../../lib/risk-gate-gdelt-event-wide-net.mjs";
const MAX=40,TTL=72*3600000,HASH=/^[a-f0-9]{64}$/u;
const respond=(data,status=200)=>Response.json(data,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
async function sha(x){
 const a=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x));
 return [...new Uint8Array(a)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function putPrivateRiskGateGdelt(env,packet,now=Date.now()){
 const reject=()=>respond({ok:false,error:"RG_GDELT_PACKET_INVALID",chargeable:false},422);
 if(!packet||typeof packet!=="object"||Array.isArray(packet)||
  Object.keys(packet).sort().join("|")!==[
   "schema","checked_at","batch_at","items","archive_sha256","provider",
   "source_event_verification","commercial_rights_verified","customer_debit_enabled",
   "predge_writes",
   "b2_archive_key","b2_manifest_sha256","b2_exact_readback_verified",
   "b2_archived_event_count","b2_archive_complete"].sort().join("|")||
  packet.schema!==GDELT_RISK_EVENT_SCHEMA||packet.provider!=="gdelt_v2_15m"||
  packet.source_event_verification!=="INDEX_ONLY"||
  packet.commercial_rights_verified!==false||
  packet.customer_debit_enabled!==false||packet.predge_writes!==0||
  !HASH.test(packet.archive_sha256)||!HASH.test(packet.b2_manifest_sha256)||
  packet.b2_exact_readback_verified!==true||
  packet.b2_archive_complete!==true||
  !Number.isInteger(packet.b2_archived_event_count)||
  packet.b2_archived_event_count<packet.items?.length||
  packet.b2_archived_event_count>30000||
  typeof packet.b2_archive_key!=="string"||
  !/^geomacro-evidence\/v1\/private\/gdelt-event-wide-net\/\d{12}\/[a-f0-9]{64}\.json$/u.test(packet.b2_archive_key)||
  !packet.b2_archive_key.endsWith("/"+packet.b2_manifest_sha256+".json")||
  !Number.isFinite(Date.parse(packet.checked_at))||
  Math.abs(now-Date.parse(packet.checked_at))>15*60000||
  !Number.isFinite(Date.parse(packet.batch_at))||
  now-Date.parse(packet.batch_at)>2*3600000||
  !Array.isArray(packet.items)||packet.items.length>MAX)return reject();
 const seen=new Set();
 for(const x of packet.items){
  if(!validGdeltPrivateItem(x,now)||x.archive_sha256!==packet.archive_sha256||
   x.gdelt_batch_at!==packet.batch_at||seen.has(x.id)||
   await sha(["gdelt_v2_15m",x.gdelt_event_id,x.gdelt_batch_at,
    x.source_url_sha256].join("\x1f"))!==x.id)return reject();
  seen.add(x.id);
 }
 if(!env?.DB?.prepare||!env?.DB?.batch)
  return respond({ok:false,error:"RG_GDELT_D1_UNAVAILABLE",chargeable:false},503);
 const checked_at=new Date(now).toISOString(),cutoff=new Date(now-TTL).toISOString();
 try{
  if(packet.items.length){
   const writes=packet.items.map(x=>env.DB.prepare(
    "INSERT INTO risk_gate_gdelt_event_index "+
    "(event_ref_id,gdelt_event_id,cameo_code,cameo_root,gdelt_index_at,"+
    "batch_at,action_geo_fips,corridor_hints_json,source_url_sha256,archive_sha256,"+
    "first_seen_at,last_seen_at,b2_archive_key,b2_manifest_sha256) "+
    "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) "+
    "ON CONFLICT(event_ref_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,"+
    "b2_archive_key=excluded.b2_archive_key,"+
    "b2_manifest_sha256=excluded.b2_manifest_sha256 "+
    "WHERE risk_gate_gdelt_event_index.archive_sha256=excluded.archive_sha256 "+
    "AND (risk_gate_gdelt_event_index.b2_archive_key IS NULL "+
    "OR risk_gate_gdelt_event_index.b2_archive_key=excluded.b2_archive_key) "+
    "AND (risk_gate_gdelt_event_index.b2_manifest_sha256 IS NULL "+
    "OR risk_gate_gdelt_event_index.b2_manifest_sha256=excluded.b2_manifest_sha256)")
    .bind(x.id,x.gdelt_event_id,x.cameo_code,x.cameo_root,x.gdelt_index_at,
      x.gdelt_batch_at,x.action_geo_fips,JSON.stringify(x.corridor_hints),
      x.source_url_sha256,x.archive_sha256,checked_at,checked_at,
      packet.b2_archive_key,packet.b2_manifest_sha256));
   await env.DB.batch(writes);
  }
  await env.DB.prepare("DELETE FROM risk_gate_gdelt_event_index "+
   "WHERE gdelt_index_at < ?").bind(cutoff).run();
  const rows=packet.items.length?
    (await env.DB.prepare("SELECT event_ref_id,gdelt_event_id,cameo_code,"+
     "cameo_root,gdelt_index_at,batch_at,action_geo_fips,corridor_hints_json,"+
     "source_url_sha256,archive_sha256,b2_archive_key,b2_manifest_sha256 "+
     "FROM risk_gate_gdelt_event_index "+
     "WHERE event_ref_id IN ("+packet.items.map(()=>"?").join(",")+")")
     .bind(...packet.items.map(x=>x.id)).all())?.results??[]:[];
  const byId=new Map(rows.map(r=>[r.event_ref_id,r]));
  const exact=packet.items.filter(x=>{
   const r=byId.get(x.id);
   return r&&r.gdelt_event_id===x.gdelt_event_id&&
    r.cameo_code===x.cameo_code&&r.cameo_root===x.cameo_root&&
    r.gdelt_index_at===x.gdelt_index_at&&r.batch_at===x.gdelt_batch_at&&
    r.action_geo_fips===x.action_geo_fips&&
    r.corridor_hints_json===JSON.stringify(x.corridor_hints)&&
    r.source_url_sha256===x.source_url_sha256&&r.archive_sha256===x.archive_sha256&&
    r.b2_archive_key===packet.b2_archive_key&&
    r.b2_manifest_sha256===packet.b2_manifest_sha256;
  }).length;
  if(exact!==packet.items.length)return respond({ok:false,
   error:"RG_GDELT_D1_READBACK_MISMATCH",submitted:packet.items.length,
   readback:exact,chargeable:false},503);
  // A zero-CAMEO batch still gets a receipt. The authoritative source of
  // continuity is the verified B2 manifest + D1 batch acceptance, never a
  // nonempty article count. Immutable batch identity guards any reruns.
  await env.DB.prepare("INSERT INTO risk_gate_gdelt_verified_batches "+
   "(batch_at,archive_sha256,b2_archive_key,b2_manifest_sha256,"+
   "b2_event_reference_count,d1_hot_record_count,verified_at) "+
   "VALUES (?,?,?,?,?,?,?) "+
   "ON CONFLICT(batch_at) DO UPDATE SET verified_at=excluded.verified_at "+
   "WHERE risk_gate_gdelt_verified_batches.archive_sha256=excluded.archive_sha256 "+
   "AND risk_gate_gdelt_verified_batches.b2_manifest_sha256=excluded.b2_manifest_sha256 "+
   "AND risk_gate_gdelt_verified_batches.b2_archive_key=excluded.b2_archive_key "+
   "AND risk_gate_gdelt_verified_batches.b2_event_reference_count=excluded.b2_event_reference_count "+
   "AND risk_gate_gdelt_verified_batches.d1_hot_record_count=excluded.d1_hot_record_count")
   .bind(packet.batch_at,packet.archive_sha256,packet.b2_archive_key,
    packet.b2_manifest_sha256,packet.b2_archived_event_count,
    packet.items.length,checked_at).run();
  const batch=await env.DB.prepare("SELECT batch_at,archive_sha256,"+
   "b2_archive_key,b2_manifest_sha256,b2_event_reference_count,"+
   "d1_hot_record_count FROM risk_gate_gdelt_verified_batches WHERE batch_at=?")
   .bind(packet.batch_at).first();
  if(!batch||batch.archive_sha256!==packet.archive_sha256||
     batch.b2_archive_key!==packet.b2_archive_key||
     batch.b2_manifest_sha256!==packet.b2_manifest_sha256||
     batch.b2_event_reference_count!==packet.b2_archived_event_count||
     batch.d1_hot_record_count!==packet.items.length)
    return respond({ok:false,error:"RG_GDELT_BATCH_RECEIPT_MISMATCH",chargeable:false},503);

  return respond({ok:true,schema:"geomacro.risk-gate-gdelt-d1-acceptance.v1",
   provider:"gdelt_v2_15m",source_zip_integrity_proof:packet.archive_sha256,
   b2_archive_key:packet.b2_archive_key,
   b2_manifest_sha256:packet.b2_manifest_sha256,
   b2_exact_readback_verified:true,
   shortlisted:packet.items.length,exact_d1_readback:exact,
   b2_archived_event_count:packet.b2_archived_event_count,
   batch_receipt_verified:true,
   source_event_verification:"INDEX_ONLY",
   verified_event_count:0,commercial_rights_verified:false,
   signed_gro_generated:false,customer_credits_debited:0,
   risk_gate_paid_delivery_enabled:false,
   website_intelligence_writes:0,predge_writes:0,chargeable:false,retention_hours:72});
 }catch{return respond({ok:false,error:"RG_GDELT_D1_WRITE_UNAVAILABLE",chargeable:false},503)}
}
export async function readPrivateRiskGateGdelt(env,query=new URLSearchParams(),now=Date.now()){
 if(!env?.DB?.prepare)return respond({ok:false,error:"RG_GDELT_D1_UNAVAILABLE"},503);
 const limit=query.get("limit")??"40";
 if(!/^(?:[1-9]|[1-3]\d|40)$/u.test(limit))
  return respond({ok:false,error:"RG_GDELT_LIMIT_INVALID"},400);
 try{
  const rows=(await env.DB.prepare("SELECT event_ref_id,gdelt_event_id,cameo_code,"+
   "cameo_root,gdelt_index_at,action_geo_fips,corridor_hints_json,source_url_sha256,"+
   "b2_archive_key,b2_manifest_sha256 "+
   "FROM risk_gate_gdelt_event_index WHERE gdelt_index_at>=? "+
   "ORDER BY gdelt_index_at DESC LIMIT ?")
    .bind(new Date(now-TTL).toISOString(),Number(limit)).all())?.results??[];
  return respond({ok:true,schema:"geomacro.risk-gate-gdelt-index-private-read.v1",
   provider:"gdelt_v2_15m",count:rows.length,
   entries:rows.map(r=>({event_ref_id:r.event_ref_id,
     gdelt_event_id:r.gdelt_event_id,cameo_code:r.cameo_code,
     cameo_root:r.cameo_root,gdelt_index_at:r.gdelt_index_at,
     action_geo_fips:r.action_geo_fips,
     corridor_hints:JSON.parse(r.corridor_hints_json),
     source_url_sha256:r.source_url_sha256,
     b2_archive_key:r.b2_archive_key,b2_manifest_sha256:r.b2_manifest_sha256,
     verified_event:false,commercial_eligible:false})),
   chargeable:false,signed_gro_generated:false,
   independent_event_verified:false,customer_debit_enabled:false});
 }catch{return respond({ok:false,error:"RG_GDELT_D1_READ_UNAVAILABLE"},503)}
}
/**
 * Authenticated B2+D1 continuity probe. Healthy means last fully verified
 * *source batch* is <=45min old, not that any real incident is verified.
 */
export async function readPrivateRiskGateGdeltContinuity(env,now=Date.now()){
 if(!env?.DB?.prepare)return respond({ok:false,error:"RG_GDELT_CONTINUITY_D1_UNAVAILABLE"},503);
 try{
  const row=await env.DB.prepare("SELECT batch_at,b2_manifest_sha256,"+
   "b2_event_reference_count,d1_hot_record_count,verified_at "+
   "FROM risk_gate_gdelt_verified_batches ORDER BY batch_at DESC LIMIT 1").first();
  if(!row)return respond({ok:true,schema:"geomacro.risk-gate-gdelt-continuity.v1",
   healthy:false,last_verified_batch_at:null,
   reason:"NO_SUCCESSFUL_GDELT_B2_D1_SOURCE_BATCH",
   verified_event_count:0,chargeable:false});
  const age=now-Date.parse(row.batch_at);
  const healthy=Number.isFinite(age)&&age>=0&&age<=45*60000;
  return respond({ok:true,schema:"geomacro.risk-gate-gdelt-continuity.v1",
   healthy,last_verified_batch_at:row.batch_at,
   last_b2_manifest_sha256:row.b2_manifest_sha256,
   last_b2_archived_events:row.b2_event_reference_count,
   last_d1_hot_records:row.d1_hot_record_count,
   batch_lag_minutes:Math.max(0,Math.floor(age/60000)),
   reason:healthy?"SOURCE_BATCH_WITHIN_45_MINUTES":"SOURCE_BATCH_STALE",
   verified_event_count:0,signed_gro_generated:false,chargeable:false});
 }catch{return respond({ok:false,error:"RG_GDELT_CONTINUITY_D1_READ_UNAVAILABLE"},503)}
}
/** Independent receipt for one exact immutable GDELT source batch.
 * Never substitute the latest different batch: competing 15-minute syncs
 * may legitimately complete out of order. Owner-authenticated route only.
 */
export async function readPrivateRiskGateGdeltBatchReceipt(env,query=new URLSearchParams()){
 const raw=query.get("batch_at");
 if(!raw||query.size!==1||
   !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)||
   !Number.isFinite(Date.parse(raw)))
  return respond({ok:false,error:"RG_GDELT_BATCH_ID_INVALID"},400);
 if(!env?.DB?.prepare)
  return respond({ok:false,error:"RG_GDELT_D1_UNAVAILABLE"},503);
 try{
  const row=await env.DB.prepare(
   "SELECT batch_at,archive_sha256,b2_archive_key,b2_manifest_sha256,"+
   "b2_event_reference_count,d1_hot_record_count,verified_at "+
   "FROM risk_gate_gdelt_verified_batches WHERE batch_at=?"
  ).bind(raw).first();
  if(!row)return respond({ok:false,error:"RG_GDELT_BATCH_NOT_FOUND"},404);
  const valid=row.batch_at===raw&&
   HASH.test(String(row.archive_sha256??""))&&
   HASH.test(String(row.b2_manifest_sha256??""))&&
   typeof row.b2_archive_key==="string"&&
   row.b2_archive_key.endsWith("/"+row.b2_manifest_sha256+".json")&&
   Number.isInteger(row.b2_event_reference_count)&&
   Number.isInteger(row.d1_hot_record_count)&&
   row.b2_event_reference_count>=row.d1_hot_record_count&&
   row.d1_hot_record_count>=0&&
   Number.isFinite(Date.parse(row.verified_at));
  if(!valid)return respond({ok:false,error:"RG_GDELT_BATCH_RECEIPT_CORRUPT"},503);
  return respond({ok:true,schema:"geomacro.risk-gate-gdelt-exact-batch-receipt.v1",
   batch_at:row.batch_at,archive_sha256:row.archive_sha256,
   b2_archive_key:row.b2_archive_key,
   b2_manifest_sha256:row.b2_manifest_sha256,
   b2_archived_event_count:row.b2_event_reference_count,
   d1_hot_sample_count:row.d1_hot_record_count,
   exact_batch_receipt_verified:true,independent_event_verified:false,
   signed_gro_generated:false,chargeable:false});
 }catch{return respond({ok:false,error:"RG_GDELT_BATCH_RECEIPT_READ_UNAVAILABLE"},503)}
}
export async function purgePrivateRiskGateGdelt(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 try{
  const cutoff=new Date(now-TTL).toISOString();
  await env.DB.prepare("DELETE FROM risk_gate_gdelt_event_index "+
   "WHERE gdelt_index_at < ?").bind(cutoff).run();
  await env.DB.prepare("DELETE FROM risk_gate_gdelt_verified_batches "+
   "WHERE batch_at < ?").bind(cutoff).run();
  return {ok:true}
 }catch{return {ok:false}}
}
