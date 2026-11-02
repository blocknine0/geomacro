/** Private-only source-grounded structured corridor research.
 * Every proof is recomputed AND matched with the independently stored
 * official reference row in D1. A hash is integrity, NOT independent truth.
 * No news, customer, PREDGE, payment or public endpoint is authorized.
 */
const AGE=72*3600000,MAX=12,HEX=/^[a-f0-9]{64}$/u;
const SOURCE_URL=Object.freeze({
 gdelt_v2_15m:"https://data.gdeltproject.org/gdeltv2/lastupdate.txt",
 world_bank_wdi:"https://api.worldbank.org/v2/",
 ecb_data:"https://data.ecb.europa.eu/",
 eurostat_data:"https://ec.europa.eu/eurostat/",
 imf_portwatch:"https://portwatch.imf.org/",
 fred_api:"https://fred.stlouisfed.org/",
 reliefweb_v2:"https://reliefweb.int/",
 cryptocompare_news:"https://www.cryptocompare.com/"
});
const reply=(value,status=200)=>Response.json(value,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer"
}});
function canonical(x){
 if(Array.isArray(x))return x.map(canonical);
 if(x&&typeof x==="object"&&!Array.isArray(x)){
  const out={};for(const k of Object.keys(x).sort())out[k]=canonical(x[k]);
  return out;
 }
 return x;
}
async function sha(s){
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
 return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
const contentHash=x=>sha(JSON.stringify(canonical(x)));
const iso=x=>typeof x==="string"&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
function bad(){throw Error("CORRIDOR_PRIVATE_PROOF_INVALID")}
const hasKeys=(obj,arr)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join("|")===arr.slice().sort().join("|");
const RKEYS=["id","channel","analysis_kind","source_reference_id","source_id",
 "source_proof_sha256","analysis_claim_sha256","source_name","source_url",
 "observation_period","source_observed_at","analysis_at","metric_id",
 "metric_value","unit","candidate_corridor_ids","what_happened",
 "why_it_matters","market_relevance","what_to_watch","evidence_and_confidence",
 "interpretation_is_automated","verified_news_event","signed_gro",
 "commercial_eligible","customer_delivery_authorized","website_intelligence_writes",
 "predge_writes"];
const PKEYS=["evidence_schema","source_reference_id","claim_sha256","claim",
 "source_record_id_recomputed","provenance","native_report_release_time_verified",
 "originating_article_body_verified","independent_sources_checked",
 "independently_corroborated","conflicting_source_records",
 "event_facts_verified","evidence_status","commercial_rights_verified",
 "customer_delivery_authorized","proof_sha256"];
const CKEYS=["source_id","source_url","metric_id","observation_period","numeric_value",
 "corridor_ids"];
const EKEYS=["evidence_type","source_name","source_url","period",
 "source_native_publication_time_verified","observation_retrieval_time",
 "independent_event_corroboration","causality_verified","source_specific_reuse_review",
 "confidence","commercial_permission_confirmed","source_proof_sha256",
 "source_observation_checksum_verified","evidence_status",
 "independent_source_comparisons","contradictions_detected"];
async function validate(packet,now){
 if(!hasKeys(packet,["schema","channel","checked_at","items",
    "website_intelligence_enabled","commercial_rights_verified"])||
   packet.schema!=="geomacro.corridor-private-research-d1-batch.v1"||
   packet.channel!=="CORRIDOR_ONLY"||
   packet.website_intelligence_enabled!==false||
   packet.commercial_rights_verified!==false||
   !iso(packet.checked_at)||Math.abs(now-Date.parse(packet.checked_at))>15*60000||
   !Array.isArray(packet.items)||packet.items.length>MAX)bad();
 const rows=[],ids=new Set();
 for(const item of packet.items){
  if(!hasKeys(item,["record","proof","record_sha256"]))bad();
  const {record:r,proof:p,record_sha256:d}=item;
  if(!hasKeys(r,RKEYS)||!hasKeys(p,PKEYS)||
    !hasKeys(p.claim,CKEYS)||!hasKeys(r.evidence_and_confidence,EKEYS))bad();
  const c=p.claim,e=r.evidence_and_confidence;
  if(!HEX.test(r.id)||!HEX.test(r.source_reference_id)||
   !HEX.test(r.source_proof_sha256)||!HEX.test(r.analysis_claim_sha256)||
   !HEX.test(p.proof_sha256)||!HEX.test(p.claim_sha256)||!HEX.test(d)||
   ids.has(r.id)||r.channel!=="CORRIDOR_ONLY"||
   r.analysis_kind!=="PRIVATE_SOURCE_GROUNDED_RESEARCH"||
   !Object.hasOwn(SOURCE_URL,r.source_id)||r.source_url!==SOURCE_URL[r.source_id]||
   r.source_id!==c.source_id||r.source_reference_id!==p.source_reference_id||
   c.source_url!==r.source_url||c.metric_id!==r.metric_id||
   c.observation_period!==r.observation_period||
   c.numeric_value!==r.metric_value||
   c.numeric_value===null||typeof c.numeric_value!=="number"||
   !Number.isFinite(c.numeric_value)||
   !iso(r.analysis_at)||!iso(r.source_observed_at)||
   Math.abs(Date.parse(r.analysis_at)-now)>15*60000||
   Math.abs(Date.parse(r.source_observed_at)-now)>15*60000||
   !Array.isArray(c.corridor_ids)||!Array.isArray(r.candidate_corridor_ids)||
   JSON.stringify(c.corridor_ids)!==JSON.stringify(r.candidate_corridor_ids)||
   r.verified_news_event!==false||r.signed_gro!==false||
   r.commercial_eligible!==false||r.customer_delivery_authorized!==false||
   r.website_intelligence_writes!==0||r.predge_writes!==0||
   r.interpretation_is_automated!==true||
   p.evidence_schema!=="geomacro.corridor-source-proof.v1"||
   p.source_record_id_recomputed!==true||
   p.provenance!=="REPRODUCIBLE_SOURCE_OBSERVATION_CHECKSUM"||
   p.native_report_release_time_verified!==false||
   p.originating_article_body_verified!==false||
   p.event_facts_verified!==false||
   p.commercial_rights_verified!==false||
   p.customer_delivery_authorized!==false||
   e.source_proof_sha256!==p.proof_sha256||
   e.source_observation_checksum_verified!==true||
   e.independent_event_corroboration!==false||
   e.source_native_publication_time_verified!==false||
   e.commercial_permission_confirmed!==false||
   e.causality_verified!==false||
   !Number.isInteger(e.independent_source_comparisons)||
   !Number.isInteger(e.contradictions_detected)||
   e.independent_source_comparisons!==p.independent_sources_checked||
   e.contradictions_detected!==p.conflicting_source_records||
   e.evidence_status!==p.evidence_status||
   !["SINGLE_SOURCE_OBSERVATION_ONLY","MULTISOURCE_NUMERIC_CLAIM_MATCH",
      "CONFLICTING_SOURCE_OBSERVATIONS"].includes(p.evidence_status)||
   r.analysis_claim_sha256!==p.claim_sha256||
   r.source_proof_sha256!==p.proof_sha256||
   ["what_happened","why_it_matters","market_relevance","what_to_watch"].some(
     k=>typeof r[k]!=="string"||r[k].length<20||r[k].length>720)||
   typeof r.unit!=="string"||r.unit.length>80||
   JSON.stringify({record:r,proof:p}).length>6000)bad();
  const native=await sha([c.source_id,c.metric_id,c.observation_period,
    String(c.numeric_value)].join("\x1f"));
  if(native!==r.source_reference_id||
   await sha("geomacro.corridor-private-structured-research.v1\x1f"+native)!==r.id||
   await contentHash(c)!==p.claim_sha256||
   await contentHash(Object.fromEntries(Object.entries(p).filter(([k])=>
     k!=="proof_sha256")))!==p.proof_sha256||
   await contentHash(r)!==d)bad();
  ids.add(r.id);
  rows.push([r.id,r.source_reference_id,r.source_id,p.claim_sha256,
   p.proof_sha256,d,JSON.stringify({record:r,proof:p})]);
 }
 return rows;
}
export async function putPrivateCorridorResearch(env,packet,now=Date.now()){
 let rows;
 try{rows=await validate(packet,now)}
 catch{return reply({ok:false,error:"CORRIDOR_PRIVATE_PROOF_INVALID",chargeable:false},422)}
 if(!env?.DB?.prepare||!env?.DB?.batch)
  return reply({ok:false,error:"CORRIDOR_PRIVATE_RESEARCH_D1_UNAVAILABLE",chargeable:false},503);
 const cutoff=new Date(now-AGE).toISOString(),clock=new Date(now).toISOString();
 try{
  // Read independently persisted canonical source observation, not just request claims.
  for(let i=0;i<rows.length;i+=MAX){
   const batch=rows.slice(i,i+MAX);
   const result=(await env.DB.prepare(
    "SELECT reference_id,source_id,metric_id,observation_period,numeric_value,"+
    "corridor_ids_json FROM corridor_official_reference_context WHERE reference_id IN ("+
    batch.map(()=>"?").join(",")+") AND last_observed_at >= ?"
   ).bind(...batch.map(r=>r[1]),cutoff).all())?.results??[];
   const byId=new Map(result.map(r=>[r.reference_id,r]));
   for(const item of batch){
    const raw=JSON.parse(item[6]),c=raw.proof.claim,found=byId.get(item[1]);
    if(!found||found.source_id!==c.source_id||found.metric_id!==c.metric_id||
     found.observation_period!==c.observation_period||
     found.numeric_value!==c.numeric_value||
     found.corridor_ids_json!==JSON.stringify(c.corridor_ids))
     return reply({ok:false,error:"CORRIDOR_PRIVATE_SOURCE_D1_UNVERIFIED",
       verified:0,chargeable:false},409);
   }
  }
  for(let i=0;i<rows.length;i+=MAX)
   await env.DB.batch(rows.slice(i,i+MAX).map(r=>env.DB.prepare(
    "INSERT INTO corridor_private_derived_research "+
    "(research_id,source_reference_id,source_id,claim_sha256,proof_sha256,"+
    "analysis_sha256,structured_json,created_at,last_verified_at) "+
    "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(research_id) DO UPDATE SET "+
    "proof_sha256=excluded.proof_sha256,"+
    "analysis_sha256=excluded.analysis_sha256,"+
    "structured_json=excluded.structured_json,"+
    "last_verified_at=excluded.last_verified_at "+
    "WHERE corridor_private_derived_research.source_reference_id=excluded.source_reference_id "+
    "AND corridor_private_derived_research.source_id=excluded.source_id "+
    "AND corridor_private_derived_research.claim_sha256=excluded.claim_sha256"
   ).bind(...r,clock,clock)));
  await purgeExpiredPrivateCorridorResearch(env,now);
  let verified=0;
  for(let i=0;i<rows.length;i+=MAX){
   const chunk=rows.slice(i,i+MAX);
   const found=(await env.DB.prepare(
    "SELECT research_id,source_reference_id,source_id,claim_sha256,proof_sha256,"+
    "analysis_sha256,structured_json FROM corridor_private_derived_research "+
    "WHERE research_id IN ("+chunk.map(()=>"?").join(",")+") AND last_verified_at >= ?"
   ).bind(...chunk.map(r=>r[0]),cutoff).all())?.results??[];
   const byId=new Map(found.map(r=>[r.research_id,r]));
   verified+=chunk.filter(r=>{
    const f=byId.get(r[0]);
    return f&&f.source_reference_id===r[1]&&f.source_id===r[2]&&
      f.claim_sha256===r[3]&&f.proof_sha256===r[4]&&
      f.analysis_sha256===r[5]&&f.structured_json===r[6];
   }).length;
  }
  if(verified!==rows.length)return reply({ok:false,
   error:"CORRIDOR_PRIVATE_D1_READBACK_MISMATCH",submitted:rows.length,
   verified,chargeable:false},503);
  return reply({ok:true,schema:"geomacro.corridor-private-research-d1-receipt.v1",
   channel:"CORRIDOR_ONLY",submitted:rows.length,verified,
   d1_source_fact_readback_verified:true,d1_derived_readback_verified:true,
   retention_hours:72,independent_real_world_event_verified:false,
   website_intelligence_writes:0,predge_writes:0,chargeable:false,
   signed_gro_generated:false,commercial_eligible:false,
   raw_publisher_content_stored:false});
 }catch{return reply({ok:false,error:"CORRIDOR_PRIVATE_RESEARCH_D1_FAILED",
    chargeable:false},503)}
}
export async function getPrivateCorridorResearch(env,params=new URLSearchParams(),now=Date.now()){
 if(!env?.DB?.prepare)return reply({ok:false,error:"CORRIDOR_PRIVATE_RESEARCH_D1_UNAVAILABLE"},503);
 const n=params.get("limit")??"12";
 if(!/^(?:[1-9]|1[0-9]|20)$/u.test(n))
  return reply({ok:false,error:"CORRIDOR_PRIVATE_RESEARCH_BAD_LIMIT"},400);
 try{
  const records=(await env.DB.prepare(
   "SELECT research_id,source_reference_id,claim_sha256,proof_sha256,analysis_sha256,"+
   "last_verified_at FROM corridor_private_derived_research WHERE last_verified_at>=? "+
   "ORDER BY last_verified_at DESC LIMIT ?"
  ).bind(new Date(now-AGE).toISOString(),Number(n)).all())?.results??[];
  return reply({ok:true,schema:"geomacro.corridor-private-research-private-read.v1",
   channel:"CORRIDOR_ONLY",count:records.length,records,
   chargeable:false,commercial_eligible:false,customer_delivery_authorized:false,
   independent_real_world_event_verified:false});
 }catch{return reply({ok:false,error:"CORRIDOR_PRIVATE_RESEARCH_D1_READ_FAILED"},503)}
}
export async function purgeExpiredPrivateCorridorResearch(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 try{await env.DB.prepare(
  "DELETE FROM corridor_private_derived_research WHERE last_verified_at < ?"
 ).bind(new Date(now-AGE).toISOString()).run();return {ok:true}}
 catch{return {ok:false}}
}
