/**
 * Autonomous, D1-leased 72-hour same-event corroboration and cell-state outbox.
 * Consumes only admitted metadata from the existing source discovery pipeline.
 * No news body, raw subscriber data, customer funding or signing keys.
 */
import {runRiskGatePartitioned} from "./risk-gate-partitioned-concurrency.mjs";
import {CATEGORIES} from "./unified-risk-categories.mjs";
import {hot50RiskGateEnabled,isHot50RiskCountry} from "./risk-gate-hot50-scope.mjs";
const SHA=/^[a-f0-9]{64}$/u;
const ISO3=/^[A-Z]{3}$/u;
const DAY=86400000,MAX_EVENTS=20;
const iso=n=>new Date(n).toISOString();
const host=s=>typeof s==="string"&&/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu.test(s)?
 s.toLowerCase().replace(/^www\./u,""):null;
const boundedImpact=x=>Number.isFinite(Number(x))&&Number(x)>=0&&Number(x)<=100?Number(x):null;
/**
 * Both original pages must have actually been fetched. Mere Google/index
 * headlines, syndicated copies, repeated links and URL host counts do not
 * establish verified independent same-event evidence.
 */
export function classifyRiskGateCorroboration(rows,now=Date.now()){
 const recent=(rows??[]).filter(r=>SHA.test(String(r?.event_id??""))&&
  Number.isFinite(Date.parse(r.event_at))&&Date.parse(r.event_at)>=now-72*3600000&&
  Date.parse(r.event_at)<=now+60000);
 const seen=new Map();
 for(const r of recent){
  const publisher=host(r.source_host);
  if(!publisher)continue;
  const key=publisher.replace(/^(?:www|m|amp)\./u,"");
  if(!seen.has(key))seen.set(key,r);
  else if(Number(r.original_page_fetched)===1&&r.fact_basis==="ARTICLE_FULL_TEXT")
   seen.set(key,r);
 }
 const actual=[...seen.values()].filter(r=>Number(r.original_page_fetched)===1&&
  r.fact_basis==="ARTICLE_FULL_TEXT"&&boundedImpact(r.impact_factor)!==null);
 // Preserve the existing stricter independent-publication time constraint
 // until upstream Facts/Rights attestation explicitly upgrades a source.
 const times=actual.map(x=>Date.parse(x.event_at));
 const independentlyCorroborated=actual.length>=2&&
  Math.max(...times)-Math.min(...times)>=6*3600000;
 const verifiedSources=actual.length;
 const impacts=actual.map(x=>Number(x.impact_factor));
 return Object.freeze({
  metadata_publishers:Math.min(40,seen.size),
  independently_verified_sources:Math.min(40,verifiedSources),
  corroborated:independentlyCorroborated,
  // Derived quantization is an observed signal, not an institutional GRO.
  derived_impact_0_100:independentlyCorroborated?
   Number((impacts.reduce((a,b)=>a+b,0)/impacts.length).toFixed(2)):null,
  textual_content_retained:false,source_rights_automatically_granted:false,
 });
}
async function runEvent(env,row,now){
 const time=iso(now),retry=iso(now+2*60000);
 const key=row.event_key;
 if(!SHA.test(String(key))||!SHA.test(String(row.event_id))||
  !CATEGORIES.includes(row.category)||
  !["COUNTRY","CORRIDOR"].includes(row.subject_type)||
  row.subject_type==="COUNTRY"&&!ISO3.test(row.subject_id)||
  hot50RiskGateEnabled(env)&&
   (row.subject_type!=="COUNTRY"||!isHot50RiskCountry(row.subject_id)))
  return {status:"OUTSIDE_ACTIVE_SCOPE"};
 const lease=await env.DB.prepare(
  "UPDATE risk_gate_progressive_event_outbox SET state='PROCESSING',"+
  "attempts=attempts+1,updated_at=?,next_attempt_at=? WHERE event_key=? "+
  "AND state IN ('PENDING','WAITING_EVIDENCE','PROCESSING') "+
  "AND next_attempt_at<=? RETURNING event_key")
  .bind(time,retry,key,time).first();
 if(lease?.event_key!==key)return {status:"LEASE_NOT_ACQUIRED"};
 const cutoff=iso(now-72*3600000);
 const page=await env.DB.prepare(
  "SELECT event_id,source_id,source_host,event_at,impact_factor,fact_basis,"+
  "original_page_fetched FROM unverified_observations "+
  "WHERE event_id=? AND entity_type=? AND entity_id=? AND category=? "+
  "AND event_at>=? AND event_at<=? ORDER BY event_at DESC LIMIT 40")
  .bind(row.event_id,row.subject_type,row.subject_id,row.category,cutoff,time).all();
 if(!Array.isArray(page?.results)||page.results.length>40)
  throw Error("RISK_AUTONOMY_ORIGINAL_READ_UNAVAILABLE");
 const proof=classifyRiskGateCorroboration(page.results,now);
 if(proof.corroborated){
  const update=await env.DB.prepare(
   "UPDATE unverified_observations SET status='CORROBORATED',"+
   "independent_source_count=? WHERE event_id=? AND entity_type=? "+
   "AND entity_id=? AND category=? AND original_page_fetched=1 "+
   "AND fact_basis='ARTICLE_FULL_TEXT'")
   .bind(proof.independently_verified_sources,row.event_id,row.subject_type,
     row.subject_id,row.category).run();
  if(update?.success===false)throw Error("RISK_AUTONOMY_PROMOTION_FAILED");
 }
 const state=proof.corroborated?"CORROBORATED":
   Date.parse(row.event_at)<now-72*3600000?"EXPIRED":"WAITING_EVIDENCE";
 const cellState=proof.corroborated?"CORROBORATED_ORIGINAL_EVIDENCE":
  proof.metadata_publishers>0?"OBSERVED_UNVERIFIED":"INSUFFICIENT_EVIDENCE";
 const impact=proof.corroborated?proof.derived_impact_0_100:null;
 const cell=await env.DB.prepare(
  "INSERT INTO risk_gate_progressive_cell_state("+
  "subject_type,subject_id,category,observed_count,independently_verified_sources,"+
  "corroborated_events,derived_impact_0_100,evidence_status,latest_event_id,updated_at) "+
  "VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_type,subject_id,category) "+
  "DO UPDATE SET observed_count=MAX(observed_count,excluded.observed_count),"+
  "independently_verified_sources=MAX(independently_verified_sources,excluded.independently_verified_sources),"+
  "corroborated_events=MAX(corroborated_events,excluded.corroborated_events),"+
  "derived_impact_0_100=COALESCE(excluded.derived_impact_0_100,derived_impact_0_100),"+
  "evidence_status=CASE WHEN corroborated_events>0 OR excluded.corroborated_events>0 "+
  "THEN 'CORROBORATED_ORIGINAL_EVIDENCE' ELSE excluded.evidence_status END,"+
  "latest_event_id=excluded.latest_event_id,updated_at=excluded.updated_at")
  .bind(row.subject_type,row.subject_id,row.category,proof.metadata_publishers,
   proof.independently_verified_sources,proof.corroborated?1:0,
   impact,cellState,row.event_id,time).run();
 if(cell?.success===false)throw Error("RISK_AUTONOMY_CELL_UPSERT_FAILED");
 const marked=await env.DB.prepare(
  "UPDATE risk_gate_progressive_event_outbox SET state=?,updated_at=?,"+
  "next_attempt_at=? WHERE event_key=? AND state='PROCESSING'")
  .bind(state,time,state==="WAITING_EVIDENCE"?iso(now+20*60000):time,key).run();
 if(marked?.success===false)throw Error("RISK_AUTONOMY_EVENT_ACK_FAILED");
 return {status:state,subject_type:row.subject_type,subject_id:row.subject_id,
  category:row.category,independent_originals:proof.independently_verified_sources,
  publisher_index_count:proof.metadata_publishers,
  source_corroborated:proof.corroborated,derived_impact_0_100:impact};
}
export async function runRiskGateAutonomousCorroborator(env,{now=Date.now()}={}){
 if(!env?.DB?.prepare||!Number.isFinite(now))
  return {ok:false,error:"RISK_AUTONOMY_D1_UNAVAILABLE"};
 try{
  const page=await env.DB.prepare(
   "SELECT event_key,observation_id,event_id,subject_type,subject_id,category,"+
   "event_at,state,attempts FROM risk_gate_progressive_event_outbox "+
   "WHERE state IN ('PENDING','WAITING_EVIDENCE','PROCESSING') "+
   "AND next_attempt_at<=? ORDER BY next_attempt_at,event_at LIMIT 20")
   .bind(iso(now)).all();
  if(!Array.isArray(page?.results)||page.results.length>MAX_EVENTS)
   throw Error("RISK_AUTONOMY_OUTBOX_READ_INVALID");
  const tasks=page.results.map(x=>({...x,type:x.subject_type,id:x.subject_id}));
  const completed=await runRiskGatePartitioned(tasks,x=>runEvent(env,x,now));
  return {ok:completed.failed===0,schema:"geomacro.risk-gate-autonomous-corrob.v1",
   processed:completed.subject_count,corroborated:completed.receipts.filter(x=>
    x.ok&&x.value?.status==="CORROBORATED").length,
   deferred:completed.receipts.filter(x=>x.ok&&x.value?.status==="WAITING_EVIDENCE").length,
   failed:completed.failed,partition_count:completed.partition_count,
   raw_text_stored:false,source_rights_granted:false,
   signed_gro_automatically_fabricated:false,commercial_billing:false};
 }catch{return {ok:false,error:"RISK_AUTONOMOUS_CORROBORATION_FAILED"};}
}
