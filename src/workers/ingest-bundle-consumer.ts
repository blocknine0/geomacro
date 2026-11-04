/** P0-B bundle consumer. ACKs one bundle message only after every manifest
 * item is atomically durable in item D1 rows and independently read back.
 * Old single-candidate queue messages are handled by ingest-consumer.ts.
 */
import {B2SpoolManager} from '../storage/b2-spool-manager.ts';
import type {B2SpoolEnv} from '../storage/b2-spool-manager.ts';
export type BundleMessage={kind:'P0B_BUNDLE_V1';b2Uri:string;
 bundleSha256:string;candidateCount:number};
type Delivery={body:BundleMessage;ack():void;retry(options?:{delaySeconds:number}):void};
const HASH=/^[a-f0-9]{64}$/u;
const code=(error:unknown)=>{
 const m=error instanceof Error?error.message:'P0B_BUNDLE_CONSUMER_FAILURE';
 return /^P0B_[A-Z0-9_]{3,80}$/u.test(m)?m:'P0B_BUNDLE_CONSUMER_FAILURE';
};
export async function handleBundleQueueBatch(
 batch:{messages:Delivery[]},env:B2SpoolEnv,
 opts:{manager?:Pick<B2SpoolManager,'readBundleVerified'>;now?:()=>Date}={}){
 const now=opts.now??(()=>new Date()),manager=opts.manager??new B2SpoolManager(env);
 const result={committed:0,duplicates:0,retried:0,dead_letter:0};
 for(const message of batch.messages){
  const item=message.body;
  if(item?.kind!=='P0B_BUNDLE_V1'||!HASH.test(item.bundleSha256??'')||
   typeof item.b2Uri!=='string'||!item.b2Uri.startsWith('b2://')||
   !Number.isInteger(item.candidateCount)||item.candidateCount<1||
   item.candidateCount>100){
   message.retry({delaySeconds:60});result.retried++;continue;
  }
  const stamp=now().toISOString(),lease=new Date(now().getTime()+120000).toISOString();
  let claimed=false;
  try{
   const change=await env.DB.prepare(
    "UPDATE ingestion_spool_bundles SET state='PROCESSING',locked_until=? "+
    "WHERE b2_spool_uri=? AND bundle_sha256=? AND item_count=? AND ("+
    "state IN ('PENDING','RETRY') OR "+
    "(state='PROCESSING' AND locked_until<=?))"
   ).bind(lease,item.b2Uri,item.bundleSha256,item.candidateCount,stamp).run();
   claimed=change?.meta?.changes===1;
   if(!claimed){
    const row=await env.DB.prepare(
     'SELECT state,item_count,bundle_sha256 FROM ingestion_spool_bundles WHERE b2_spool_uri=?'
    ).bind(item.b2Uri).first();
    if(row?.bundle_sha256===item.bundleSha256&&row.item_count===item.candidateCount&&
     ['D1_COMMITTED','DEAD_LETTER','QUARANTINED'].includes(row.state)){
     message.ack();result.duplicates++;
    }else{message.retry({delaySeconds:60});result.retried++;}
    continue;
   }
   const restored=await manager.readBundleVerified(item.b2Uri,item.bundleSha256);
   if(restored.batchSha256!==item.bundleSha256||
    restored.items.length!==item.candidateCount)
    throw Error('P0B_BUNDLE_ITEM_READBACK_MISMATCH');
   // Read the journal manifest before committing. No forged/partial D1 items.
   const rows=await env.DB.prepare(
    'SELECT candidate_sha256,source_id,bundle_offset,bundle_length,state '+
    'FROM ingestion_spool_queue WHERE b2_spool_uri=? ORDER BY bundle_offset'
   ).bind(item.b2Uri).all();
   if((rows.results??[]).length!==item.candidateCount)
    throw Error('P0B_BUNDLE_JOURNAL_MISMATCH');
   for(let i=0;i<restored.items.length;i++){
    const expected=restored.index[i],actual=rows.results[i];
    if(actual?.candidate_sha256!==expected.candidateSha256||
     actual.source_id!==expected.sourceId||actual.bundle_offset!==expected.byteOffset||
     actual.bundle_length!==expected.byteLength||
     !['PENDING','RETRY','D1_COMMITTED'].includes(actual.state))
     throw Error('P0B_BUNDLE_JOURNAL_MISMATCH');
   }
   // Small D1 batches limit transaction size; a crash resumes idempotently.
   // Bundle ACK is withheld until all item commits and independent readback.
   const committedAt=now().toISOString();
   for(let i=0;i<restored.items.length;i+=20){
    const commands:any[]=[];
    for(const restoredItem of restored.items.slice(i,i+20)){
     commands.push(env.DB.prepare(
      "INSERT INTO normalized_articles(id,candidate_sha256,source_id,b2_archive_uri,status,created_at) "+
      "VALUES(?,?,?,?,'ADMITTED',?) ON CONFLICT(candidate_sha256) DO NOTHING"
     ).bind(crypto.randomUUID(),restoredItem.candidateSha256,
      restoredItem.sourceId,item.b2Uri,committedAt));
     commands.push(env.DB.prepare(
      "UPDATE ingestion_spool_queue SET state='D1_COMMITTED',"+
      'd1_committed_at=COALESCE(d1_committed_at,?),'+
      'acked_at=COALESCE(acked_at,?),locked_until=NULL,'+
      'last_error_code=NULL,last_error_message=NULL '+
      "WHERE candidate_sha256=? AND source_id=? AND b2_spool_uri=? "+
      "AND state IN ('PENDING','RETRY')"
     ).bind(committedAt,committedAt,restoredItem.candidateSha256,
      restoredItem.sourceId,item.b2Uri));
    }
    await env.DB.batch(commands);
   }
   const verified=await env.DB.prepare(
    'SELECT q.candidate_sha256,q.source_id,q.bundle_offset,q.bundle_length,'+
    'q.state,q.d1_committed_at,q.acked_at,n.source_id AS article_source,'+
    'n.b2_archive_uri,n.status AS article_status '+
    'FROM ingestion_spool_queue q LEFT JOIN normalized_articles n '+
    'ON q.candidate_sha256=n.candidate_sha256 WHERE q.b2_spool_uri=? '+
    'ORDER BY q.bundle_offset'
   ).bind(item.b2Uri).all();
   if((verified.results??[]).length!==restored.items.length)
    throw Error('P0B_BUNDLE_D1_EXACT_READBACK_FAILED');
   for(let i=0;i<restored.items.length;i++){
    const rec=verified.results[i],exp=restored.index[i];
    if(rec.candidate_sha256!==exp.candidateSha256||
     rec.source_id!==exp.sourceId||rec.bundle_offset!==exp.byteOffset||
     rec.bundle_length!==exp.byteLength||rec.state!=='D1_COMMITTED'||
     !rec.d1_committed_at||!rec.acked_at||
     rec.article_source!==exp.sourceId||rec.b2_archive_uri!==item.b2Uri||
     rec.article_status!=='ADMITTED')
     throw Error('P0B_BUNDLE_D1_EXACT_READBACK_FAILED');
   }
   const finish=await env.DB.prepare(
    "UPDATE ingestion_spool_bundles SET state='D1_COMMITTED',"+
    'd1_committed_at=?,acked_at=?,locked_until=NULL,last_error_code=NULL '+
    "WHERE b2_spool_uri=? AND bundle_sha256=? AND state='PROCESSING' AND locked_until=?"
   ).bind(committedAt,committedAt,item.b2Uri,item.bundleSha256,lease).run();
   const proof=await env.DB.prepare(
    'SELECT state,d1_committed_at,acked_at,item_count FROM ingestion_spool_bundles '+
    'WHERE b2_spool_uri=?'
   ).bind(item.b2Uri).first();
   if(finish?.meta?.changes!==1||proof?.state!=='D1_COMMITTED'||
    proof.item_count!==item.candidateCount||
    proof.d1_committed_at!==committedAt||proof.acked_at!==committedAt)
    throw Error('P0B_BUNDLE_COMMIT_READBACK_FAILED');
   message.ack();result.committed++;
  }catch(error){
   if(claimed){
    try{
     const fail=await env.DB.prepare(
      "UPDATE ingestion_spool_bundles SET state=CASE "+
      "WHEN retry_count+1>=max_retries THEN 'DEAD_LETTER' ELSE 'RETRY' END,"+
      'retry_count=retry_count+1,last_error_code=?,locked_until=NULL '+
      "WHERE b2_spool_uri=? AND state='PROCESSING' AND locked_until=? "+
      'RETURNING state'
     ).bind(code(error),item.b2Uri,lease).first();
     if(fail?.state==='DEAD_LETTER'){
      message.ack();result.dead_letter++;continue;
     }
    }catch{/* uncertain D1 commit: never ACK */}
   }
   message.retry({delaySeconds:60});result.retried++;
  }
 }
 return {schema:'geomacro.p0b.bundle-consumer.v1',...result,
  public_published:false,commercial_eligible:false};
}
