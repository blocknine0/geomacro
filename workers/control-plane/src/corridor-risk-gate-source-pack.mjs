/** Authenticated private Risk Gate *preparation*, never a Risk Gate decision.
 * Exact first-party D1 source readback is mandatory before this materializes.
 */
import {RG_SOURCE_PACK_SCHEMA,buildRiskGateSourcePack}
 from "../../../lib/risk-gate-source-pack.mjs";
const TTL=72*3600000,HEX=/^[0-9a-f]{64}$/u;
const reply=(body,status=200)=>Response.json(body,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"
}});
const digest=async value=>{
 const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");
};
const TYPES=Object.freeze({
 NATIVE_RSS:{table:"corridor_native_news_candidates",id:"candidate_id",date:"native_published_at"},
 CRYPTO_INDIVIDUAL:{table:"corridor_crypto_individual_research",id:"article_id",date:"published_at",source:"'cryptocompare_news'"},
 OFFICIAL_REFERENCE:{table:"corridor_official_reference_context",id:"reference_id",date:"observation_period"}
});
async function checkSourceD1(env,refs){
 for(const [kind,spec] of Object.entries(TYPES)){
  const wanted=refs.filter(r=>r.kind===kind);
  if(!wanted.length)continue;
  const rows=(await env.DB.prepare(
   "SELECT "+spec.id+" AS reference_id,"+(spec.source??"source_id")+" AS source_id,"+
   spec.date+" AS source_period FROM "+
   spec.table+" WHERE "+spec.id+" IN ("+wanted.map(()=>"?").join(",")+")"
  ).bind(...wanted.map(r=>r.id)).all())?.results??[];
  const found=new Map(rows.map(r=>[r.reference_id,r]));
  for(const ref of wanted){
   const row=found.get(ref.id);
   if(!row||row.source_id!==ref.source_id||
     row.source_period!==ref.source_period)return false;
  }
 }
 return true;
}
export async function putPrivateRiskGateSourcePack(env,payload,now=Date.now()){
 let pack,id,body,hash;
 try{
  if(!payload||payload.schema!==RG_SOURCE_PACK_SCHEMA||
   !Array.isArray(payload.source_refs)||typeof payload.checked_at!=="string"||
   Math.abs(now-Date.parse(payload.checked_at))>15*60000||
   !Number.isFinite(Date.parse(payload.checked_at)))throw Error("RG_INVALID");
  pack=buildRiskGateSourcePack({checked_at:payload.checked_at,refs:payload.source_refs});
  if(JSON.stringify(payload)!==JSON.stringify(pack))throw Error("RG_MUTATED");
  body=JSON.stringify(pack);
  if(body.length>24000)throw Error("RG_TOO_LARGE");
  id=await digest(pack.checked_at+"\x1f"+pack.source_refs.map(r=>r.kind+":"+r.id).join("|"));
  hash=await digest(body);
 }catch{return reply({ok:false,error:"RG_SOURCE_PACK_PROOF_INVALID",chargeable:false},422)}
 if(!env?.DB?.prepare)return reply({ok:false,error:"RG_SOURCE_PACK_D1_UNAVAILABLE",chargeable:false},503);
 const cutoff=new Date(now-TTL).toISOString(),clock=new Date(now).toISOString();
 try{
  if(!await checkSourceD1(env,pack.source_refs))
   return reply({ok:false,error:"RG_CANONICAL_SOURCE_D1_NOT_VERIFIED",
    chargeable:false},409);
  await env.DB.prepare("INSERT INTO corridor_risk_gate_source_packs "+
   "(snapshot_id,checked_at,content_sha256,source_ref_count,structured_json,last_verified_at) "+
   "VALUES (?,?,?,?,?,?) ON CONFLICT(snapshot_id) DO UPDATE SET "+
   "last_verified_at=excluded.last_verified_at "+
   "WHERE corridor_risk_gate_source_packs.content_sha256=excluded.content_sha256")
    .bind(id,pack.checked_at,hash,pack.source_refs.length,body,clock).run();
  await env.DB.prepare("DELETE FROM corridor_risk_gate_source_packs WHERE checked_at < ?")
   .bind(cutoff).run();
  const row=await env.DB.prepare("SELECT snapshot_id,checked_at,content_sha256,"+
   "source_ref_count,structured_json FROM corridor_risk_gate_source_packs WHERE snapshot_id=?")
   .bind(id).first();
  if(!row||row.snapshot_id!==id||row.content_sha256!==hash||
     row.source_ref_count!==pack.source_refs.length||row.structured_json!==body||
     row.checked_at!==pack.checked_at)
   return reply({ok:false,error:"RG_SOURCE_PACK_D1_READBACK_MISMATCH",chargeable:false},503);
  return reply({ok:true,schema:"geomacro.risk-gate-source-pack-d1-receipt.v1",
   snapshot_id:id,verified:1,reference_rows_crosschecked:pack.source_refs.length,
   pricing_variant_count:3,three_variant_structure_verified:true,
   canonical_d1_source_provenance_checked:true,independent_events_verified:0,
   signed_gro_generated:false,commercial_eligible:false,chargeable:false,
   new_sales_enabled:false,execution_authorized:false,
   website_intelligence_writes:0,predge_writes:0,retention_hours:72});
 }catch{return reply({ok:false,error:"RG_SOURCE_PACK_D1_WRITE_UNAVAILABLE",chargeable:false},503)}
}
/**
 * Canonical D1 server-local source selection. This avoids a race where a
 * GitHub receipt sampled IDs before duplicate normalization/other writes.
 * All refs are selected from the same D1 that will verify and persist them.
 * This is still evidence-only research, not an event verifier or paid path.
 */
