/**
 * Owner-only, read-only activation census. It cannot certify GRI readings.
 * Counts EVERY retained P0B/outbox/historical row, not a limited sample.
 * Physical B2 parity is checked separately by the independent GET audit.
 */
import {RISK_GATE_HOT50} from "./risk-gate-hot50-scope.mjs";
import {PHASE2H_ARCHIVE_HOT50_TOTALS_SQL} from "./phase2h-archive-counter-census.mjs";
const MAX_PAGE=25,HEX=/^[a-f0-9]{64}$/u;
const reply=(value,status=200)=>Response.json(value,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "X-Robots-Tag":"noindex,nofollow"}});
const zero=(value)=>Number.isSafeInteger(value)&&value>=0;
function assertedCount(value){
 const n=Number(value);
 if(!zero(n))throw Error("ACTIVATION_CENSUS_INVALID_COUNT");
 return n;
}
const hotRows=RISK_GATE_HOT50.map(x=>"('"+x+"')").join(",");
const COVERAGE_SQL=`WITH hot(iso3) AS (VALUES ${hotRows}),
 cats(cat) AS (VALUES ('geopolitics'),('macro'),('rare_earth')),
 events AS (
  SELECT country_iso3,category,event_fingerprint,
   COUNT(DISTINCT CASE WHEN clock_basis='ORIGINAL_PUBLICATION'
     THEN publisher_domain END) AS original_publishers,
   MAX(event_clock) AS latest_event
  FROM progressive_risk_gate_facts
  WHERE event_clock>=? AND event_clock<=?
  GROUP BY country_iso3,category,event_fingerprint
 ),
 cells AS (
  SELECT country_iso3,category,COUNT(*) AS distinct_events,
    SUM(CASE WHEN original_publishers>=1 THEN 1 ELSE 0 END) AS native_events,
    SUM(CASE WHEN original_publishers>=2 THEN 1 ELSE 0 END) AS corroborated_events,
    MAX(original_publishers) AS max_publishers,MAX(latest_event) AS latest_event
  FROM events GROUP BY country_iso3,category
 )
 SELECT hot.iso3 AS country_iso3,cats.cat AS category,
   COALESCE(cells.distinct_events,0) AS observed_events,
   COALESCE(cells.native_events,0) AS original_dated_events,
   COALESCE(cells.corroborated_events,0) AS two_publisher_same_event,
   COALESCE(cells.max_publishers,0) AS max_independent_publishers,
   cells.latest_event AS latest_event_clock
 FROM hot CROSS JOIN cats LEFT JOIN cells
 ON cells.country_iso3=hot.iso3 AND cells.category=cats.cat
 ORDER BY hot.iso3,cats.cat`;
