/**
 * Whitelisted machine-signing failure classification. No error messages,
 * public/private keys, key IDs, source URLs, hashes or raw payloads are logged.
 */
const CODES=new Set([
 "STANDING_DELEGATION_DISABLED_OR_REVOKED",
 "STANDING_DELEGATION_ENVELOPE_INVALID",
 "STANDING_DELEGATION_POLICY_SCOPE_INVALID",
 "STANDING_DELEGATION_POLICY_CLOCK_INVALID",
 "STANDING_DELEGATION_PUBLIC_IDENTITY_REQUIRED",
 "STANDING_DELEGATION_PUBLIC_KEY_INVALID",
 "STANDING_DELEGATION_PUBLIC_KEY_PIN_MISMATCH",
 "STANDING_DELEGATION_AUTHORITY_SEPARATION_FAILED",
 "STANDING_DELEGATION_HUMAN_GOVERNANCE_SIGNATURE_INVALID",
 "STANDING_DELEGATION_MACHINE_PRIVATE_KEY_INVALID",
 "STANDING_DELEGATION_MACHINE_PRIVATE_PUBLIC_MISMATCH",
 "STANDING_DELEGATION_GOVERNANCE_REQUIRED",
 "STANDING_DELEGATION_REAL_DERIVED_READBACK_REQUIRED",
 "STANDING_DELEGATION_MACHINE_RECEIPT_SELF_VERIFY_FAILED",
 "DELEGATED_DERIVED_CLOUD_SIGNING_NOT_READY"
]);
const PHASES=new Set([
 "ENTRYPOINT","ENVIRONMENT_GATES","POLICY_ENVELOPE",
 "PRODUCTION_AUTHORITY_PINS","VERIFIED_NEWS_INPUT",
 "DEDICATED_MACHINE_SIGNATURE","PRIVATE_OUTPUT_WRITE"
]);
export function sanitizeCloudSigningFailure(error,phase){
 return Object.freeze({
  schema:"geomacro.delegated-derived-cloud-signing-safe-denial.v1",
  phase:PHASES.has(phase)?phase:"UNCLASSIFIED_PHASE",
  reason:CODES.has(error instanceof Error?error.message:"")?error.message:
   "DELEGATED_CLOUD_UNCLASSIFIED_CRYPTO_OR_IO_FAILURE",
  signature_produced:false,
  independent_human_review_claimed:false,
  third_party_commercial_rights_claimed:false,
  numerical_gri_approved:false,
  real_funds_touched:false,
  private_material_logged:false
 });
}