export async function materializeCanonicalRiskGateSourcePack(env,now=Date.now()){
 if(!env?.DB?.prepare)return reply({ok:false,error:"RG_CANONICAL_D1_UNAVAILABLE",chargeable:false},503);
 if(!Number.isFinite(now))return reply({ok:false,error:"RG_CANONICAL_CLOCK_INVALID",chargeable:false},422);
 const checked_at=new Date(now).toISOString(),cutoff=new Date(now-TTL).toISOString();
 try{
  const native=(await env.DB.prepare("SELECT candidate_id,source_id,native_published_at "+
   "FROM corridor_native_news_candidates WHERE native_published_at>=? "+
   "AND native_published_at<=? ORDER BY native_published_at DESC LIMIT 6")
   .bind(cutoff,checked_at).all())?.results??[];
  const crypto=(await env.DB.prepare("SELECT article_id,published_at "+
   "FROM corridor_crypto_individual_research WHERE published_at>=? "+
   "AND published_at<=? ORDER BY published_at DESC LIMIT 6")
   .bind(cutoff,checked_at).all())?.results??[];
  const official=(await env.DB.prepare("SELECT reference_id,source_id,observation_period "+
   "FROM corridor_official_reference_context WHERE last_observed_at>=? "+
   "AND source_id <> 'gdelt_v2_15m' "+
   "AND metric_id <> 'cryptocompare_24h_news_sample_count' "+
   "ORDER BY last_observed_at DESC LIMIT 6")
   .bind(cutoff).all())?.results??[];
  const refs=[
   ...native.map(r=>({id:r.candidate_id,kind:"NATIVE_RSS",
    source_id:r.source_id,source_period:r.native_published_at})),
   ...crypto.map(r=>({id:r.article_id,kind:"CRYPTO_INDIVIDUAL",
    source_id:"cryptocompare_news",source_period:r.published_at})),
   ...official.map(r=>({id:r.reference_id,kind:"OFFICIAL_REFERENCE",
    source_id:r.source_id,source_period:r.observation_period}))
  ];
  const pack=buildRiskGateSourcePack({checked_at,refs});
  const result=await putPrivateRiskGateSourcePack(env,pack,now);
  if(result.status!==200)return result;
  const receipt=await result.json();
  return reply({...receipt,
   selection:"CANONICAL_D1_SOURCE_LOCAL",
   source_classes:{native_rss:native.length,crypto_individual:crypto.length,
    official_reference:official.length},
   gdelt_batch_metrics_excluded:true});
 }catch{
  return reply({ok:false,error:"RG_CANONICAL_D1_SOURCE_SELECTION_UNAVAILABLE",
   chargeable:false},503);
 }
}
export async function readPrivateRiskGateSourcePack(env,params=new URLSearchParams(),now=Date.now()){
 if(!env?.DB?.prepare)return reply({ok:false,error:"RG_SOURCE_PACK_D1_UNAVAILABLE"},503);
 const limit=params.get("limit")??"3";
 if(!/^(?:[1-9]|10)$/u.test(limit))return reply({ok:false,error:"RG_SOURCE_PACK_LIMIT_INVALID"},400);
 try{
  const rows=(await env.DB.prepare("SELECT snapshot_id,content_sha256,structured_json "+
   "FROM corridor_risk_gate_source_packs WHERE checked_at>=? "+
   "ORDER BY checked_at DESC LIMIT ?")
   .bind(new Date(now-TTL).toISOString(),Number(limit)).all())?.results??[];
  return reply({ok:true,schema:"geomacro.risk-gate-source-pack-private-read.v1",
   channel:"CORRIDOR_ONLY",count:rows.length,
   records:rows.map(r=>({snapshot_id:r.snapshot_id,content_sha256:r.content_sha256,
    price_variants:JSON.parse(r.structured_json).price_variants.map(v=>({
     variant:v.price_variant,readiness:v.readiness,evidence_sample_count:v.evidence_sample_count
    }))})),chargeable:false,new_sales_enabled:false,execution_authorized:false});
 }catch{return reply({ok:false,error:"RG_SOURCE_PACK_D1_READ_UNAVAILABLE"},503)}
}
export async function purgePrivateRiskGateSourcePack(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 try{await env.DB.prepare("DELETE FROM corridor_risk_gate_source_packs WHERE checked_at < ?")
  .bind(new Date(now-TTL).toISOString()).run();return {ok:true};}catch{return {ok:false}}
}
