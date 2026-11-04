/**
 * P0-B quota-governed FIFO redrive every 10 minutes.
 * Re-dispatches old PENDING / RETRY and expired PROCESSING locks. Never deletes
 * an unacked B2 object; duplicates are absorbed by the D1 consumer state lock.
 */
import {readP0bSealedOutbox} from "./p0b-transactional-outbox.ts";
import {restoreP0bR2Fallback} from "../storage/p0b-r2-fallback.ts";
import {processFetchedBatch} from "./ingest-producer.ts";
import type {ProducerEnv} from "./ingest-producer.ts";
import type {R2FallbackEnv} from "../storage/p0b-r2-fallback.ts";

export interface DrainEnv {
 DB:any;
 INGEST_QUEUE:{send:(v:unknown)=>Promise<void>};
}
export async function drainBacklog(env:DrainEnv,{now=Date.now(),limit=100}={}){
 if(!env?.DB?.prepare||!env?.INGEST_QUEUE?.send||
    !Number.isSafeInteger(limit)||limit<1||limit>100)
  return {status:'DRAIN_CONFIG_UNAVAILABLE',count:0};
 const current=new Date(now).toISOString();
 const day=current.slice(0,10)+'T00:00:00.000Z';
 let count;
 try{
  count=await env.DB.prepare(
   'SELECT COUNT(*) AS committed_today FROM ingestion_spool_queue WHERE d1_committed_at>=?'
  ).bind(day).first();
 }catch{return {status:'D1_QUOTA_STATUS_UNAVAILABLE',count:0}}
 // Explicit operator acceptance ceiling from the provided blueprint.
 // This is not a complete account-wide D1 row-write quota report.
 if((count?.committed_today??0)>=90000)
  return {status:'QUOTA_HOLD',count:0};
 let bundles:any[]=[],rows:any[]=[];
 try{
  const stale=new Date(now-5*60000).toISOString();
  const queued=await env.DB.prepare(
   'SELECT bundle_sha256,b2_spool_uri,item_count FROM ingestion_spool_bundles '+
   "WHERE ((state IN ('PENDING','RETRY') AND created_at<=?) OR "+
   "(state='PROCESSING' AND locked_until<=?)) "+
   'ORDER BY created_at ASC,bundle_sha256 ASC LIMIT ?'
  ).bind(stale,current,limit).all();
  bundles=queued.results??[];
  if(bundles.length<limit){
   const legacy=await env.DB.prepare(
    'SELECT candidate_sha256,source_id,b2_spool_uri FROM ingestion_spool_queue '+
    "WHERE bundle_offset IS NULL AND ((state IN ('PENDING','RETRY') AND spooled_at<=?) OR "+
    "(state='PROCESSING' AND locked_until<=?)) "+
    'ORDER BY spooled_at ASC,candidate_sha256 ASC LIMIT ?'
   ).bind(stale,current,limit-bundles.length).all();
   rows=legacy.results??[];
  }
 }catch{return {status:'D1_BACKLOG_READ_UNAVAILABLE',count:0}}
 if(bundles.length===0&&rows.length===0)return {status:'DRAIN_CLEAN',count:0};
 let sent=0,failed=0;
 for(const bundle of bundles){
  try{
   await env.INGEST_QUEUE.send({kind:'P0B_BUNDLE_V1',
    b2Uri:bundle.b2_spool_uri,bundleSha256:bundle.bundle_sha256,
    candidateCount:bundle.item_count});sent++;
  }catch{failed++}
 }
 for(const row of rows){
  try{
   await env.INGEST_QUEUE.send({
    candidateSha256:row.candidate_sha256,
    sourceId:row.source_id,b2Uri:row.b2_spool_uri
   });sent++;
  }catch{failed++}
 }
 return {status:failed?'DRAIN_PARTIAL':'DRAINED_BATCH',count:sent,failed,
  selected:rows.length+bundles.length,bundles_selected:bundles.length,no_pending_deletions:true};
}

/** Restore immutable encrypted outbox records and reattempt B2 after crash.
 * Single-row D1 compare-and-set leases prevent a second recovery worker
 * from taking the same batch. No cursor is advanced before exact B2 GET,
 * D1 journal/outbox readback and Queue dispatch/redrive evidence.
 */
