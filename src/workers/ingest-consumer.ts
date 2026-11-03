/** P0-B idempotent Cloudflare Queue consumer.
 * B2 AEAD+SHA verification -> atomic D1 insert/state commit -> independent
 * readback -> ack. A lock expiry allows crash takeover without double insert.
 */
import {B2SpoolManager} from '../storage/b2-spool-manager.ts';
import type {B2SpoolEnv} from '../storage/b2-spool-manager.ts';
export interface SpoolQueueMessage {
 candidateSha256:string;
 sourceId:string;
 b2Uri:string;
}
export interface QueueDelivery<T> {
 body:T;ack():void;retry(options?:{delaySeconds:number}):void;
}
export type QueueBatch<T>={messages:QueueDelivery<T>[]};
type ConsumerOptions={manager?:Pick<B2SpoolManager,'readVerified'>;now?:()=>Date};
const HASH=/^[a-f0-9]{64}$/u;
const ISO=(now:number)=>new Date(now).toISOString();
function errorCode(error:unknown){
 const m=error instanceof Error?error.message:'P0B_CONSUMER_FAILURE';
 return /^P0B_[A-Z0-9_]{3,80}$/u.test(m)?m:'P0B_CONSUMER_FAILURE';
}
function retrySafe(message:QueueDelivery<SpoolQueueMessage>,delaySeconds=60){
 message.retry({delaySeconds});
}
export async function handleQueueBatch(batch:QueueBatch<SpoolQueueMessage>,
 env:B2SpoolEnv,options:ConsumerOptions={}){
 if(!env?.DB?.prepare||!env.DB?.batch||!batch||!Array.isArray(batch.messages))
  throw Error('P0B_CONSUMER_CONFIG_INVALID');
 const manager=options.manager??new B2SpoolManager(env);
 const now=options.now??(()=>new Date());
 const result:{committed:number;duplicates:number;retried:number;dead_letter:number}={
  committed:0,duplicates:0,retried:0,dead_letter:0
 };
 for(const message of batch.messages){
  const item=message.body;
  if(!item||!HASH.test(item.candidateSha256??'')||
     typeof item.sourceId!=='string'||typeof item.b2Uri!=='string'){
   retrySafe(message);result.retried++;continue;
  }
  const at=now().getTime(),locked=ISO(at+120000);
  let claimed=false;
  try{
   const update=await env.DB.prepare(
    'UPDATE ingestion_spool_queue SET state=?,locked_until=? '+
    'WHERE candidate_sha256=? AND source_id=? AND b2_spool_uri=? AND ('+
    "state IN ('PENDING','RETRY') OR (state='PROCESSING' AND locked_until<=?))"
   ).bind('PROCESSING',locked,item.candidateSha256,item.sourceId,item.b2Uri,ISO(at)).run();
   claimed=update?.meta?.changes===1;
   if(!claimed){
    const old=await env.DB.prepare(
     'SELECT source_id,b2_spool_uri,state,locked_until FROM ingestion_spool_queue WHERE candidate_sha256=?'
    ).bind(item.candidateSha256).first();
    if(old?.source_id===item.sourceId&&old.b2_spool_uri===item.b2Uri&&
       ['D1_COMMITTED','ACKNOWLEDGED','DEAD_LETTER','QUARANTINED'].includes(old.state)){
     message.ack();
     result.duplicates++;
    }else{retrySafe(message);result.retried++;}
    continue;
   }
   const restored=await manager.readVerified(item.b2Uri,item.candidateSha256,item.sourceId);
   if(restored.sourceId!==item.sourceId||
     restored.candidateSha256!==item.candidateSha256)
    throw Error('P0B_SPOOL_CONTENT_ID_MISMATCH');
   // Atomic batch: neither metadata insertion nor committed journal status
   // can succeed separately, even if another consumer raced on same SHA.
   const committedAt=now().toISOString();
   const commands=[
    env.DB.prepare(
     "INSERT INTO normalized_articles (id,candidate_sha256,source_id,b2_archive_uri,status,created_at) "+
     "VALUES (?,?,?,?,'ADMITTED',?) ON CONFLICT(candidate_sha256) DO NOTHING"
    ).bind(crypto.randomUUID(),item.candidateSha256,item.sourceId,item.b2Uri,committedAt),
    env.DB.prepare(
     "UPDATE ingestion_spool_queue SET state='D1_COMMITTED',"+
     'd1_committed_at=?,acked_at=?,locked_until=NULL,last_error_code=NULL,last_error_message=NULL '+
     "WHERE candidate_sha256=? AND source_id=? AND state='PROCESSING' AND locked_until=?"
    ).bind(committedAt,committedAt,item.candidateSha256,item.sourceId,locked)
   ];
   await env.DB.batch(commands);
   const article=await env.DB.prepare(
    'SELECT source_id,b2_archive_uri,status FROM normalized_articles WHERE candidate_sha256=?'
   ).bind(item.candidateSha256).first();
   const journal=await env.DB.prepare(
    'SELECT state,d1_committed_at,acked_at FROM ingestion_spool_queue WHERE candidate_sha256=?'
   ).bind(item.candidateSha256).first();
   if(article?.source_id!==item.sourceId||article.b2_archive_uri!==item.b2Uri||
     article.status!=='ADMITTED'||journal?.state!=='D1_COMMITTED'||
     journal.d1_committed_at!==committedAt||journal.acked_at!==committedAt)
    throw Error('P0B_D1_EXACT_READBACK_FAILED');
   message.ack();result.committed++;
  }catch(error){
   // No ack is issued after an uncertain commit. Replayed messages inspect
   // D1_COMMITTED and idempotently ack, without re-consuming any B2 data.
   if(claimed){
    try{
     const failure=await env.DB.prepare(
      'UPDATE ingestion_spool_queue SET '+
      "state=CASE WHEN retry_count+1>=max_retries THEN 'DEAD_LETTER' ELSE 'RETRY' END,"+
      'retry_count=retry_count+1,last_error_code=?,last_error_message=?,locked_until=NULL '+
      "WHERE candidate_sha256=? AND state='PROCESSING' AND locked_until=? "+
      'RETURNING state,retry_count'
     ).bind(errorCode(error),errorCode(error),item.candidateSha256,locked).first();
     if(failure?.state==='DEAD_LETTER'){
      // The B2 object and D1 dead-letter receipt are durable, not discarded.
      message.ack();result.dead_letter++;continue;
     }
    }catch{/* DB uncertain: retry, never claim commitment. */}
   }
   retrySafe(message);result.retried++;
  }
 }
 return {schema:'geomacro.p0b.consumer.v1',...result,
  public_published:false,commercial_eligible:false};
}
