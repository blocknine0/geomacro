/**
 * P0-B quota-governed FIFO redrive every 10 minutes.
 * Re-dispatches old PENDING / RETRY and expired PROCESSING locks. Never deletes
 * an unacked B2 object; duplicates are absorbed by the D1 consumer state lock.
 */
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
 let rows;
 try{
  const stale=new Date(now-5*60000).toISOString();
  const res=await env.DB.prepare(
   'SELECT candidate_sha256,source_id,b2_spool_uri FROM ingestion_spool_queue '+
   "WHERE ((state IN ('PENDING','RETRY') AND spooled_at<=?) OR "+
   "(state='PROCESSING' AND locked_until<=?)) "+
   'ORDER BY spooled_at ASC,candidate_sha256 ASC LIMIT ?'
  ).bind(stale,current,limit).all();
  rows=res.results??[];
 }catch{return {status:'D1_BACKLOG_READ_UNAVAILABLE',count:0}}
 if(rows.length===0)return {status:'DRAIN_CLEAN',count:0};
 let sent=0,failed=0;
 for(const row of rows){
  try{
   await env.INGEST_QUEUE.send({
    candidateSha256:row.candidate_sha256,
    sourceId:row.source_id,b2Uri:row.b2_spool_uri
   });sent++;
  }catch{failed++}
 }
 return {status:failed?'DRAIN_PARTIAL':'DRAINED_BATCH',count:sent,failed,
  selected:rows.length,no_pending_deletions:true};
}