export async function drainP0bArchiveOutbox(env:ProducerEnv,{
 now=Date.now(),limit=2,
 persist=processFetchedBatch
}={}){
 if(!env?.DB?.prepare||!env?.INGEST_QUEUE?.send||
    !Number.isSafeInteger(limit)||limit<1||limit>2)
  return {status:"P0B_OUTBOX_DRAIN_CONFIG_INVALID",selected:0,archived:0};
 const clock=new Date(now).toISOString();
 let guard:any,rows:any[];
 try{
  guard=await env.DB.prepare(
   "SELECT hold_until FROM p0b_storage_circuit WHERE singleton=1").first();
  if(guard?.hold_until>clock)
   return {status:"P0B_OUTBOX_B2_CIRCUIT_HELD",selected:0,archived:0};
  const query=await env.DB.prepare(
   "SELECT batch_id,candidate_fingerprint,item_count,first_seen_at,"+
   "sealed_payload,payload_sha256,lease_id,locked_until,state "+
   "FROM p0b_archive_outbox WHERE "+
   "((state='PENDING_ARCHIVE' AND (next_retry_at IS NULL OR next_retry_at<=?)) "+
   "OR (state='REPLAYING' AND locked_until<=?)) "+
   "ORDER BY first_seen_at,batch_id LIMIT ?"
  ).bind(clock,clock,limit).all();
  rows=query.results??[];
 }catch{return {status:"P0B_OUTBOX_DRAIN_D1_UNAVAILABLE",selected:0,archived:0}}
 let archived=0,failed=0,leased=0;
 for(const row of rows){
  const leaseId=crypto.randomUUID();
  const until=new Date(now+15*60_000).toISOString();
  try{
   const claim=await env.DB.prepare(
    "UPDATE p0b_archive_outbox SET state='REPLAYING',lease_id=?,"+
    "locked_until=? WHERE batch_id=? AND "+
    "((state='PENDING_ARCHIVE' AND (next_retry_at IS NULL OR next_retry_at<=?)) "+
    "OR (state='REPLAYING' AND locked_until<=?))"
   ).bind(leaseId,until,row.batch_id,clock,clock).run();
   if(claim?.meta?.changes!==1)continue;
   leased++;
   const payloads=await readP0bSealedOutbox(row,env.B2_SPOOL_ENCRYPTION_KEY);
   const result=await persist(payloads.map(p=>({
    candidateSha256:p.candidateSha256,sourceId:p.sourceId,raw:p.rawPayload
   })),env,{now:()=>new Date(now),replayLeaseId:leaseId});
   const successes=new Set(["QUEUED","DURABLE_PENDING_REDISPATCH",
    "ALREADY_COMMITTED","DUPLICATE_IN_BATCH"]);
   if(result?.all_durable!==true||result?.receipts?.length!==row.item_count||
      result.receipts.some((r:any)=>!successes.has(r.status)))
    throw Error("P0B_OUTBOX_B2_RECOVERY_UNVERIFIED");
   const proof=await env.DB.prepare(
    "SELECT state,b2_uri,b2_object_sha256,archived_at "+
    "FROM p0b_archive_outbox WHERE batch_id=?").bind(row.batch_id).first();
   if(proof?.state!=="ARCHIVED"||
      typeof proof.b2_uri!=="string"||
      !/^[a-f0-9]{64}$/u.test(proof.b2_object_sha256??"")||
      !Number.isFinite(Date.parse(proof.archived_at)))
    throw Error("P0B_OUTBOX_CROSS_STORAGE_PARITY_UNVERIFIED");
   archived++;
  }catch{
   failed++;
   const retry=new Date(now+60_000).toISOString();
   try{
    await env.DB.prepare(
     "UPDATE p0b_archive_outbox SET state='PENDING_ARCHIVE',"+
     "lease_id=NULL,locked_until=NULL,next_retry_at=?,"+
     "last_error_code='P0B_OUTBOX_REPLAY_FAILED' "+
     "WHERE batch_id=? AND state='REPLAYING' AND lease_id=?"
    ).bind(retry,row.batch_id,leaseId).run();
   }catch{/* immutable ciphertext remains in D1; next cron can reclaim lease */}
  }
 }
 return {status:failed?"P0B_OUTBOX_REPLAY_PARTIAL":"P0B_OUTBOX_REPLAY_OK",
  selected:rows.length,leased,archived,failed,
  b2_verified_only_after_d1_readback:true,encrypted_replay_no_source_fetch:true};
}

/** Existing ten-minute cron: bounded R2 ciphertext -> verified B2 replay.
 * R2 is NOT an accepted B2 object, and its pending index is never deleted
 * on failure. The same shared account-wide B2 ticketing applies to redrive.
 */
