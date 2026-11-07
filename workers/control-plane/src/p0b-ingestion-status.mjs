/** Protected P0-B production readiness / durable queue census.
 * Never returns source URLs, original titles, original IDs, tokens, B2 URIs
 * or individual candidate SHAs. Admin bearer is enforced by index.mjs.
 */
/**
 * Hard per-request bounds on the costly root-admin deep census. SQLite
 * COUNT(*) and correlated COUNT(*) subqueries do not become cheap with a
 * trailing LIMIT. Instead probe at most N+1 actual rows per table BEFORE
 * any whole-table aggregate. A large table defers only this expensive
 * audit, never the intake pipeline or the cheap status endpoint.
 *
 * Deferred audit cannot stand in for certified B2 parity. Its response has
 * assertion_passed:false and needs independent B2 physical proof.
 * This local read bound is not an account-wide D1 atomic quota guarantee.
 */
export const P0B_DEEP_CENSUS_PROBE_LIMITS=Object.freeze({
 source_registry:256,ingestion_spool_queue:64,
 normalized_articles:64,ingestion_spool_bundles:32,
 p0b_archive_outbox:8
});
const DEEP_LIMIT_COLUMNS=Object.freeze({
 source_registry:"sources_over",
 ingestion_spool_queue:"queue_over",
 normalized_articles:"normalized_over",
 ingestion_spool_bundles:"bundles_over",
 p0b_archive_outbox:"outbox_over"
});
export const P0B_DEEP_CENSUS_BOUND_SQL="SELECT "+
 Object.entries(P0B_DEEP_CENSUS_PROBE_LIMITS).map(([table,n])=>
  "EXISTS(SELECT 1 FROM "+table+" LIMIT 1 OFFSET "+n+") AS "+
  DEEP_LIMIT_COLUMNS[table]).join(", ");
export function assessP0bDeepCensusBound(row){
 if(!row||typeof row!=="object")throw Error("P0B_DEEP_PROBE_UNVERIFIED");
 const keys=Object.values(DEEP_LIMIT_COLUMNS);
 if(keys.some(k=>row[k]!==0&&row[k]!==1))
  throw Error("P0B_DEEP_PROBE_UNVERIFIED");
 const tooLarge=keys.some(k=>row[k]===1);
 return Object.freeze({
  safe_to_run_exact_deep:!tooLarge,
  deferred_due_to_existing_table_size:tooLarge,
  observed_tables:keys.length,
  account_daily_billed_row_cap_proven:false
 });
}