export async function readHot50ActivationCensus(env, now=Date.now()){
 if(!env?.DB?.prepare||!Number.isSafeInteger(now))return reply({
  ok:false,error:"ACTIVATION_D1_BINDING_UNAVAILABLE"},503);
 const day=new Date(now).toISOString(),cutoff=new Date(now-72*3600000).toISOString();
 try{
  const [outbox,queue,bundles,r2,historical,coverage]=await Promise.all([
   env.DB.prepare(`SELECT COUNT(*) total,
     COALESCE(SUM(CASE WHEN state='PENDING_ARCHIVE' THEN 1 ELSE 0 END),0) pending,
     COALESCE(SUM(CASE WHEN state='REPLAYING' THEN 1 ELSE 0 END),0) replaying,
     COALESCE(SUM(CASE WHEN state='REPLAYING' AND locked_until<=? THEN 1 ELSE 0 END),0) expired_leases,
     COALESCE(SUM(CASE WHEN state='ARCHIVED' THEN 1 ELSE 0 END),0) archived,
     COALESCE(SUM(CASE WHEN state='ARCHIVED' AND (NOT EXISTS (
       SELECT 1 FROM ingestion_spool_bundles b
       WHERE b.b2_spool_uri=p0b_archive_outbox.b2_uri
         AND b.bundle_sha256=p0b_archive_outbox.b2_object_sha256
         AND b.item_count=p0b_archive_outbox.item_count
         AND b.state='D1_COMMITTED' AND b.acked_at IS NOT NULL)
       OR (SELECT COUNT(*) FROM ingestion_spool_queue q
        WHERE q.b2_spool_uri=p0b_archive_outbox.b2_uri
          AND q.state IN ('D1_COMMITTED','ACKNOWLEDGED')
          AND q.d1_committed_at IS NOT NULL AND q.acked_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM normalized_articles n
           WHERE n.candidate_sha256=q.candidate_sha256 AND n.source_id=q.source_id
            AND n.b2_archive_uri=q.b2_spool_uri))<>item_count)
       THEN 1 ELSE 0 END),0) journal_mismatch
      FROM p0b_archive_outbox`).bind(day).first(),
   env.DB.prepare("SELECT state,COUNT(*) n FROM ingestion_spool_queue GROUP BY state").all(),
   env.DB.prepare("SELECT state,COUNT(*) n FROM ingestion_spool_bundles GROUP BY state").all(),
   env.DB.prepare("SELECT state,COUNT(*) n FROM p0b_private_r2_fallback GROUP BY state").all(),
   env.DB.prepare(PHASE2H_ARCHIVE_HOT50_TOTALS_SQL).first(),
   env.DB.prepare(COVERAGE_SQL).bind(cutoff,day).all()
  ]);
  const queueStates={},bundleStates={},r2States={};
  for(const [values,output] of [[queue?.results,queueStates],[bundles?.results,bundleStates],[r2?.results,r2States]]){
   if(!Array.isArray(values))throw Error("ACTIVATION_CENSUS_STATE_MISSING");
   for(const item of values){
    if(typeof item.state!=="string"||item.state.length>48||Object.hasOwn(output,item.state))
     throw Error("ACTIVATION_CENSUS_STATE_INVALID");
    output[item.state]=assertedCount(item.n);
   }
  }
  // A missing/partial migration or damaged counter cannot assert zero debt.
  if(assertedCount(historical?.categories)!==3||
     assertedCount(historical?.total)<assertedCount(historical?.unarchived))
    throw Error("ACTIVATION_ARCHIVE_COUNTERS_UNVERIFIED");
  const unhandled={
    outbox:assertedCount(outbox.total)-assertedCount(outbox.archived),
    queue:Object.entries(queueStates).filter(([k])=>!["ACKNOWLEDGED","D1_COMMITTED"].includes(k)).reduce((v,[,n])=>v+n,0),
    bundles:Object.entries(bundleStates).filter(([k])=>k!=="D1_COMMITTED").reduce((v,[,n])=>v+n,0),
    r2:Object.entries(r2States).filter(([k])=>k!=="B2_VERIFIED").reduce((v,[,n])=>v+n,0),
    historical_raw:assertedCount(historical.unarchived)
  };
  const providerQueue=await (async()=>{try{
    if(typeof env.INGEST_QUEUE?.metrics!=="function")return null;
    const x=await env.INGEST_QUEUE.metrics();
    return zero(x?.backlogCount)?x.backlogCount:null;
  }catch{return null}})();
  const items=coverage?.results;
  if(!Array.isArray(items)||items.length!==150)throw Error("ACTIVATION_COVERAGE_MATRIX_INVALID");
  const expected=new Set(RISK_GATE_HOT50.flatMap(c=>["geopolitics","macro","rare_earth"].map(k=>c+":"+k)));
  const matrix=items.map(row=>{
    if(!expected.delete(row.country_iso3+":"+row.category))throw Error("ACTIVATION_COVERAGE_CELL_INVALID");
    const events=assertedCount(row.observed_events),original=assertedCount(row.original_dated_events);
    const multi=assertedCount(row.two_publisher_same_event);
    const max=assertedCount(row.max_independent_publishers);
    const freshness=Date.parse(row.latest_event_clock??"");
    return {country_iso3:row.country_iso3,category:row.category,
      observed_events:events,original_dated_events:original,
      same_event_multi_publisher_observations:multi,max_independent_publishers:max,
      latest_event_clock:Number.isFinite(freshness)?row.latest_event_clock:null,
      state:multi>0?"MULTI_PUBLISHER_METADATA":original>0?"NATIVE_DATED_METADATA":
        events>0?"INDEX_ONLY":"EMPTY",
      reviewer_certified:false,publication_authorized:false};
  });
  const missing=matrix.filter(x=>x.state==="EMPTY").length;
  const totalUnhandled=Object.values(unhandled).reduce((a,b)=>a+b,0);
  const zeroProof=totalUnhandled===0 && providerQueue===0 &&
   assertedCount(outbox.journal_mismatch)===0;
  return reply({ok:true,schema:"geomacro.hot50-production-activation-census.v1",
    checked_at:day,country_count:50,category_count:3,cell_count:150,
    backlog:{...unhandled,total_unhandled:totalUnhandled,
     provider_queue_backlog:providerQueue,
     provider_metric_obtained:providerQueue!==null,
     outbox_total:assertedCount(outbox.total),
     archived_outboxes:assertedCount(outbox.archived),
     expired_outbox_leases:assertedCount(outbox.expired_leases),
     exact_bundle_journal_mismatch:assertedCount(outbox.journal_mismatch),
     d1_zero_unhandled_proven:totalUnhandled===0&&assertedCount(outbox.journal_mismatch)===0,
     zero_unhandled_proven:zeroProof,queue_states:queueStates,
     bundle_states:bundleStates,r2_states:r2States},
    coverage:{freshness_window_hours:72,
     observed_cells:150-missing,empty_cells:missing,
     original_dated_cells:matrix.filter(x=>x.original_dated_events>0).length,
     multi_publisher_cells:matrix.filter(x=>x.same_event_multi_publisher_observations>0).length,
     qualified_certified_cells:0,
     certification_proof_not_evaluated:true,
     complete_metadata_coverage:missing===0,
     cells:matrix},
    b2_physical_get_hash_parity_proven:false,
    certification_required_for_three_indices:true,no_funds:true});
 }catch{return reply({ok:false,error:"ACTIVATION_D1_COMPLETE_CENSUS_FAILED"},503)}
}
/** Keyset page for independent B2 GET/decrypt/manifest audit.
 * Admin-only: no article text, publisher URL or source identity is returned.
 */
