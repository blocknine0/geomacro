#!/usr/bin/env node
/** Protected owner review of fixed Hot50 NO FUNDS flags and exact additive names. */
import {assertOfficialMain,envString,need,UUID_RE,signedReport}
 from "../release-common.ts";
import {REVIEWABLE_ADDITIVE_SECRETS,reviewedHot50CandidateVars}
 from "../lib/canary-additive-binding-parity.mjs";
const sha=assertOfficialMain();
need(envString("RELEASE_CONFIRMATION")==="PROMOTE_HOT50_NO_FUNDS",
 "CANARY_OWNER_TRAFFIC_CONFIRMATION_REQUIRED");
need(envString("CANARY_OWNER_REVIEWED_HOT50_RUNTIME")==="ENABLE_HOT50_RESEARCH_NO_FUNDS",
 "CANARY_OWNER_REVIEWED_HOT50_RUNTIME_REQUIRED");
const base=envString("BASELINE_VERSION_ID"),candidate=envString("CANDIDATE_VERSION_ID");
need(UUID_RE.test(base)&&UUID_RE.test(candidate)&&base!==candidate,
 "CANARY_REVIEW_VERSION_IDS_INVALID");
const raw=String(process.env.CANARY_OWNER_REVIEWED_ADDITIVE_SECRETS||"");
need(raw===raw.trim(),"CANARY_OWNER_REVIEWED_SECRET_FORMAT_INVALID");
const reviewed=raw?raw.split(","):[];
const runtime=reviewedHot50CandidateVars(sha,process.env);
const reviewedPredgeRuntimeVars=Object.fromEntries(["PREDGE_PAID_TRAFFIC_ENABLED","PREDGE_PAID_GO_LIVE_CROSSCHECK","PREDGE_MUTUAL_TRIAL_STARTED_AT","GEOMACRO_STORE_CHECKOUT_ENABLED"].map(name=>[name,runtime[name]]));
need(reviewed.length<=REVIEWABLE_ADDITIVE_SECRETS.length&&
 new Set(reviewed).size===reviewed.length&&
 reviewed.every(s=>REVIEWABLE_ADDITIVE_SECRETS.includes(s)),
 "CANARY_OWNER_REVIEWED_SECRET_NAMES_INVALID");
signedReport("artifacts/release/canary-reviewed-additive-bindings.json",{
 schema:"geomacro.canary.additive-secret-review.v1",status:"PASS",
 source_sha:sha,baseline_version:base,candidate_version:candidate,
 reviewed_secret_names:reviewed.sort(),
 reviewed_predge_runtime_vars:reviewedPredgeRuntimeVars,
 reviewed_hot50_runtime:"ENABLE_HOT50_RESEARCH_NO_FUNDS",
 reviewed_at:new Date().toISOString(),
 owner_workflow_confirmation:"PROMOTE_HOT50_NO_FUNDS",
 no_funds:true,commercial_release_authorized:false,hold_cleared:false
});
console.log(JSON.stringify({status:"SIGNED_OWNER_REVIEW_STAGED",
 reviewed_additions:reviewed.length,reviewed_hot50_runtime:true,
 paid_traffic_enabled:runtime.PREDGE_PAID_TRAFFIC_ENABLED,
 secret_values_logged:false,commercial_release_authorized:false}));
