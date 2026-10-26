/** Protected private-only durable handoff. No GitHub artifact, public API or raw publisher payloads. */
export const PRIVATE_OSINT_DURABLE_SCHEMA="geomacro.private-osint-15m-durable.v1";
export async function persistPrivateOsintBatch({
 result,controlPlaneRoot,privateToken,fetchImpl=fetch,now=Date.now()
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
 const checks=[...result.checks];
 if(!items.length&&!checks.length)throw Error("PRIVATE_OSINT_NO_NETWORK_CHECKS");
 const groups=[];
 while(items.length||checks.length)groups.push({
   schema:PRIVATE_OSINT_DURABLE_SCHEMA,
   // Stay within the existing Worker 20-item/32-check contract while
   // reducing repeated protected HTTP writes and D1 prefetch/readback queries.
   items:items.splice(0,16),checks:checks.splice(0,32),
 });
 let saved=0,excluded=0,checked=0,in15=0,over15=0,writerBundled=true,writeQueries=0;
 let newlyOnTime=0,newlyLate=0,previouslySeen=0,firstSeenCountersAvailable=true;
 for(const group of groups){
  const response=await fetchImpl(controlPlaneRoot+"/v1/internal/private-osint-15m",{
   method:"PUT",redirect:"error",cache:"no-store",
   headers:{"Accept":"application/json","Content-Type":"application/json","Authorization":"Bearer "+privateToken},
   body:JSON.stringify(group),signal:AbortSignal.timeout(16000),
  });
  if(response.status!==200)throw Error("PRIVATE_OSINT_PROTECTED_D1_WRITE_HTTP_"+response.status);
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
 let status=await read("view=bundle"),bundle=true;
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
   source_checks_persisted:checked,news_rows_verified_in_d1:saved,
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
   original_page_independently_verified:false,
   global_195x3_live_15m_sla_guaranteed:false,
   publicly_delivered:false,raw_upstream_stored:false,
   signed_or_paid:false});
}