const resp=(value,status=200)=>Response.json(value,{status,headers:{
 'Cache-Control':'private, no-store','X-Robots-Tag':'noindex,nofollow',
 'X-Content-Type-Options':'nosniff'
}});
export async function getP0bIngestionStatus(env,{deep=false}={}){
 if(!env?.DB?.prepare||typeof deep!=='boolean')
  return resp({ok:false,error:'P0B_D1_BINDING_UNAVAILABLE'},503);
 if(deep){
  try{
   const probe=assessP0bDeepCensusBound(
    await env.DB.prepare(P0B_DEEP_CENSUS_BOUND_SQL).first());
   if(!probe.safe_to_run_exact_deep){
    // Cheap status is still available to the operator, but never substitute
    // this for complete queue/outbox/B2 parity. No full table scan is made.
    const fast=await getP0bIngestionStatus(env,{deep:false});
    if(fast.status!==200)return fast;
    const shallow=await fast.json();
    return resp({...shallow,
     deep_census_requested:true,deep_census_deferred:true,
     deep_census_deferred_reason:"P0B_DEEP_ROW_EXPOSURE_UNSAFE",
     deep_census_bound_proof:probe,
     recommended_path:"BOUNDED_KEYSET_OR_PROVIDER_VERIFIED_PARITY",
     ready_for_real_acceptance:false,
     genuine_end_to_end_b2_remote_acceptance_proven:false});
   }
  }catch{
   return resp({ok:false,error:"P0B_DEEP_PROBE_UNVERIFIED",
    deep_census_requested:true,deep_census_deferred:true,
    genuine_end_to_end_b2_remote_acceptance_proven:false},503);
  }
 }
 try{
  const utcDay=new Date().toISOString().slice(0,10)+'T00:00:00.000Z';
  const [sources,states,admitted,guard,bundles,outbox]=await Promise.all([
   (deep?env.DB.prepare('SELECT COUNT(*) AS total, SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END) AS enabled, '+
    'SUM(CASE WHEN last_polled_at IS NOT NULL THEN 1 ELSE 0 END) AS ever_polled '+
    'FROM source_registry').first():
    // Uses idx_p0a_registry_due(enabled,...), stops at one registered source.
    env.DB.prepare('SELECT EXISTS(SELECT 1 FROM source_registry WHERE enabled=1 LIMIT 1) AS has_enabled').first()),
   (deep?env.DB.prepare('SELECT state,COUNT(*) AS n FROM ingestion_spool_queue GROUP BY state').all():
    Promise.resolve({results:[]})),
   // Only an explicitly requested deep audit scans the normalized article count.
   // Routine operational health must not spend D1 rows on a non-critical total.
   (deep?env.DB.prepare('SELECT COUNT(*) AS n FROM normalized_articles').first():Promise.resolve(null)),
   env.DB.prepare('SELECT hold_until,last_error_code FROM p0b_storage_circuit WHERE singleton=1').first(),
   (deep?env.DB.prepare('SELECT COUNT(*) AS created,'+
    "SUM(CASE WHEN state='D1_COMMITTED' AND acked_at IS NOT NULL THEN 1 ELSE 0 END) AS committed,"+
    "SUM(CASE WHEN state='DEAD_LETTER' THEN 1 ELSE 0 END) AS dead_letter "+
    'FROM ingestion_spool_bundles WHERE created_at>=?').bind(utcDay).first():
    // The committed-day probe uses idx_p0b_bundle_committed.
    // This is a readiness hint, never a day-level count or a parity certificate.
    env.DB.prepare(
     "SELECT EXISTS(SELECT 1 FROM ingestion_spool_bundles "+
     "WHERE d1_committed_at>=? AND state='D1_COMMITTED' AND acked_at IS NOT NULL LIMIT 1) AS has_committed_today,"+
     "EXISTS(SELECT 1 FROM ingestion_spool_bundles "+
     "WHERE state='DEAD_LETTER' AND created_at>=? LIMIT 1) AS has_dead_letter_today"
    ).bind(utcDay,utcDay).first()),
   // Only explicit root-admin deep parity performs correlated bundle/item
   // journal joins. Routine health uses small bounded state totals; unknown
   // cross-storage integrity is NEVER represented as a positive proof.
   (deep?env.DB.prepare(
    "SELECT COUNT(*) AS total,"+
    "COALESCE(SUM(CASE WHEN state IN ('PENDING_ARCHIVE','REPLAYING') THEN 1 ELSE 0 END),0) AS pending,"+
    "COALESCE(SUM(CASE WHEN state='ARCHIVED' THEN 1 ELSE 0 END),0) AS archived,"+
    "COALESCE(SUM(CASE WHEN state='ARCHIVED' AND "+
    "(b2_uri IS NULL OR b2_object_sha256 IS NULL) THEN 1 ELSE 0 END),0) AS archived_missing_b2,"+
    "COALESCE(SUM(CASE WHEN state='ARCHIVED' AND NOT EXISTS ("+
    "SELECT 1 FROM ingestion_spool_bundles AS b WHERE "+
    "b.b2_spool_uri=p0b_archive_outbox.b2_uri AND "+
    "b.bundle_sha256=p0b_archive_outbox.b2_object_sha256 AND "+
    "b.item_count=p0b_archive_outbox.item_count) THEN 1 ELSE 0 END),0) AS bundle_journal_mismatch,"+
    "COALESCE(SUM(CASE WHEN state='ARCHIVED' AND "+
    "(SELECT COUNT(*) FROM ingestion_spool_queue AS q "+
    "WHERE q.b2_spool_uri=p0b_archive_outbox.b2_uri)<>item_count "+
    "THEN 1 ELSE 0 END),0) AS item_journal_mismatch "+
    "FROM p0b_archive_outbox"
   ).first():
    // Both EXISTS probes use idx_p0b_archive_outbox_pending(state,...).
    // Never scan all archived items during routine /status monitoring.
    env.DB.prepare(
     "SELECT EXISTS(SELECT 1 FROM p0b_archive_outbox "+
     "WHERE state IN ('PENDING_ARCHIVE','REPLAYING') LIMIT 1) AS has_pending,"+
     "EXISTS(SELECT 1 FROM p0b_archive_outbox "+
     "WHERE state='ARCHIVED' LIMIT 1) AS has_archived"
    ).first()),

  ]);
  const queueState=deep?{PENDING:0,PROCESSING:0,ACKNOWLEDGED:0,D1_COMMITTED:0,
   RETRY:0,QUARANTINED:0,DEAD_LETTER:0}:null;
  if(deep)for(const state of states.results??[]){
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
  const objects=deep?(bundles?.created??0):null;
  const committedBundles=deep?(bundles?.committed??0):null;
  const cheapHint={
   has_committed_today:!deep&&bundles?.has_committed_today===1,
   dead_letter_today_observed:!deep&&bundles?.has_dead_letter_today===1,
   outbox_pending_observed:!deep&&outbox?.has_pending===1,
   ready_for_deep_check:!deep&&bundles?.has_committed_today===1&&
     bundles?.has_dead_letter_today===0&&outbox?.has_pending===0&&
     providerBacklog===0,
   proves_integrity:false,proves_b2_object_get:false,
   exact_counts_not_performed:!deep
  };
  const noOutboxMismatch=deep&&outbox!==null&&
   (outbox?.archived_missing_b2??-1)===0&&
   (outbox?.bundle_journal_mismatch??-1)===0&&
   (outbox?.item_journal_mismatch??-1)===0;
  const outboxDrained=(outbox?.pending??-1)===0&&
   (outbox?.total??0)>0;
  const journalParity=objects>0&&committedBundles===objects&&
   (bundles?.dead_letter??0)===0&&noOutboxMismatch&&outboxDrained;
  const checkedAt=new Date().toISOString();
  return resp({
   schema:'geomacro.p0b.production-status.v1',ok:true,checked_at:checkedAt,
   activation_flag:env.GEOMACRO_P0B_ADMISSION_ACTIVE==='1',
   source_registry:{total:deep?(sources?.total??0):null,
    enabled:deep?(sources?.enabled??0):null,
    ever_polled:deep?(sources?.ever_polled??0):null,
    has_enabled:deep?(sources?.enabled??0)>0:sources?.has_enabled===1,
    counts_exhaustive:deep},
   queue_state:queueState,queue_state_counts_exhaustive:deep,
   normalized_metadata_rows:deep?(admitted?.n??0):null,
   normalized_metadata_count_verified:deep,
   transactional_outbox_parity:{
    state:"D1_FIRST_ENCRYPTED_THEN_B2_VERIFIED",
    total_bundle_records:deep?(outbox?.total??null):null,
    pending_archive_bundles:deep?(outbox?.pending??null):null,
    archived_verified_bundles:deep?(outbox?.archived??null):null,
    archived_without_b2_pointer:outbox?.archived_missing_b2??null,
    archived_without_exact_bundle_journal:outbox?.bundle_journal_mismatch??null,
    archived_item_count_mismatch:outbox?.item_journal_mismatch??null,
    parity_deep_check_performed:deep,
    integrity_zero_mismatch:noOutboxMismatch,
    fully_drained:noOutboxMismatch&&outboxDrained,
    bundle_objects_not_equated_with_candidate_rows:true,
    physical_b2_object_list_not_independently_enumerated:true
   },
   live_bundle_parity:{
    utc_day:utcDay,b2_objects_created:objects,d1_committed_count:committedBundles,
    unacked_queue_items:providerBacklog,
    queue_metrics_best_effort:true,
    provider_queue_metrics_available:providerBacklog!==null,
    assertion_passed:journalParity&&providerBacklog===0,
    dead_letter_bundles:deep?(bundles?.dead_letter??0):null,
    private_transactional_outbox_consistent:noOutboxMismatch,
    private_transactional_outbox_pending:outbox?.pending??null,
   },
   cheap_queue_readiness_hint:cheapHint,
   b2_spool_scope:{prefix:env.B2_SPOOL_PREFIX??null,bucket:env.B2_SPOOL_BUCKET??null},
   b2_storage_guard:{open:Boolean(guard?.hold_until&&guard.hold_until>checkedAt),
    last_error_code:guard?.last_error_code??null,
    hold_until:guard?.hold_until??null},
   worker_b2_credentials_present:Boolean(env.B2_KEY_ID)&&
    Boolean(env.B2_APPLICATION_KEY)&&Boolean(env.B2_SPOOL_ENCRYPTION_KEY),
   worker_queue_binding_present:typeof env.INGEST_QUEUE?.send==='function',
   ready_for_real_acceptance:configured&&
    (deep?(sources?.enabled??0)>0:sources?.has_enabled===1),
   genuine_end_to_end_b2_remote_acceptance_proven:false,
   historical_registry_probes_not_current_live_receipts:true,
   source_rights_promoted:false,
   paid_output_changed:false,public_published:false
  });
 }catch{return resp({ok:false,error:'P0B_D1_STATUS_READBACK_FAILED'},503)}
}
