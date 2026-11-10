/**
 * Strict recovery of a native-applied but genuinely EMPTY production 0213.
 * The caller must have physically queried Cloudflare D1 through the
 * complete, checked 15-column / 4-index / forced-plan audit and independently
 * proved the deployed Worker has no enabled ref-only lane or HMAC.
 * Structural verification is NEVER a signed R2 pointer or release proof.
 */
const fail=code=>{throw Error("STEP3_UNSIGNED_0213_"+code)};
export function admitUnsigned0213AppliedEmptyResume({
 nativeApplied,structuralProof,refOnlyOffProof
}={}){
 if(nativeApplied!==true)fail("NATIVE_APPLIED_HISTORY_REQUIRED");
 if(refOnlyOffProof?.status!==
      "PASS_REAL_PROVIDER_PRODUCTION_REFERENCE_ONLY_SWITCHES_OFF"||
    refOnlyOffProof.source!==
      "CLOUDFLARE_DEPLOYED_WORKER_SETTINGS_AND_VERSION"||
    refOnlyOffProof.writer_enabled!==false||
    refOnlyOffProof.reader_enabled!==false||
    refOnlyOffProof.production_hmac_deployed!==false||
    refOnlyOffProof.real_production_pointer_hmac_verified!==false||
    refOnlyOffProof.production_cutover_authorized!==false||
    refOnlyOffProof.remote_writes!==0)
  fail("LIVE_REFERENCE_SWITCHES_OR_DEPLOYED_HMAC_UNVERIFIED");
 if(structuralProof?.schema!==
      "geomacro.step3.0213-empty-ref-only-structure.v1"||
    structuralProof.status!=="OBSERVED_EMPTY_REFERENCE_STRUCTURAL_ONLY"||
    structuralProof.index_schema_count!==4||
    structuralProof.observed_rows!==0||
    structuralProof.source_pointer_hmac_verified!==false||
    structuralProof.nonvacuous_original_bytes_verified!==false||
    structuralProof.b2_original_readback_verified!==false||
    structuralProof.encrypted_r2_checkpoint_verified!==false||
    structuralProof.production_release_authorized!==false||
    structuralProof.stage2_authorized!==false||
    structuralProof.canary_promoted!==false||
    structuralProof.paid_delivery_authorized!==false||
    structuralProof.sqlite_full_integrity_check_claimed!==false||
    structuralProof.provider_reader_provenance!==
      "REQUIRES_FRESH_SAME_TARGET_D1_CALLER")
  fail("EXISTING_REFERENCE_SCHEMA_INDEX_OR_ZERO_ROWS_NOT_PROVEN");
 return Object.freeze({
  status:"PASS_NATIVE_0213_EMPTY_PROVIDER_STRUCTURE_RESUME_ONLY",
  prior_native_0213_applied:true,
  exact_empty_15_column_4_index_proven:true,
  existing_pointer_count:0,
  production_hmac_present:false,actual_hmac_verified:false,
  real_production_pointer_hmac_verified:false,
  ref_only_writer_authorized:false,ref_only_reader_cutover_authorized:false,
  original_pointer_bytes_or_hmac_claimed:false,
  independent_production_b2_get_still_required:true,
  ledger_and_four_migration_verification_still_required:true,
  signed_production_pass_generated:false,
  production_sql_mutated:false,canary_promoted:false
 });
}
