/** Protected private-only durable handoff. No GitHub artifact, public API or raw publisher payloads. */
import {buildPrivateSourceSharedReadManifest} from "./private-osint-shared-read-contract.mjs";
export const PRIVATE_OSINT_DURABLE_SCHEMA="geomacro.private-osint-15m-durable.v1";
export const PRIVATE_OSINT_D1_HEALTH_SNAPSHOT_SLOTS=3;
export const OSINT_SCHEDULE_SLOT_MS=15*60_000;
/**
 * Every original RSS/API source is fetched and classified on every OSINT tick.
 * Only D1 health-status snapshots are sharded across three consecutive
 * 15-minute scheduled ticks, so each source/category has a nominal 45-minute
 * stored-health refresh cadence. Poll and persist ALL native-dated news items
 * on EVERY scheduled 15-minute run. GitHub schedule is best effort.
 *
 * CRITICAL: sharding by 5-minute modulo slots while running every 15 minutes
 * permanently starves two out of three partitions. Use the 15-minute
 * schedule period for phase selection, including real-world jitter.
 *
 * This reduces repetitive D1 UPSERT/read work without representing a source
 * as healthy from its registration. No original titles or endpoints are
 * included in the sampling identity, only existing opaque SHA-256 refs.
 */
export function selectPrivateOsintD1HealthChecks({
 checks,now,slots=1,newsItemCount=0,
}={}){
 if(!Array.isArray(checks)||!Number.isFinite(now)||
    !Number.isSafeInteger(newsItemCount)||newsItemCount<0||
    ![1,PRIVATE_OSINT_D1_HEALTH_SNAPSHOT_SLOTS].includes(slots)||
    checks.some(check=>typeof check?.source_ref!=="string"||
      !/^[a-f0-9]{64}$/u.test(check.source_ref)))
  throw Error("PRIVATE_OSINT_HEALTH_SNAPSHOT_INPUT_INVALID");
 const slot=Math.floor(now/OSINT_SCHEDULE_SLOT_MS)%slots;
 let selected=slots===1?[...checks]:checks.filter(check=>
   parseInt(check.source_ref.slice(0,8),16)%slots===slot);
 // A quiet, tiny feed set can otherwise produce an empty authenticated
 // batch. Keep a deterministic genuine source check, never fake one.
 if(!selected.length&&!newsItemCount&&checks.length)
  selected=[checks[slot%checks.length]];
 return Object.freeze({
  checks:selected,
  observed:checks.length,
  sampled:selected.length,
  deferred:checks.length-selected.length,
  slots,slot,
 });
}

