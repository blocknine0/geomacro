/**
 * P2 #11: background, D1-only original->five-part GRO evidence draft processor.
 * Existing B2 archive ACK atomically enqueues each original using a D1 trigger.
 * This worker NEVER infers an independently verified event, a price movement,
 * a numerical impact score, source reuse rights, or a signed GRO object.
 * Bounded 20-row batches and resumable retro-backfill avoid new B2 requests.
 */
import {validPrivateRawNews} from "./phase2h-private-raw-news.mjs";

export const GRO_ENRICHMENT_SCHEMA="geomacro.gro-evidence-enrichment.v1";
const HEX=/^[a-f0-9]{64}$/u,CATS=new Set(["geopolitics","macro","rare_earth"]);
const SIZE=20,STALE_MS=72*3600_000;
const sha=async(value)=>{
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
};
const iso=now=>new Date(now).toISOString();
const fail=code=>{throw Error("GRO_EVIDENCE_"+code)};
function inspectSource(row,parsed,now){
 if(!HEX.test(row?.record_id)||!HEX.test(row?.raw_sha256)||
    !HEX.test(row?.b2_object_sha256)||!CATS.has(row?.category)||
    typeof row?.raw_json!=="string"||
    row?.b2_archived_at==null||
    !(row?.risk_country_iso3===null||/^[A-Z]{3}$/u.test(row.risk_country_iso3))||
    parsed?.record_id!==row.record_id||
    parsed?.raw_sha256!==row.raw_sha256||
    parsed?.category!==row.category||
    parsed?.original?.original_published_at!==row.original_published_at||
    Date.parse(row.b2_archived_at)>now+60000||
    !Number.isFinite(Date.parse(row.b2_archived_at)))
  fail("SOURCE_ARCHIVE_INTEGRITY_INVALID");
 const a=parsed.analysis;
 if(a?.schema!=="geomacro.phase2h.private-five-part.v1"||
    a.evidence_and_confidence?.independent_event_verified!==false||
    a.evidence_and_confidence?.original_article_page_verified!==false||
    parsed.commercial_rights_verified!==false||
    parsed.commercial_delivery_authorized!==false)
  fail("FIVE_PART_REVIEW_STATE_INVALID");
 const five_part={
  what_happened:a.what_happened,
  why_it_matters:a.why_it_matters,
  market_relevance:a.market_relevance,
  what_to_watch:a.what_to_watch,
  evidence_and_confidence:a.evidence_and_confidence,
 };
 const filled=Boolean(a.what_happened?.text&&a.why_it_matters?.text&&
  a.what_to_watch?.event_topic&&
  a.evidence_and_confidence?.original_observation_id===row.record_id);
 return {five_part,filled};
}
export async function groEvidenceBackfill(env,now=Date.now()){
 if(!env?.DB?.prepare||!env?.DB?.batch||!Number.isFinite(now))
  fail("BACKFILL_DB_UNAVAILABLE");
 const checkpoint=await env.DB.prepare(
  "SELECT last_record_id FROM gro_evidence_backfill_state WHERE singleton=1"
 ).first();
 const last=checkpoint?.last_record_id??"";
 if(last!==""&&!HEX.test(last))fail("BACKFILL_CURSOR_INVALID");
 const out=await env.DB.prepare(
  "SELECT record_id,raw_sha256,b2_object_sha256,b2_archived_at "+
  "FROM phase2h_private_raw_news WHERE record_id>? "+
  "ORDER BY record_id ASC LIMIT 31"
 ).bind(last).all();
 if(!Array.isArray(out?.results)||out.results.length>31)
  fail("BACKFILL_SOURCE_READ_INVALID");
 const records=out.results.slice(0,30);
 for(const r of records)
  if(!HEX.test(r.record_id)||!HEX.test(r.raw_sha256)||
     !(r.b2_object_sha256===null||HEX.test(r.b2_object_sha256)))
   fail("BACKFILL_SOURCE_ID_INVALID");
 const eligible=records.filter(r=>HEX.test(r.b2_object_sha256)&&
    typeof r.b2_archived_at==="string"&&
    Number.isFinite(Date.parse(r.b2_archived_at)));
 const next=records.at(-1)?.record_id??"";
 const reset=out.results.length<=30;
 // Once one full archive scan finishes, start again at low ID on the next
 // tick. Backfilled originals cannot be manufactured and triggers handle new.
 const at=iso(now);
 if(!records.length) return {
  schema:GRO_ENRICHMENT_SCHEMA,ok:true,scanned:0,archive_jobs_recovered:0,
  backfill_cycle_complete:true,provider_requests:0,
 };
 const packed=JSON.stringify(eligible.map(r=>[
  r.record_id,r.raw_sha256,r.b2_object_sha256,r.b2_archived_at,at]));
 const statements=[];
 if(eligible.length)statements.push(env.DB.prepare(
  "INSERT OR IGNORE INTO gro_evidence_jobs "+
  "(record_id,raw_sha256,b2_object_sha256,archived_at,enqueued_at,state) "+
  "SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),"+
  "json_extract(value,'$[2]'),json_extract(value,'$[3]'),"+
  "json_extract(value,'$[4]'),'PENDING' FROM json_each(?)"
 ).bind(packed));
 statements.push(env.DB.prepare(
  "INSERT INTO gro_evidence_backfill_state(singleton,last_record_id,updated_at) "+
  "VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE "+
  "SET last_record_id=excluded.last_record_id,updated_at=excluded.updated_at"
 ).bind(reset?"":next,at));
 const result=await env.DB.batch(statements);
 if(!Array.isArray(result)||result.some(r=>r?.success===false))
  fail("BACKFILL_D1_WRITE_UNVERIFIED");
 const stored=await env.DB.prepare(
  "SELECT last_record_id FROM gro_evidence_backfill_state WHERE singleton=1"
 ).first();
 if(stored?.last_record_id!==(reset?"":next))
  fail("BACKFILL_CURSOR_READBACK_INVALID");
 return {schema:GRO_ENRICHMENT_SCHEMA,ok:true,scanned:records.length,
  archive_jobs_recovered:eligible.length,backfill_cycle_complete:reset,
  provider_requests:0};
}
export async function groEvidenceTick(env,now=Date.now()){
 if(!env?.DB?.prepare||!env?.DB?.batch||!Number.isFinite(now))
  fail("TICK_DB_UNAVAILABLE");
 const out=await env.DB.prepare(
  "SELECT j.record_id,j.raw_sha256,j.b2_object_sha256,j.archived_at,"+
  "r.category,r.original_published_at,r.risk_country_iso3,r.raw_json,"+
  "r.b2_object_sha256 AS current_archive_sha,r.b2_archived_at "+
  "FROM gro_evidence_jobs j JOIN phase2h_private_raw_news r "+
  "ON r.record_id=j.record_id "+
  "WHERE j.state='PENDING' AND j.enqueued_at>=? "+
  "ORDER BY j.enqueued_at,j.record_id LIMIT 21"
 ).bind(iso(now-STALE_MS)).all();
 if(!Array.isArray(out?.results)||out.results.length>SIZE+1)
  fail("PENDING_PAGE_INVALID");
 const good=[],bad=[];
 for(const row of out.results.slice(0,SIZE)){
  try{
   if(row.b2_object_sha256!==row.current_archive_sha||
      row.archived_at!==row.b2_archived_at)fail("ARCHIVE_PROOF_CHANGED");
   const parsed=JSON.parse(row.raw_json);
   if(await validPrivateRawNews(parsed,now,false)!==row.raw_json)
    fail("EXACT_RAW_HASH_MISMATCH");
   const {five_part,filled}=inspectSource(row,parsed,now);
   const data=JSON.stringify(five_part);
   good.push([
    row.record_id,row.raw_sha256,row.b2_object_sha256,row.category,
    row.risk_country_iso3??null,row.original_published_at,row.archived_at,
    data,await sha(data),filled?1:0,
   ]);
  }catch{bad.push(row.record_id);}
 }
 const at=iso(now),statements=[];
 if(good.length)statements.push(env.DB.prepare(
  "INSERT OR IGNORE INTO gro_evidence ("+
  "record_id,raw_sha256,b2_object_sha256,category,country_iso3,"+
  "original_published_at,archived_at,five_part_json,five_part_sha256,"+
  "five_part_filled,source_reliability,entity_extraction,impact_scoring,"+
  "temporal_context,fact_cross_check,independent_event_verified,"+
  "impact_score_0_100,independent_score_attestation_sha256,"+
  "is_gro_verified,created_at,updated_at) "+
  "SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),"+
  "json_extract(value,'$[2]'),json_extract(value,'$[3]'),"+
  "json_extract(value,'$[4]'),json_extract(value,'$[5]'),"+
  "json_extract(value,'$[6]'),json_extract(value,'$[7]'),"+
  "json_extract(value,'$[8]'),json_extract(value,'$[9]'),"+
  "'ORIGINAL_PAGE_NOT_INDEPENDENTLY_VERIFIED',"+
  "'COUNTRY_ASSOCIATION_NOT_INDEPENDENTLY_VERIFIED',"+
  "'NO_INDEPENDENT_IMPACT_SCORE','SOURCE_NATIVE_DATE_RETAINED',"+
  "'PENDING_INDEPENDENT_CORROBORATION',0,NULL,NULL,0,?,? "+
  "FROM json_each(?)"
 ).bind(at,at,JSON.stringify(good)));
 if(good.length)statements.push(env.DB.prepare(
  "UPDATE gro_evidence_jobs SET state='DRAFT_READY',processed_at=? "+
  "WHERE record_id IN (SELECT value FROM json_each(?)) "+
  "AND state='PENDING'"
 ).bind(at,JSON.stringify(good.map(x=>x[0]))));
 if(bad.length)statements.push(env.DB.prepare(
  "UPDATE gro_evidence_jobs SET state='QUARANTINED',processed_at=?,"+
  "failure_code='EVIDENCE_SCHEMA_OR_ARCHIVE_MISMATCH' "+
  "WHERE record_id IN (SELECT value FROM json_each(?)) AND state='PENDING'"
 ).bind(at,JSON.stringify(bad)));
 if(statements.length){
  const writes=await env.DB.batch(statements);
  if(!Array.isArray(writes)||writes.some(x=>x?.success===false))
   fail("ATOMIC_ENRICHMENT_WRITE_FAILED");
 }
 if(good.length){
  const proof=await env.DB.prepare(
   "SELECT record_id,raw_sha256,b2_object_sha256,five_part_sha256,"+
   "five_part_filled,is_gro_verified "+
   "FROM gro_evidence WHERE record_id IN "+
   "(SELECT value FROM json_each(?))"
  ).bind(JSON.stringify(good.map(x=>x[0]))).all();
  if(!Array.isArray(proof?.results)||proof.results.length!==good.length||
     good.some(row=>!proof.results.some(p=>p.record_id===row[0]&&
      p.raw_sha256===row[1]&&p.b2_object_sha256===row[2]&&
      p.five_part_sha256===row[8]&&
      p.five_part_filled===row[9]&&p.is_gro_verified===0)))
   fail("ENRICHMENT_D1_READBACK_MISMATCH");
 }
 return {schema:GRO_ENRICHMENT_SCHEMA,ok:true,
  archived_jobs_examined:Math.min(out.results.length,SIZE),
  draft_ready:good.length,quarantined:bad.length,
  verified_gro_generated:0,paid_delivery_authorized:false,
  b2_requests:0,original_article_exported:false,
  backlog_more:out.results.length>SIZE};
}
export async function groEvidenceStatus(env,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now))
  return Response.json({ok:false,error:"GRO_STATUS_DB_UNAVAILABLE"},{status:503});
 try{
  const stats=await env.DB.prepare(
   "SELECT (SELECT COUNT(*) FROM gro_evidence_jobs "+
   "WHERE state='PENDING') AS pending,"+
   "(SELECT COUNT(*) FROM gro_evidence_jobs "+
   "WHERE state='QUARANTINED') AS quarantined,"+
   "(SELECT COUNT(*) FROM gro_evidence WHERE is_gro_verified=1) AS verified,"+
   "(SELECT COUNT(*) FROM gro_evidence WHERE is_gro_verified=0) AS unverified,"+
   "(SELECT COUNT(*) FROM gro_evidence WHERE five_part_filled=1) AS filled"
  ).first();
  if(!stats||!["pending","quarantined","verified","unverified","filled"].every(
   k=>Number.isSafeInteger(stats[k])&&stats[k]>=0))
   throw Error();
  // An archive proof is NOT the GRO acceptance event. The numerator requires
  // both independent verification and completion <=15m from the B2 ACK.
  // Exclude immature records from the SLO denominator; no fake 100% on zero.
  const matureAt=iso(now-15*60000),windowFrom=iso(now-75*60000);
  const cohort=await env.DB.prepare(
   "SELECT COUNT(*) AS eligible, "+
   "SUM(CASE WHEN e.is_gro_verified=1 AND e.updated_at<= "+
   "strftime('%Y-%m-%dT%H:%M:%fZ',j.archived_at,'+15 minutes') "+
   "THEN 1 ELSE 0 END) AS verified_within_15m, "+
   "SUM(CASE WHEN j.state='DRAFT_READY' AND j.processed_at<= "+
   "strftime('%Y-%m-%dT%H:%M:%fZ',j.archived_at,'+15 minutes') "+
   "THEN 1 ELSE 0 END) AS draft_within_15m "+
   "FROM gro_evidence_jobs j LEFT JOIN gro_evidence e ON "+
   "e.record_id=j.record_id WHERE j.archived_at>=? AND j.archived_at<=?"
  ).bind(windowFrom,matureAt).first();
  if(!Number.isSafeInteger(cohort?.eligible)||cohort.eligible<0)
   throw Error("GRO_SLO_COHORT_INVALID");
  const denom=cohort.eligible;
  const verified=Number(cohort.verified_within_15m??0);
  const drafted=Number(cohort.draft_within_15m??0);
  if(!Number.isSafeInteger(verified)||!Number.isSafeInteger(drafted)||
     verified<0||drafted<0||verified>denom||drafted>denom)throw Error();
  return Response.json({
   ok:true,schema:"geomacro.gro-evidence-private-health.v1",
   acceptance:{
    eligible_archived_matured_15m:denom,
    verified_within_15m:verified,
    verified_15m_ratio:denom===0?null:verified/denom,
    verified_90pct_target_met:denom>0&&verified/denom>=0.9,
    draft_ready_within_15m:drafted,
    synthetic_archive_proofs_created:0,
    observed_not_guaranteed:true,
   },
   checked_at:iso(now),...stats,
   verified_requires_independent_source_and_score:true,
   raw_ingestion_is_not_verified_gro:true,
   public_output_from_this_endpoint:false,
  },{headers:{"Cache-Control":"private,no-store"}});
 }catch{return Response.json({ok:false,error:"GRO_STATUS_D1_UNAVAILABLE"},
  {status:503,headers:{"Cache-Control":"no-store"}});}
}
