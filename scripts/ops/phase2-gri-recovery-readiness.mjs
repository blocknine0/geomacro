#!/usr/bin/env node
/**
 * Phase-2 production READINESS, not current GRI publication. Combines three
 * independently verified NO-FUNDS gates using existing canonical modules:
 * D1 immutable history row; D1 B2 reservation preflight; independent signed
 * reviewer/certificates announcement. Never reads/writes B2, D1, or funds.
 */
import {appendFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {inspectExistingGriHistoricalRow} from "./preflight-gri-historical-existing-d1.mjs";
import {readGriHistoryQuotaAdmission} from "./preflight-gri-historical-shared-quota.mjs";
import {explainGriSignedInputBlockers} from "../lib/gri-signed-ready-cadence-hint.mjs";

const historyStatuses=new Set([
  "PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY",
  "PINNED_HISTORICAL_D1_ROW_ABSENT_REQUIRES_B2_PROOF",
]);
const HASH=/^[a-f0-9]{40}$/;
const blocked=Object.freeze({
  historical:"HISTORICAL_D1_ANCHOR_NOT_INDEPENDENTLY_VERIFIED",
  quota:"SHARED_B2_QUOTA_HEADROOM_NOT_PROVEN",
  signed:"CURRENT_INDEPENDENT_REVIEW_AND_COUNTRY_CERTS_ABSENT",
});
export function phase2ReadinessReceipt({history=null,quota=null,signers,now=new Date()}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    signers?.schema!=="geomacro.gri-v12-signed-input-blockers.v1")
    throw Error("PHASE2_READINESS_INPUT_INVALID");
  const historyKnown=history?.schema==="geomacro.gri-pinned-history-existing-d1-readonly.v1"&&
    historyStatuses.has(history.status)&&history.current_gri_signed===false&&
    history.b2_requests===0&&history.d1_writes===0;
  const historyPresent=historyKnown&&history.already_present===true&&
    history.status==="PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY";
  const needsHistoricalReadback=historyKnown&&!historyPresent;
  const quotaKnown=quota?.schema==="geomacro.gri-historical-shared-quota-preflight.v1"&&
    typeof quota.quota_allows_attempt==="boolean"&&
    quota.b2_requests===0&&quota.d1_writes===0;
  const quotaEligible=quotaKnown&&quota.quota_allows_attempt===true;
  const hintsValid=signers.externally_approved_fresh_hint_valid===true&&
    signers.reviewed_signed_input_pointer_valid===true&&
    signers.independent_country_certificates_pointer_valid===true;
  const conditions=[
    ...(!historyKnown?[blocked.historical]:[]),
    ...(needsHistoricalReadback?[ "IMMUTABLE_GRI_HISTORY_READBACK_NOT_YET_VERIFIED" ]:[]),
    ...(!quotaEligible?[blocked.quota]:[]),
    ...(!hintsValid?[blocked.signed]:[]),
  ];
  const historicalRoute=historyPresent?"PINNED_D1_HISTORICAL_ROW_EXISTS_NOT_CURRENT":
    historyKnown?"PINNED_B2_VERSION_REQUIRED":"HISTORICAL_D1_VERIFICATION_UNAVAILABLE";
  const next= !historyKnown?"VERIFY_HISTORICAL_D1_ANCHOR_AND_ACCOUNT_GOVERNOR":
    needsHistoricalReadback&&!quotaEligible?"WAIT_FOR_GOVERNED_B2_GET_HEADROOM":
    needsHistoricalReadback?"RUN_EXISTING_GRI_PINNED_VERSION_RECOVERY":
    !hintsValid?"STAGE_REAL_EXTERNAL_REVIEW_AND_COUNTRY_CERTIFICATES":
    "PROTECTED_GRI_PUBLISHER_MUST_REVALIDATE_ALL_EVIDENCE";
  return Object.freeze({
    schema:"geomacro.phase2-gri-recovery-readiness.v1",
    checked_at:now.toISOString(),
    phase2_inputs_preflight_complete:historyKnown&&quotaKnown,
    current_signed_publication_verified:false,
    historical_route:historicalRoute,
    historical_d1_metadata_recorded:historyPresent,
    immutable_historical_b2_readback_now_verified:false,
    historical_b2_readback_needs_governed_verification:needsHistoricalReadback,
    quota_headroom_preflight_verified:quotaKnown,
    quota_allows_bounded_immutable_history_attempt:quotaEligible,
    remaining_reserved_get:quotaKnown?quota.remaining_reserved_get:null,
    remaining_reserved_total:quotaKnown?quota.remaining_reserved_total:null,
    signed_pointer_hint_present:hintsValid,
    independently_verified_reviewer_signature_now:false,
    signed_country_category_certificates_now_verified:false,
    missing_requirements:signers.missing_requirements,
    blockers:conditions,
    next_safe_action:next,
    eligible_to_run_current_signed_gri_publisher_now:false,
    current_intelligence_available:false,
    current_gri_v12_available:false,
    current_risk_indices_available:false,
    x402_real_money_authorized:false,
    b2_requests:0,b2_puts:0,d1_writes:0,supabase_requests:0,payments:0,
    raw_source_exposed:false,private_hashes_exposed:false,
  });
}
export async function runPhase2Readiness({
  env=process.env,now=new Date(),
  checkHistory=inspectExistingGriHistoricalRow,
  checkQuota=readGriHistoryQuotaAdmission,
}={}){
  if(env.GITHUB_ACTIONS==="true"&&(
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !HASH.test(env.GITHUB_SHA??"")||
    env.GITHUB_SHA!==env.EXPECTED_CANONICAL_MAIN_SHA))
      throw Error("PHASE2_EXACT_MAIN_REQUIRED");
  for(const k of ["SUPABASE_URL","SUPABASE_DB_URL","APP_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY","APP_SUPABASE_SERVICE_ROLE_KEY",
    "COINBASE_API_KEY","COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"])
    if(env[k])throw Error("PHASE2_FUNDS_OR_SUPABASE_FORBIDDEN");
  const signers=explainGriSignedInputBlockers({
    reviewedSha:env.GRI_READY_REVIEWED_SHA256,
    certificatesSha:env.GRI_READY_CERTIFICATES_SHA256,
    readyAt:env.GRI_READY_APPROVED_AT,now,
  });
  // Independent probes: historical-row transport can fail while the D1 quota
  // ledger remains independently diagnostic. Never infer 'empty' from error.
  const [h,q]=await Promise.allSettled([
    checkHistory({env,now}),checkQuota({env,now}),
  ]);
  return phase2ReadinessReceipt({
    history:h.status==="fulfilled"?h.value:null,
    quota:q.status==="fulfilled"?q.value:null,signers,now,
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runPhase2Readiness().then(receipt=>{
    mkdirSync("artifacts/phase2-readiness",{recursive:true});
    writeFileSync("artifacts/phase2-readiness/readiness.json",
      JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
    console.log(JSON.stringify(receipt));
    if(process.env.GITHUB_STEP_SUMMARY){
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,[
        "## Phase 2 signed GRI recovery — no-funds preflight",
        "",
        "**Current signed GRI, Intelligence and Risk Indices NOT verified.**",
        "",
        "Historical: "+receipt.historical_route,
        "",
        "Shared B2 GET quota available: "+receipt.quota_allows_bounded_immutable_history_attempt,
        "",
        "Independent reviewer/cert hints: "+receipt.signed_pointer_hint_present,
        "",
        "Next safe action: "+receipt.next_safe_action,
        "",
        "A green metadata-only workflow is not a publisher acceptance. No payments or upstream-source bytes.",
        "",
      ].join("\n"));
    }
  }).catch(()=>{
    console.error("::error::PHASE2_RECOVERY_PREFLIGHT_UNAVAILABLE");
    process.exitCode=2;
  });
}