export async function readP0bParityManifest(env,url){
 const after=url.searchParams.get("after")??"";
 const rawLimit=url.searchParams.get("limit")??"25";
 if((after&&!HEX.test(after))||!/^(?:[1-9]|1\d|2[0-5])$/u.test(rawLimit)||
  [...url.searchParams.keys()].some(k=>!["after","limit"].includes(k)))
  return reply({ok:false,error:"P0B_PARITY_CURSOR_INVALID"},400);
 try{
  const rows=await env.DB.prepare(`SELECT batch_id,b2_uri,b2_object_sha256,item_count
   FROM p0b_archive_outbox
   WHERE state='ARCHIVED' AND batch_id>? ORDER BY batch_id LIMIT ?`)
    .bind(after,Number(rawLimit)).all();
  if(!Array.isArray(rows?.results))throw Error("PARITY_MANIFEST_READ_FAILED");
  const items=rows.results;
  if(items.some(x=>!HEX.test(x.batch_id)||!HEX.test(x.b2_object_sha256)||
    !x.b2_uri?.startsWith("b2://")||!zero(x.item_count)||x.item_count<1||
    x.item_count>100))throw Error("PARITY_MANIFEST_INVALID");
  return reply({ok:true,schema:"geomacro.p0b-remote-manifest-page.v1",
    rows:items,next_cursor:items.length===Number(rawLimit)?
      items.at(-1).batch_id:null,complete:items.length<Number(rawLimit),
    no_plaintext:true});
 }catch{return reply({ok:false,error:"P0B_PARITY_MANIFEST_FAILED"},503)}
}
