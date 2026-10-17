/**
 * Publication integrity and provider-availability are DIFFERENT dimensions.
 * A preserved negative provider observation is valuable monitoring metadata,
 * not evidence that the D1 collector or exact readback failed.
 */
export function assessFreeSourceOperationalVerdict(receipt) {
  if(!receipt || receipt.schema!=="geomacro.production-free-source-updates.v1" ||
     receipt.d1_exact_metadata_readback_verified!==true ||
     receipt.d1_writes!==3 || receipt.supabase_requests!==0 ||
     receipt.b2_requests!==0 || receipt.payments!==0 ||
     receipt.raw_payload_persisted!==false ||
     !Number.isSafeInteger(receipt.configured_readers)||receipt.configured_readers<3 ||
     !Number.isSafeInteger(receipt.attempted)||receipt.attempted<0 ||
     receipt.attempted>receipt.configured_readers ||
     !Number.isSafeInteger(receipt.unavailable)||receipt.unavailable<0 ||
     receipt.unavailable>receipt.attempted ||
     !Array.isArray(receipt.retained_degraded_source_readers) ||
     !Number.isSafeInteger(receipt.retained_degraded_readers) ||
     receipt.retained_degraded_readers<0 ||
     receipt.retained_degraded_readers!==receipt.retained_degraded_source_readers.length)
     throw Error("FREE_SOURCE_PUBLISHER_READBACK_OR_RECEIPT_INVALID");
  const degraded=receipt.retained_degraded_readers;
  const current=receipt.unavailable;
  return Object.freeze({
    schema:"geomacro.free-source-operational-verdict.v1",
    d1_exact_readback:"VERIFIED",
    operator_status:degraded?"PARTIAL_EXTERNAL_SOURCE_DEGRADATION":"SOURCE_CHECKPOINT_HEALTHY",
    configured_readers:receipt.configured_readers,
    actually_attempted:receipt.attempted,
    attempts_unavailable:current,
    retained_degraded_source_count:degraded,
    all_external_providers_healthy:degraded===0 && receipt.attempted===receipt.configured_readers,
    stale_backoff_sources_count:Math.max(0,degraded-current),
    require_source_recovery_followup:degraded>0,
    paid_product_readiness_proven:false,
    current_195_country_evidence_proven:false,
    raw_source_material_stored:false,
    supabase_requests:0,payments:0,
  });
}
