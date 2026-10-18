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


/**
 * Operational transparency: distinguish "scheduler ran" from genuine signed
 * numerical GRI recovery. This is a pure, zero-network/zero-credentials report.
 * Never prints any signed SHA, source URL, private reviewer material or secret.
 */
export function explainGriSignedInputBlockers({reviewedSha,certificatesSha,readyAt,
  now=new Date()}={}){
  const ready=prepareGriSignedReadyCadenceHint({
    reviewedSha,certificatesSha,readyAt,now,
  });
  const shaOk=v=>typeof v==="string"&&HEX.test(v);
  return Object.freeze({
    schema:"geomacro.gri-v12-signed-input-blockers.v1",
    current_numerical_score_verified:false,
    reviewed_signed_input_pointer_valid:shaOk(reviewedSha),
    independent_country_certificates_pointer_valid:shaOk(certificatesSha)&&
      certificatesSha!==reviewedSha,
    externally_approved_fresh_hint_valid:ready.eligible,
    admission_reason:ready.reason,
    missing_requirements:Object.freeze([
      ...(!shaOk(reviewedSha)?["REAL_INDEPENDENTLY_REVIEWER_SIGNED_GRI_INPUT"]:[]),
      ...(!shaOk(certificatesSha)||certificatesSha===reviewedSha?
        ["SEPARATE_SIGNED_COUNTRY_CATEGORY_CERTIFICATES"]:[]),
      ...(!ready.eligible?["RECENT_AUTHENTIC_REVIEW_APPROVAL_WINDOW"]:[]),
    ]),
    news_selection_is_not_signed_evidence:true,
    geomacro_owned_output_license_is_not_upstream_source_rights:true,
    genuine_source_and_commercial_rights_still_mandatory:true,
    publisher_dispatch_authorized_by_this_report:false,
    signed_gri_published:false,
    numerical_score_changed:false,
    b2_requests:0,d1_writes:0,supabase_writes:0,payments:0,
  });
}
export function safeGriBlockerJobSummary(report){
  if(report?.schema!=="geomacro.gri-v12-signed-input-blockers.v1")
    throw Error("GRI_SIGNED_BLOCKER_REPORT_INVALID");
  const allowed=new Set([
    "REAL_INDEPENDENTLY_REVIEWER_SIGNED_GRI_INPUT",
    "SEPARATE_SIGNED_COUNTRY_CATEGORY_CERTIFICATES",
    "RECENT_AUTHENTIC_REVIEW_APPROVAL_WINDOW",
  ]);
  if(!Array.isArray(report.missing_requirements)||
     report.missing_requirements.some(x=>!allowed.has(x)))
    throw Error("GRI_SIGNED_BLOCKER_REPORT_INVALID");
  return [
    "### GRI v1.2 — current signed numerical recovery",
    "",
    "**Status: NOT VERIFIED.** Successful ingestion/backstop execution is not a signed numerical GRI v1.2 update.",
    "",
    "The following genuine inputs must already exist and independently pass protected publication:",
    ...report.missing_requirements.map(x=>"- Missing: "+x),
    ...(report.missing_requirements.length===0?
      ["- Pointers look structurally valid; real signatures, source rights, native clocks, canonical scoring, B2 readback and D1 must still be checked by the publisher."]:[]),
    "",
    "No third-party publisher rights are granted by Geomacro's owned-output licence.",
    "No old score was refreshed; no raw data, B2 read, D1 write, Supabase or USDC payment occurred in this diagnostic.",
    "",
  ].join("\n");
}
