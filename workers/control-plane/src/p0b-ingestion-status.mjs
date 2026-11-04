/** Protected P0-B production readiness / durable queue census.
 * Never returns source URLs, original titles, original IDs, tokens, B2 URIs
 * or individual candidate SHAs. Admin bearer is enforced by index.mjs.
 */
const resp=(value,status=200)=>Response.json(value,{status,headers:{
 'Cache-Control':'private, no-store','X-Robots-Tag':'noindex,nofollow',
 'X-Content-Type-Options':'nosniff'
}});
export async function getP0bIngestionStatus(env){
 if(!env?.DB?.prepare)return resp({ok:false,error:'P0B_D1_BINDING_UNAVAILABLE'},503);
 try{
  const utcDay=new Date().toISOString().slice(0,10)+'T00:00:00.000Z';
  const [sources,states,admitted,guard,bundles]=await Promise.all([
   env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled, '+
    'SUM(CASE WHEN last_polled_at IS NOT NULL THEN 1 ELSE 0 END) AS ever_polled '+
    'FROM source_registry').first(),
   env.DB.prepare('SELECT state,COUNT(*) AS n FROM ingestion_spool_queue GROUP BY state').all(),
   env.DB.prepare('SELECT COUNT(*) AS n FROM normalized_articles').first(),
   env.DB.prepare('SELECT hold_until,last_error_code FROM p0b_storage_circuit WHERE singleton=1').first(),
   env.DB.prepare('SELECT COUNT(*) AS created,'+
    "SUM(CASE WHEN state='D1_COMMITTED' AND acked_at IS NOT NULL THEN 1 ELSE 0 END) AS committed,"+
    "SUM(CASE WHEN state='DEAD_LETTER' THEN 1 ELSE 0 END) AS dead_letter "+
    'FROM ingestion_spool_bundles WHERE created_at>=?').bind(utcDay).first(),
  ]);
  const queueState={PENDING:0,PROCESSING:0,ACKNOWLEDGED:0,D1_COMMITTED:0,
   RETRY:0,QUARANTINED:0,DEAD_LETTER:0};
  for(const state of states.results??[]){
   if(!Object.hasOwn(queueState,state.state)||!Number.isSafeInteger(state.n)||state.n<0)
    throw Error('P0B_STATE_CENSUS_INVALID');
   queueState[state.state]=state.n;
  }
  const configured=env.GEOMACRO_P0B_ADMISSION_ACTIVE==='1'&&
   Boolean(env.B2_KEY_ID)&&Boolean(env.B2_APPLICATION_KEY)&&
   Boolean(env.B2_SPOOL_ENCRYPTION_KEY)&&Boolean(env.B2_SPOOL_BUCKET)&&
   typeof env.B2_SPOOL_PREFIX==='string'&&env.B2_SPOOL_PREFIX.endsWith('spool/')&&
   typeof env.INGEST_QUEUE?.send==='function';
  let providerBacklog=null;
  try{
   if(typeof env.INGEST_QUEUE?.metrics==='function'){
    const metrics=await env.INGEST_QUEUE.metrics();
    if(Number.isSafeInteger(metrics?.backlogCount)&&metrics.backlogCount>=0)
     providerBacklog=metrics.backlogCount;
   }
  }catch{/* Not a provider ACK proof; fail closed. */}
  const objects=bundles?.created??0,committedBundles=bundles?.committed??0;
  const journalParity=objects>0&&committedBundles===objects&&
   (bundles?.dead_letter??0)===0;
  const checkedAt=new Date().toISOString();
  return resp({
   schema:'geomacro.p0b.production-status.v1',ok:true,checked_at:checkedAt,
   activation_flag:env.GEOMACRO_P0B_ADMISSION_ACTIVE==='1',
   source_registry:{total:sources?.total??0,enabled:sources?.enabled??0,
    ever_polled:sources?.ever_polled??0},
   queue_state:queueState,normalized_metadata_rows:admitted?.n??0,
   live_bundle_parity:{
    utc_day:utcDay,b2_objects_created:objects,d1_committed_count:committedBundles,
    unacked_queue_items:providerBacklog,
    queue_metrics_best_effort:true,
    provider_queue_metrics_available:providerBacklog!==null,
    assertion_passed:journalParity&&providerBacklog===0,
    dead_letter_bundles:bundles?.dead_letter??0
   },
   b2_storage_guard:{open:Boolean(guard?.hold_until&&guard.hold_until>checkedAt),
    last_error_code:guard?.last_error_code??null,
    hold_until:guard?.hold_until??null},
   worker_b2_credentials_present:Boolean(env.B2_KEY_ID)&&
    Boolean(env.B2_APPLICATION_KEY)&&Boolean(env.B2_SPOOL_ENCRYPTION_KEY),
   worker_queue_binding_present:typeof env.INGEST_QUEUE?.send==='function',
   ready_for_real_acceptance:configured&&(sources?.enabled??0)>0,
   genuine_end_to_end_b2_remote_acceptance_proven:false,
   historical_registry_probes_not_current_live_receipts:true,
   source_rights_promoted:false,
   paid_output_changed:false,public_published:false
  });
 }catch{return resp({ok:false,error:'P0B_D1_STATUS_READBACK_FAILED'},503)}
}
