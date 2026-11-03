/** P0-B producer: B2 exact readback first, D1 durable journal next, Queue last.
 * A failed Queue send leaves a PENDING D1 row for the ten-minute drain.
 * Never report an unspooled/undurable candidate as accepted.
 */
import {B2SpoolManager,p0bSha256} from '../storage/b2-spool-manager.ts';
import type {B2SpoolEnv} from '../storage/b2-spool-manager.ts';
export type IngestCandidate={candidateSha256:string;sourceId:string;raw:unknown};
export type ProducerEnv=B2SpoolEnv&{INGEST_QUEUE:{send:(message:unknown)=>Promise<void>}};
type ProducerOptions={manager?:Pick<B2SpoolManager,'spoolAndVerify'>;now?:()=>Date};
const hex=/^[0-9a-f]{64}$/u,source=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
function failureCode(error:unknown){
 const message=error instanceof Error?error.message:'P0B_UNKNOWN';
 return /^P0B_[A-Z0-9_]{3,80}$/u.test(message)?message:'P0B_PRODUCER_FAILURE';
}
export async function processFetchedBatch(
 candidates:IngestCandidate[],env:ProducerEnv,opts:ProducerOptions={}
){
 if(!Array.isArray(candidates)||!env?.DB?.prepare||!env.INGEST_QUEUE?.send)
  throw Error('P0B_PRODUCER_CONFIG_INVALID');
 const manager=opts.manager??new B2SpoolManager(env);
 const now=opts.now??(()=>new Date()),receipts:any[]=[];
 const once=new Set<string>();
 for(const c of candidates){
  if(!c||!hex.test(c.candidateSha256)||!source.test(c.sourceId)){
   receipts.push({sha256:null,status:'INVALID_CANDIDATE'});continue;
  }
  if(once.has(c.candidateSha256)){
   receipts.push({sha256:c.candidateSha256,status:'DUPLICATE_IN_BATCH'});continue;
  }
  once.add(c.candidateSha256);
  try{
   const actual=await p0bSha256(JSON.stringify(c.raw));
   if(actual!==c.candidateSha256)throw Error('P0B_CANDIDATE_IDENTITY_INVALID');
   let row=await env.DB.prepare(
    'SELECT source_id,state,b2_spool_uri,b2_byte_size FROM ingestion_spool_queue WHERE candidate_sha256=?'
   ).bind(c.candidateSha256).first();
   if(!row){
    const verified=await manager.spoolAndVerify({
     candidateSha256:c.candidateSha256,sourceId:c.sourceId,
     rawPayload:c.raw,headers:{},discoveredAt:now().toISOString()
    });
    await env.DB.prepare(
     'INSERT INTO ingestion_spool_queue (id,candidate_sha256,source_id,b2_spool_uri,b2_byte_size,state) '+
     "VALUES (?,?,?,?,?,'PENDING') ON CONFLICT(candidate_sha256) DO NOTHING"
    ).bind(crypto.randomUUID(),c.candidateSha256,c.sourceId,
      verified.b2Uri,verified.byteSize).run();
    row=await env.DB.prepare(
     'SELECT source_id,state,b2_spool_uri,b2_byte_size FROM ingestion_spool_queue WHERE candidate_sha256=?'
    ).bind(c.candidateSha256).first();
    if(!row||row.source_id!==c.sourceId||row.b2_spool_uri!==verified.b2Uri||
      row.b2_byte_size!==verified.byteSize)throw Error('P0B_D1_QUEUE_READBACK_FAILED');
   }
   if(row.source_id!==c.sourceId)throw Error('P0B_DUPLICATE_SHA_SOURCE_CONFLICT');
   if(['D1_COMMITTED','ACKNOWLEDGED'].includes(row.state)){
    receipts.push({sha256:c.candidateSha256,status:'ALREADY_COMMITTED'});continue;
   }
   if(['DEAD_LETTER','QUARANTINED'].includes(row.state)){
    receipts.push({sha256:c.candidateSha256,status:'HELD_FOR_REVIEW'});continue;
   }
   if(!['PENDING','RETRY','PROCESSING'].includes(row.state))
    throw Error('P0B_D1_QUEUE_STATE_INVALID');
   try{
    await env.INGEST_QUEUE.send({candidateSha256:c.candidateSha256,
     sourceId:c.sourceId,b2Uri:row.b2_spool_uri});
    receipts.push({sha256:c.candidateSha256,status:'QUEUED'});
   }catch{
    // Producer does not lose the candidate: B2+the D1 PENDING row remain.
    receipts.push({sha256:c.candidateSha256,status:'DURABLE_PENDING_REDISPATCH'});
   }
  }catch(error){
   // Unverified B2 spooling failure is reported, never silently swallowed.
   receipts.push({sha256:c.candidateSha256,status:'FAILED_NOT_ACKNOWLEDGED',
    error_code:failureCode(error)});
  }
 }
 const unaccepted=receipts.filter(x=>x.status==='FAILED_NOT_ACKNOWLEDGED'||
  x.status==='INVALID_CANDIDATE').length;
 return {schema:'geomacro.p0b.producer.v1',examined:candidates.length,
  receipts,unaccepted,all_durable:unaccepted===0,
  no_news_silently_dropped:true,paid_published:false};
}
