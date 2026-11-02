/**
 * Opt-in, PRIVATE supplementary seven-day Supabase cache for source-checked
 * but NOT event-verified corridor five-part research. D1 stays canonical.
 * No customer, payment, PREDGE, public Risk Gate or raw-source write.
 */
const MAX_BATCH=8,SEVEN_DAYS=7*86400000;
const HASH=/^[a-f0-9]{64}$/u;
const DATE=ms=>new Date(ms).toISOString();
const SQL="SELECT research_id,analysis_sha256,created_at,structured_json "+
 "FROM corridor_private_derived_research "+
 "WHERE (created_at>? OR (created_at=? AND research_id>?)) "+
 "AND created_at>=? ORDER BY created_at ASC,research_id ASC LIMIT ?";
function settings(env){
 if(env?.GEOMACRO_SUPABASE_7D_ACCEPTANCE!=="ACCEPTED_NEW_PRIVATE_SUPABASE_7D")return null;
 const url=String(env?.GEOMACRO_SUPABASE_7D_URL??"").replace(/\/$/u,"");
 const token=String(env?.GEOMACRO_SUPABASE_7D_SERVICE_ROLE_KEY??"");
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(url)||token.length<32||token.length>4096)return null;
 return {url,token};
}
const prose=x=>typeof x==="string"&&x.length>=20&&x.length<=720&&!/https?:\/\/|<script|<iframe/iu.test(x);
export function projectCorridorDerivedSevenDay(row,now=Date.now()){
 if(!row||!HASH.test(row.research_id)||!HASH.test(row.analysis_sha256))return null;
 const created=Date.parse(row.created_at);
 if(!Number.isFinite(created)||created>now||created+SEVEN_DAYS<=now)return null;
 let raw;try{raw=JSON.parse(row.structured_json)}catch{return null}
 const r=raw?.record,p=raw?.proof;
 if(!r||!p||r.id!==row.research_id||r.verified_news_event!==false||
  r.signed_gro!==false||r.commercial_eligible!==false||r.customer_delivery_authorized!==false||
  !prose(r.what_happened)||!prose(r.why_it_matters)||
  !prose(r.market_relevance)||!prose(r.what_to_watch)||
  !Array.isArray(r.candidate_corridor_ids)||r.candidate_corridor_ids.length>12||
  r.candidate_corridor_ids.some(x=>typeof x!=="string"||!/^[a-z0-9_]{2,48}$/u.test(x))||
  typeof r.metric_id!=="string"||r.metric_id.length>80||
  (r.metric_value!==null&&!Number.isFinite(r.metric_value))||
  !Number.isInteger(p.independent_sources_checked)||p.independent_sources_checked<0||
  p.independent_sources_checked>50)return null;
 return {
  id:row.research_id,analysis_sha256:row.analysis_sha256,
  created_at:row.created_at,expires_at:DATE(created+SEVEN_DAYS),
  verified_event:false,commercial_ready:false,risk_gate_ready:false,
  structured_json:{
   schema:"geomacro.private-corridor-five-part-cache.v1",
   event_core:{summary:r.what_happened,analysis_at:r.analysis_at,
    incident_at:null,publication_clock_is_incident_clock:false},
   source_corroboration:{independent_sources_checked:p.independent_sources_checked,
    independent_event_verified:false,urls_disclosed:false},
   corridor_impact:{candidate_corridor_ids:r.candidate_corridor_ids,
    why_it_matters:r.why_it_matters,impact_verified:false},
   macro_shift:{market_relevance:r.market_relevance,metric_id:r.metric_id,
    metric_value:r.metric_value,unit:r.unit,causal_relationship_verified:false},
   risk_gate_metrics:{decision:"NOT_EVALUATED",confidence:null,
    false_positive_rating:null,gate_passed:false},
   what_to_watch:r.what_to_watch
  }
 };
}
const response=(payload,status=200)=>Response.json(payload,{
 status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}
});
async function rest(fetcher,cfg,path,init={}){
 const res=await fetcher(cfg.url+path,{...init,redirect:"manual",
  headers:{apikey:cfg.token,Authorization:"Bearer "+cfg.token,
   Accept:"application/json",...init.headers},
  signal:AbortSignal.timeout(8000)});
 if(!res.ok||res.status>=300)throw Error("SUPABASE_7D_REMOTE_REJECTED");
 return res;
}
/** Readback-first cursor: replay is idempotent after timeout or crash.
 * Unacceptable private research blocks progress, without hiding an invalid
 * record behind a silently advanced cursor.
 */
