/**
 * Deterministic, side-effect-free GRI v1.2 signed-ready BACKSTOP admission.
 * These repository variable pointers are scheduler HINTS, not legal rights,
 * signed evidence or scoring authorization. Real validity is rechecked by
 * the existing protected GRI reviewer/publisher after exact B2 readback.
 */
const HEX=/^[a-f0-9]{64}$/u;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const MAX_READY_HINT_AGE_MS=28*60_000;
const PREFIX_INPUT="geomacro-evidence/v1/private/reviewed-gri-current/";
const PREFIX_CERT="geomacro-evidence/v1/private/reviewed-country-certification/";
const NONE=(reason)=>Object.freeze({
  eligible:false,reason,inputs:null,
  real_signed_input_checked:false,
  published:false,gri_score_recomputed:false,
  x402_payments:0,supabase_writes:0,b2_operations:0,d1_writes:0,
});
export function prepareGriSignedReadyCadenceHint({
  reviewedSha,certificatesSha,readyAt,now=new Date(),
}={}){
  if([reviewedSha,certificatesSha,readyAt].every(x=>x===undefined||x===""))
    return NONE("NO_EXTERNALLY_APPROVED_SIGNED_INPUT_POINTER");
  if(!HEX.test(reviewedSha??"")||!HEX.test(certificatesSha??"")||
    reviewedSha===certificatesSha)
    return NONE("MISSING_OR_INVALID_IMMUTABLE_INPUT_SHA");
  if(typeof readyAt!=="string"||!UTC.test(readyAt))
    return NONE("MISSING_OR_INVALID_SIGNED_READY_HINT_TIME");
  const nowMs=now instanceof Date?now.getTime():NaN;
  const at=Date.parse(readyAt);
  if(!Number.isFinite(nowMs)||!Number.isFinite(at)||at>nowMs||
     nowMs-at>=MAX_READY_HINT_AGE_MS)
    return NONE("SIGNED_READY_HINT_STALE_OR_FUTURE");
  const inputs=Object.freeze({
    reviewed_b2_key:PREFIX_INPUT+reviewedSha+".json",
    reviewed_b2_sha256:reviewedSha,
    reviewed_certificates_b2_key:PREFIX_CERT+certificatesSha+".json",
    reviewed_certificates_b2_sha256:certificatesSha,
  });
  return Object.freeze({
    eligible:true,
    reason:"EXTERNAL_SIGNED_POINTER_AVAILABLE_REVALIDATION_REQUIRED",
    inputs,
    real_signed_input_checked:false,
    published:false,gri_score_recomputed:false,
    x402_payments:0,supabase_writes:0,b2_operations:0,d1_writes:0,
  });
}

export function assertGriDispatchTarget(target){
  if(target!=="gri-v12-supabase-free-reviewed-current.yml")
    throw Error("ONLY_CANONICAL_SIGNED_GRI_PUBLISHER_ALLOWED");
  return target;
}