export async function persistPrivateOsintBatch({
 result,controlPlaneRoot,privateToken,fetchImpl=fetch,now=Date.now(),sourceHealthSnapshotSlots=1
}={}){
 if(!result||result.schema!=="geomacro.private-osint-15m-batch.v1"||
    !Array.isArray(result.items)||!Array.isArray(result.checks)||
    typeof controlPlaneRoot!=="string"||!/^https:\/\/geomacro-control-plane\.[a-z0-9-]+\.workers\.dev$/u.test(controlPlaneRoot)||
    !/^([a-f0-9]{64})$/u.test(privateToken??"")||
    typeof fetchImpl!=="function"||!Number.isFinite(now))
  throw Error("PRIVATE_OSINT_PUBLISHER_CONFIG_INVALID");
 const items=result.items.filter(x=>{
  const stamp=Date.parse(x?.source?.original_published_at??"");
  return Number.isFinite(stamp)&&stamp<=now&&now-stamp<=25*3600000;
 });
 const sharedSourceRead=buildPrivateSourceSharedReadManifest(items,now);
 const snapshot=selectPrivateOsintD1HealthChecks({
  checks:result.checks,now,slots:sourceHealthSnapshotSlots,newsItemCount:items.length,
 });
 const checks=[...snapshot.checks];
 if(!items.length&&!checks.length)throw Error("PRIVATE_OSINT_NO_NETWORK_CHECKS");
 const groups=[];
 const byteSize=g=>new TextEncoder().encode(JSON.stringify(g)).byteLength;
 while(items.length||checks.length){
   const group={schema:PRIVATE_OSINT_DURABLE_SCHEMA,items:[],checks:[]};
   // Fully use the existing 20-news/32-check Worker contract. The 60-KiB
   // byte boundary prevents oversized requests even for Unicode news fields.
   while(items.length&&group.items.length<20){
     group.items.push(items[0]);
     if(byteSize(group)>60_000){group.items.pop();break}
     items.shift();
   }
   while(checks.length&&group.checks.length<32){
     group.checks.push(checks[0]);
     if(byteSize(group)>60_000){group.checks.pop();break}
     checks.shift();
   }
   if(!group.items.length&&!group.checks.length)
     throw Error("PRIVATE_OSINT_SINGLE_ITEM_EXCEEDS_WORKER_REQUEST_LIMIT");
   groups.push(group);
 }
 let saved=0,excluded=0,checked=0,in15=0,over15=0,writerBundled=true,writeQueries=0;
 let newlyOnTime=0,newlyLate=0,previouslySeen=0,firstSeenCountersAvailable=true;
 let rowsRead=0,rowsWritten=0,allRowUsageKnown=true;
 for(const group of groups){
  const response=await fetchImpl(controlPlaneRoot+"/v1/internal/private-osint-15m",{
   method:"PUT",redirect:"error",cache:"no-store",
   headers:{"Accept":"application/json","Content-Type":"application/json","Authorization":"Bearer "+privateToken},
   body:JSON.stringify(group),signal:AbortSignal.timeout(16000),
  });
  if(response.status!==200){
   // The protected Worker reports bounded codes, never raw Cloudflare SQL
   // errors. No sensitive response bodies are echoed or retained.
   if(response.status===503){
    let failureClass=null;
    try{
     const raw=await response.text();
     if(raw.length<=1000){
      const doc=JSON.parse(raw);
      // Preserve only the server's finite, non-sensitive failure taxonomy.
      // In particular, don't flatten D1_UNCLASSIFIED_STORAGE_FAILURE into a
      // generic HTTP 503: that hides real production blockers from the run log.
      if(doc?.error==="PRIVATE_OSINT_D1_WRITE_OR_READBACK_UNAVAILABLE"&&
         ["D1_FREE_DAILY_ROW_READ_LIMIT","D1_FREE_DAILY_ROW_WRITE_LIMIT",
          "D1_SCHEMA_UNAVAILABLE","D1_UNCLASSIFIED_STORAGE_FAILURE"].includes(doc.failure_class))
       failureClass=doc.failure_class;
     }
    }catch{/* Old Workers / invalid response stay generic. */}
    if(failureClass)throw Error("PRIVATE_OSINT_"+failureClass);
   }
   throw Error("PRIVATE_OSINT_PROTECTED_D1_WRITE_HTTP_"+response.status);
  }
  const receipt=await response.json();
  if(receipt?.schema!=="geomacro.private-osint-15m-write-receipt.v1"||
    receipt.ok!==true||receipt.d1_exact_readback_verified!==true||
    receipt.persisted+receipt.capacity_excluded!==group.items.length||
    receipt.checks_saved!==group.checks.length||
    receipt.independent_verification_required_for_ingestion!==false||
    receipt.original_page_verified!==false||
    receipt.paid_product_authorized!==false||
    receipt.raw_upstream_stored!==false)
    throw Error("PRIVATE_OSINT_PROTECTED_D1_ACK_NOT_VERIFIED");
  if(receipt.d1_usage_metadata_complete===true&&
     Number.isSafeInteger(receipt.d1_rows_read_this_write)&&receipt.d1_rows_read_this_write>=0&&
     Number.isSafeInteger(receipt.d1_rows_written_this_write)&&receipt.d1_rows_written_this_write>=0){
   rowsRead+=receipt.d1_rows_read_this_write;
   rowsWritten+=receipt.d1_rows_written_this_write;
  }else allRowUsageKnown=false;
  saved+=receipt.persisted;excluded+=receipt.capacity_excluded;
  checked+=receipt.checks_saved;
  in15+=receipt.native_feed_to_first_durable_write_within_15m;
  over15+=receipt.native_feed_to_first_durable_write_over_15m;
  // Existing production Workers may still be serving the previous receipt
  // during rollout. Missing NEW counters mean unknown, never guessed as 0.
  const counts=[receipt.newly_persisted_within_15m,
    receipt.newly_persisted_after_15m,receipt.previously_persisted_reobserved];
  if(counts.every(x=>Number.isSafeInteger(x)&&x>=0)&&
     counts[0]+counts[1]+counts[2]===receipt.persisted){
    newlyOnTime+=counts[0];newlyLate+=counts[1];previouslySeen+=counts[2];
  }else if(counts.every(x=>x===undefined)){
    firstSeenCountersAvailable=false;
  }else throw Error("PRIVATE_OSINT_NEW_LATE_COUNTERS_INVALID");
  writerBundled=writerBundled&&receipt.existence_and_readback_bundled===true;
  if(writeQueries!==null&&Number.isSafeInteger(receipt.d1_queries_this_write)&&receipt.d1_queries_this_write>=0)
    writeQueries+=receipt.d1_queries_this_write;
  else writeQueries=null;
 }
 // Authenticated private readback at end; zero public exposure.
 const read=async view=>fetchImpl(controlPlaneRoot+"/v1/internal/private-osint-15m?"+view,{
  method:"GET",redirect:"error",cache:"no-store",headers:{Accept:"application/json","Authorization":"Bearer "+privateToken},
  signal:AbortSignal.timeout(12000),
 });
 // Prove private D1 durability with at most two indexed rows per category,
 // not 100 news projections per lane on every five-minute poll. The full
 // paginated private bundle API remains unchanged for actual research reads.
 let status=await read("view=bundle&limit=1"),bundle=true;
 // One bounded rolling-deployment fallback, only for the older private
 // reader's unknown-query 400. Auth, storage and malformed bundles fail closed.
 if(status.status===400){bundle=false;status=await read("offset=0")}
 if(status.status!==200)throw Error("PRIVATE_OSINT_PRIVATE_READER_HTTP_"+status.status);
 const privateFeed=await status.json();
 if(privateFeed.ok!==true||privateFeed.schema!==(bundle?"geomacro.private-osint-news-bundle.v1":PRIVATE_OSINT_DURABLE_SCHEMA)||
    privateFeed.retention_hours!==25||
    privateFeed.scope!=="PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY"||
    privateFeed.independent_verification_required_for_ingestion!==false||
    privateFeed.original_page_verified!==false||
    privateFeed.commercial_use_authorized!==false||
    (bundle?privateFeed.category_count!==3||privateFeed.single_d1_batch_read!==true||
      ["geopolitics","macro","rare_earth"].some(c=>!Array.isArray(privateFeed.categories?.[c]?.items)):
      !Array.isArray(privateFeed.items)))
   throw Error("PRIVATE_OSINT_PRIVATE_READER_SCHEMA_INVALID");
 return Object.freeze({schema:"geomacro.private-osint-15m-durable-production-receipt.v1",
   // This hash is the exact source-neutral ingestion record identity for
   // SAME input already sealed in fallback. Not a public raw-feed digest,
   // independent original-page proof or additional D1 query.
   shared_source_read_content_sha256:sharedSourceRead.content_sha256,
   shared_source_read_item_count:sharedSourceRead.item_count,
   shared_source_read_counts_by_category:sharedSourceRead.counts_by_category,
   source_checks_persisted:checked,
   source_checks_observed_this_tick:snapshot.observed,
   source_checks_selected_for_d1:snapshot.sampled,
   source_checks_deferred_to_snapshot:snapshot.deferred,
   source_health_snapshot_slots:snapshot.slots,
   source_health_snapshot_slot:snapshot.slot,
   source_health_snapshot_cadence_nominal_minutes:15*snapshot.slots,
   news_rows_verified_in_d1:saved,
   excluded_by_d1_capacity:excluded,
   native_feed_to_first_durable_write_within_15m:in15,
   native_feed_to_first_durable_write_over_15m:over15,
   newly_persisted_within_15m:firstSeenCountersAvailable?newlyOnTime:null,
   newly_persisted_after_15m:firstSeenCountersAvailable?newlyLate:null,
   previously_persisted_reobserved:firstSeenCountersAvailable?previouslySeen:null,
   d1_write_exact_readback_verified:true,
   independent_verification_required_for_ingestion:false,
   separate_private_d1_readback_verified:true,
   private_three_category_bundle_readback_verified:bundle,
   private_d1_writer_reads_bundled_verified:writerBundled,
   d1_queries_for_write_batches:writeQueries,
   d1_rows_read_for_write_batches:allRowUsageKnown?rowsRead:null,
   d1_rows_written_for_write_batches:allRowUsageKnown?rowsWritten:null,
   d1_usage_metadata_complete:allRowUsageKnown,
   original_page_independently_verified:false,
   global_195x3_live_15m_sla_guaranteed:false,
   publicly_delivered:false,raw_upstream_stored:false,
   signed_or_paid:false});
}
