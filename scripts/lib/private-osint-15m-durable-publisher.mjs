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
   items:items.splice(0,12),checks:checks.splice(0,20),
 });
 let saved=0,excluded=0,checked=0,in15=0,over15=0;
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
    receipt.original_page_verified!==false||
    receipt.paid_product_authorized!==false||
    receipt.raw_upstream_stored!==false)
    throw Error("PRIVATE_OSINT_PROTECTED_D1_ACK_NOT_VERIFIED");
  saved+=receipt.persisted;excluded+=receipt.capacity_excluded;
  checked+=receipt.checks_saved;
  in15+=receipt.native_feed_to_first_durable_write_within_15m;
  over15+=receipt.native_feed_to_first_durable_write_over_15m;
 }
 // Authenticated private readback at end; zero public exposure.
 const status=await fetchImpl(controlPlaneRoot+"/v1/internal/private-osint-15m?offset=0",{
  method:"GET",redirect:"error",cache:"no-store",headers:{Accept:"application/json","Authorization":"Bearer "+privateToken},
  signal:AbortSignal.timeout(12000),
 });
 if(status.status!==200)throw Error("PRIVATE_OSINT_PRIVATE_READER_HTTP_"+status.status);
 const privateFeed=await status.json();
 if(privateFeed.ok!==true||privateFeed.schema!==PRIVATE_OSINT_DURABLE_SCHEMA||
    privateFeed.retention_hours!==25||
    privateFeed.scope!=="PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY"||
    privateFeed.original_page_verified!==false||
    privateFeed.commercial_use_authorized!==false||
    !Array.isArray(privateFeed.items))
   throw Error("PRIVATE_OSINT_PRIVATE_READER_SCHEMA_INVALID");
 return Object.freeze({schema:"geomacro.private-osint-15m-durable-production-receipt.v1",
   source_checks_persisted:checked,news_rows_verified_in_d1:saved,
   excluded_by_d1_capacity:excluded,
   native_feed_to_first_durable_write_within_15m:in15,
   native_feed_to_first_durable_write_over_15m:over15,
   d1_write_exact_readback_verified:true,
   separate_private_d1_readback_verified:true,
   original_page_independently_verified:false,
   195x3_live_15m_sla_guaranteed:false,
   publicly_delivered:false,raw_upstream_stored:false,
   signed_or_paid:false});
}