export async function drainR2Fallback(env:R2FallbackEnv&DrainEnv,{
 now=Date.now(),limit=2,
 persist=processFetchedBatch as (candidates:Parameters<typeof processFetchedBatch>[0],
   env:Parameters<typeof processFetchedBatch>[1],
   options:Parameters<typeof processFetchedBatch>[2])=>
   Promise<{all_durable:boolean,receipts:Array<{status:string}>}>
}={}){
 if(!env?.P0B_PRIVATE_FALLBACK_R2||!env.DB?.prepare||
    !Number.isSafeInteger(limit)||limit<1||limit>2)
  return {status:"R2_FALLBACK_NOT_CONFIGURED",selected:0,verified:0};
 const clock=new Date(now).toISOString();
 let guard:any;
 try{
  guard=await env.DB.prepare(
   "SELECT hold_until FROM p0b_storage_circuit WHERE singleton=1").first();
 }catch{return {status:"R2_FALLBACK_CIRCUIT_READ_UNAVAILABLE",selected:0,verified:0}}
 if(guard?.hold_until>clock)
  return {status:"R2_FALLBACK_B2_CIRCUIT_HELD",selected:0,verified:0};
 let rows:any[];
 try{
  const result=await env.DB.prepare(
   "SELECT batch_id,object_key,cipher_sha256,item_count,attempt_count "+
   "FROM p0b_private_r2_fallback WHERE "+
   "((state='PENDING_B2' AND next_retry_at<=?) OR "+
   "(state='PROCESSING' AND locked_until<=?)) "+
   "ORDER BY created_at,batch_id LIMIT ?").bind(clock,clock,limit).all();
  rows=result.results??[];
 }catch{return {status:"R2_FALLBACK_INDEX_UNAVAILABLE",selected:0,verified:0}}
 let verified=0,failed=0;
 for(const row of rows){
  const leaseId=crypto.randomUUID();
  const leaseUntil=new Date(now+5*60_000).toISOString();
  try{
   const claim=await env.DB.prepare(
    "UPDATE p0b_private_r2_fallback SET state='PROCESSING',"+
    "lease_id=?,locked_until=? WHERE batch_id=? AND "+
    "((state='PENDING_B2' AND next_retry_at<=?) OR "+
    "(state='PROCESSING' AND locked_until<=?))"
   ).bind(leaseId,leaseUntil,row.batch_id,clock,clock).run();
   if(claim?.meta?.changes!==1)continue;
   const payloads=await restoreP0bR2Fallback(env,row);
   const result=await persist(payloads.map(p=>({
    candidateSha256:p.candidateSha256,sourceId:p.sourceId,raw:p.rawPayload
   })),env,{now:()=>new Date(now)});
   const genuine=new Set(["QUEUED","ALREADY_COMMITTED",
    "DURABLE_PENDING_REDISPATCH","DUPLICATE_IN_BATCH"]);
   if(result.all_durable!==true||result.receipts.length!==payloads.length||
      result.receipts.some(r=>!genuine.has(r.status)))
    throw Error("P0B_R2_REPLAY_NOT_B2_VERIFIED");
   await env.DB.prepare(
    "UPDATE p0b_private_r2_fallback SET state='B2_VERIFIED',"+
    "b2_verified_at=?,lease_id=NULL,locked_until=NULL,last_error_code=NULL "+
    "WHERE batch_id=? AND state='PROCESSING' AND lease_id=?"
   ).bind(clock,row.batch_id,leaseId).run();
   const proof=await env.DB.prepare(
    "SELECT state,b2_verified_at FROM p0b_private_r2_fallback WHERE batch_id=?"
   ).bind(row.batch_id).first();
   if(proof?.state!=="B2_VERIFIED"||proof.b2_verified_at!==clock)
    throw Error("P0B_R2_REPLAY_D1_ACK_UNVERIFIED");
   verified++;
  }catch{
   failed++;
   const nextMs=Math.min(3600_000,60_000*2**Math.min(row.attempt_count+1,6));
   try{await env.DB.prepare(
    "UPDATE p0b_private_r2_fallback SET attempt_count=attempt_count+1,"+
    "next_retry_at=?,state='PENDING_B2',locked_until=NULL,lease_id=NULL,"+
    "last_error_code='P0B_R2_REPLAY_NOT_B2_VERIFIED' "+
    "WHERE batch_id=? AND state='PROCESSING' AND lease_id=?"
   ).bind(new Date(now+nextMs).toISOString(),row.batch_id,leaseId).run();}
   catch{/* R2 object and earlier D1 index remain durable for later retry. */}
  }
 }
 return {status:failed?"R2_FALLBACK_REPLAY_PARTIAL":"R2_FALLBACK_REPLAY_OK",
  selected:rows.length,verified,failed,r2_pending_is_not_b2_success:true,
  source_news_logged:false,objects_deleted:0};
}