export async function syncCorridorSevenDay(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=settings(env);
 if(!cfg)return {ok:false,enabled:false,error:"SUPABASE_7D_NOT_CONFIGURED"};
 if(!env?.DB?.prepare||!Number.isFinite(now))
  return {ok:false,enabled:true,error:"SUPABASE_7D_D1_REQUIRED"};
 const db=env.DB;
 try{
  const last=await db.prepare("SELECT last_created_at,last_research_id "+
   "FROM supplementary_7d_cursors WHERE channel='corridor_derived'").first();
  const start=last?.last_created_at??DATE(now-72*3600000);
  const id=last?.last_research_id??"";
  const rows=(await db.prepare(SQL).bind(start,start,id,DATE(now-72*3600000),MAX_BATCH).all())?.results??[];
  if(!rows.length)return {ok:true,enabled:true,synced:0,verified_readback:true,chargeable:false};
  const records=rows.map(x=>projectCorridorDerivedSevenDay(x,now));
  if(records.some(x=>x===null))
   return {ok:false,enabled:true,error:"SUPABASE_7D_SOURCE_PROJECTION_INVALID"};
  const path="/rest/v1/geomacro_corridor_derived_7d";
  await rest(fetcher,cfg,path+"?on_conflict=id",{method:"POST",
   headers:{"Content-Type":"application/json",
    Prefer:"resolution=merge-duplicates,return=minimal"},
   body:JSON.stringify(records)});
  const keys=records.map(x=>x.id);
  const read=await rest(fetcher,cfg,path+
   "?select=id,analysis_sha256&id=in.("+keys.join(",")+")");
  const remote=await read.json();
  if(!Array.isArray(remote)||remote.length!==records.length||
   records.some(x=>!remote.some(y=>y.id===x.id&&y.analysis_sha256===x.analysis_sha256)))
   return {ok:false,enabled:true,error:"SUPABASE_7D_HASH_READBACK_MISMATCH"};
  const lastRow=rows[rows.length-1];
  await db.prepare("INSERT INTO supplementary_7d_cursors "+
   "(channel,last_created_at,last_research_id,last_verified_sync_at) "+
   "VALUES('corridor_derived',?,?,?) ON CONFLICT(channel) DO UPDATE SET "+
   "last_created_at=excluded.last_created_at,last_research_id=excluded.last_research_id,"+
   "last_verified_sync_at=excluded.last_verified_sync_at")
    .bind(lastRow.created_at,lastRow.research_id,DATE(now)).run();
  return {ok:true,enabled:true,synced:records.length,verified_readback:true,
   chargeable:false,raw_source_exported:false,predge_writes:0};
 }catch{return {ok:false,enabled:true,error:"SUPABASE_7D_SYNC_UNAVAILABLE"}}
}
export async function pruneCorridorSevenDay(env,{now=Date.now(),fetcher=fetch}={}){
 const cfg=settings(env);
 if(!cfg)return {ok:false,enabled:false};
 try{
  await rest(fetcher,cfg,"/rest/v1/geomacro_corridor_derived_7d?expires_at=lt."+
   encodeURIComponent(DATE(now)),{method:"DELETE",headers:{Prefer:"return=minimal"}});
  return {ok:true,enabled:true};
 }catch{return {ok:false,enabled:true,error:"SUPABASE_7D_TTL_UNAVAILABLE"}}
}
export async function corridorSevenDayStatus(env){
 if(!env?.DB?.prepare)return response({ok:false,error:"D1_UNAVAILABLE"},503);
 try{
  const cursor=await env.DB.prepare("SELECT channel,last_created_at,last_research_id,"+
   "last_verified_sync_at FROM supplementary_7d_cursors WHERE channel='corridor_derived'").first();
  return response({ok:true,configured:Boolean(settings(env)),cursor:cursor??null,
   canonical_authority:"D1",new_sales_enabled:false,predge_writes:0});
 }catch{return response({ok:false,error:"D1_UNAVAILABLE"},503)}
}
