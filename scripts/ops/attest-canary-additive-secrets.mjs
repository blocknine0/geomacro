#!/usr/bin/env node
/** Signed, exact-SHA/version owner review of one fixed Hot50 flag profile and
 * exact additive secret NAMES (never their values). This is NOT funds approval.
 */
import {assertOfficialMain,envString,need,UUID_RE,signedReport}
 from "../release-common.ts";
import {HOT50_INTAKE_PROFILE,parseReviewedAdditiveSecretNames}
 from "../lib/canary-additive-binding-parity.mjs";
const sha=assertOfficialMain();
need(envString("RELEASE_CONFIRMATION")==="PROMOTE_HOT50_NO_FUNDS",
 "CANARY_OWNER_TRAFFIC_CONFIRMATION_REQUIRED");
const base=envString("BASELINE_VERSION_ID"),candidate=envString("CANDIDATE_VERSION_ID");
need(UUID_RE.test(base)&&UUID_RE.test(candidate)&&base!==candidate,
 "CANARY_REVIEW_VERSION_IDS_INVALID");
const profile=String(process.env.CANARY_OWNER_REVIEWED_FLAG_PROFILE??"");
need(profile===""||profile===HOT50_INTAKE_PROFILE,
 "CANARY_OWNER_FLAG_PROFILE_INVALID");
const reviewed=parseReviewedAdditiveSecretNames(
 String(process.env.CANARY_OWNER_REVIEWED_ADDITIVE_SECRETS??""));
if(profile||reviewed.length){
 signedReport("artifacts/release/canary-reviewed-additive-bindings.json",{
  schema:"geomacro.canary.additive-secret-review.v1",status:"PASS",
  source_sha:sha,baseline_version:base,candidate_version:candidate,
  reviewed_flag_profile:profile,reviewed_secret_names:reviewed,
  reviewed_at:new Date().toISOString(),
  owner_workflow_confirmation:"PROMOTE_HOT50_NO_FUNDS",no_funds:true,
  commercial_release_authorized:false,hold_cleared:false
 });
 console.log(JSON.stringify({status:"SIGNED_OWNER_REVIEW_STAGED",
  reviewed_flag_profile:profile,reviewed_additions:reviewed.length,
  secret_values_logged:false,commercial_release_authorized:false}));
}else console.log(JSON.stringify({status:"NO_OWNER_REVIEWED_DIFFERENCES"}));
