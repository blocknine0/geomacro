/**
 * Redacted failure diagnosis for the existing free official-source to D1
 * checkpoint lane. NO upstream URLs, HTTP response bodies, token values,
 * Cloudflare account/database IDs, row metadata or source content leave
 * this helper. Only a closed enum of known operational phases/codes.
 */
const KNOWN=Object.freeze({
 "D1_CONTROL_STATE_CLOUDFLARE_ACCOUNT_ID_REQUIRED":"D1_ACCOUNT_CONFIGURATION_MISSING",
 "D1_CONTROL_STATE_CLOUDFLARE_API_TOKEN_REQUIRED":"D1_TOKEN_CONFIGURATION_MISSING",
 "D1_CONTROL_STATE_D1_DATABASE_ID_REQUIRED":"D1_DATABASE_CONFIGURATION_MISSING",
 "D1_CONTROL_STATE_QUERY_RESULT_INVALID":"D1_QUERY_RESPONSE_SHAPE_INVALID",
 "D1_CONTROL_STATE_SCOPE_INVALID":"D1_CHECKPOINT_SCOPE_INVALID",
 "FREE_SOURCE_UPDATE_PREVIOUS_STATE_INVALID":"D1_EXISTING_CHECKPOINT_SCHEMA_OR_HASH_INVALID",
 "FREE_SOURCE_UPDATE_CHECKPOINT_TOO_LARGE":"D1_CHECKPOINT_SIZE_LIMIT",
 "FREE_SOURCE_UPDATE_READBACK_MISMATCH":"D1_CHECKPOINT_POST_WRITE_READBACK_MISMATCH",
 "FREE_SOURCE_PUBLISHER_READBACK_OR_RECEIPT_INVALID":"SOURCE_RECEIPT_CONTRACT_INVALID",
 "FREE_SOURCE_UPDATE_REGISTRY_INVALID":"SOURCE_REGISTRY_CONTRACT_INVALID",
 "FREE_SOURCE_UPDATE_SPEC_UNREGISTERED":"SOURCE_REGISTRY_SPEC_INVALID",
 "FREE_SOURCE_UPDATE_CLOCK_INVALID":"SOURCE_CYCLE_CLOCK_INVALID",
});
const PHASES=new Set(["protected_context","d1_load_and_source_collection",
 "d1_operational_verdict","safe_receipt_write"]);
export function safeFreeSourceProductionFailure(error,{phase}={}){
 const message=error instanceof Error?error.message:"";
 const category=Object.hasOwn(KNOWN,message)?KNOWN[message]:
   message.startsWith("D1_CONTROL_STATE_QUERY_FAILED:")
     ?"D1_QUERY_REJECTED_OR_AUTHORIZATION_FAILED":
   message.startsWith("D1_CONTROL_STATE_")
     ?"D1_CHECKPOINT_OPERATION_FAILED":
   message.startsWith("FREE_SOURCE_UPDATE_")
     ?"SOURCE_COLLECTION_CONTRACT_OR_DEPENDENCY_FAILED":
   "UNCLASSIFIED_PROTECTED_SOURCE_FAILURE";
 return Object.freeze({
  schema:"geomacro.free-source-production-failure.v1",
  status:"FAILED_CLOSED_NO_CURRENT_SOURCE_OR_COMMERCIAL_PROOF",
  phase:PHASES.has(phase)?phase:"unknown_protected_phase",
  failure_code:category,
  d1_checkpoint_readback_verified:false,
  d1_partial_write_state:"UNKNOWN_RECHECK_REQUIRED",
  source_original_page_verified:false,
  publisher_native_event_verified:false,
  source_specific_commercial_rights_verified:false,
  independent_facts_or_rights_signature_generated:false,
  independent_numerical_gri_signed:false,
  three_hot_signed_products_ready:false,
  paid_delivery_authorized:false,
  external_payment_performed:false,
  raw_source_or_secrets_in_receipt:false,
 });
}
