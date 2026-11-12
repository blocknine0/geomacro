#!/usr/bin/env node
/** Protected manual owner review of exact candidate additive secret names. */
import {assertOfficialMain,envString,need,UUID_RE,signedReport}
 from "../release-common.ts";
import {REVIEWABLE_ADDITIVE_SECRETS}
 from "../lib/canary-additive-binding-parity.mjs";
const sha=assertOfficialMain();
need(envString("RELEASE_CONFIRMATION")==="PROMOTE_HOT50_NO_FUNDS",
 "CANARY_OWNER_TRAFFIC_CONFIRMATION_REQUIRED");
const base=envString("BASELINE_VERSION_ID"),candidate=envString("CANDIDATE_VERSION_ID");
need(UUID_RE.test(base)&&UUID_RE.test(candidate)&&base!==candidate,
 "CANARY_REVIEW_VERSION_IDS_INVALID");
const raw=String(process.env.CANARY_OWNER_REVIEWED_ADDITIVE_SECRETS||"").trim();
if(raw){
 const reviewed=raw.split(",").map(s=>s.trim());
 need(reviewed.length<=REVIEWABLE_ADDITIVE_SECRETS.length&&
  new Set(reviewed).size===reviewed.length&&
  reviewed.every(s=>REVIEWABLE_ADDITIVE_SECRETS.includes(s)),
  "CANARY_OWNER_REVIEWED_SECRET_NAMES_INVALID");
 signedReport("artifacts/release/canary-reviewed-additive-bindings.json",{
  schema:"geomacro.canary.additive-secret-review.v1",status:"PASS",
  source_sha:sha,baseline_version:base,candidate_version:candidate,
  reviewed_secret_names:reviewed.sort(),reviewed_at:new Date().toISOString(),
  owner_workflow_confirmation:"PROMOTE_HOT50_NO_FUNDS",no_funds:true
 });
 console.log(JSON.stringify({status:"SIGNED_OWNER_REVIEW_STAGED",
  reviewed_additions:reviewed.length,secret_values_logged:false}));
}else console.log(JSON.stringify({status:"NO_OWNER_REVIEWED_ADDITIONS"}));
