#!/usr/bin/env node
/**
 * Phase 2, zero-B2 read-only admission for the historical GRI multi-snapshot
 * *candidate* set and authentic external reviewer input hints. The existing
 * website historical ring is not the signed multi-snapshot B2 history contract.
 * Never convert D1 metadata into a real B2 historical lineage assertion.
 */
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {appendFileSync} from "node:fs";
import {existingD1HistoryWriter} from "./restore-gri-verified-version-to-d1.mjs";
import {explainGriSignedInputBlockers} from "../lib/gri-signed-ready-cadence-hint.mjs";

const SHA=/^[a-f0-9]{64}$/u;
const PROOF="geomacro.public-global-risk-live-proof.v1";
const FIELDS=new Set(["source_as_of","b2_sha256","payload_sha256",
  "original_generated_at","original_verified_at","proof_schema"]);
const MAX_ROWS=8;
const SQL="SELECT source_as_of,b2_sha256,payload_sha256,original_generated_at,"+
  "original_verified_at,proof_schema FROM website_verified_gri_snapshot_history "+
  "ORDER BY source_as_of DESC LIMIT 8";

export function inspectGriHistoryCandidateMetadata(rows,{now=new Date()}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Array.isArray(rows)||rows.length>MAX_ROWS)throw Error("PHASE2_D1_HISTORY_ROWS_INVALID");
  const n=now.getTime(),seen=new Set(),sourceIds=new Set();
  let eligible=0,conflicting=0,withActualB2AuditClock=0;
  for(const r of rows){
    if(!r||typeof r!=="object"||
       Object.keys(r).some(k=>!FIELDS.has(k)))
      throw Error("PHASE2_D1_HISTORY_ROW_SHAPE_INVALID");
    const clock=(v)=>typeof v==="string"?Date.parse(v):NaN;
    const source=clock(r.source_as_of);
    const produced=clock(r.original_generated_at);
    const audited=clock(r.original_verified_at);
    const valid=SHA.test(r.b2_sha256??"")&&SHA.test(r.payload_sha256??"")&&
      r.proof_schema===PROOF&&
      Number.isFinite(source)&&Number.isFinite(produced)&&
      source<=produced+5*60_000&&produced<=n+5*60_000&&
      source<=n+5*60_000&&Number.isFinite(audited)&&
      audited>=produced&&audited<=n+5*60_000;
    if(!valid)continue;
    const identity=r.source_as_of+"|"+r.payload_sha256+"|"+r.b2_sha256;
    if(seen.has(identity))continue;
    seen.add(identity);
    if(sourceIds.has(r.source_as_of)){
      conflicting++;continue;
    }
    sourceIds.add(r.source_as_of);
    eligible++;
    withActualB2AuditClock++;
  }
  const uniqueCandidatePair=eligible>=2&&conflicting===0;
  return Object.freeze({
    schema:"geomacro.phase2-gri-existing-historical-metadata-admission.v1",
    checked_at:now.toISOString(),
    inspected_d1_rows:rows.length,
    distinct_historical_website_snapshot_candidates:eligible,
    historical_metadata_conflicts:conflicting,
    metadata_includes_original_b2_readback_clock:withActualB2AuditClock>0,
    two_historical_d1_candidates_observed:uniqueCandidatePair,
    // The publisher needs one genuinely pinned immutable B2 HISTORY payload
    // containing >=2 independently verified numerical snapshots. Its bytes
    // and review cannot be proven by this D1-only website-ring SELECT.
    multi_snapshot_immutable_b2_history_bytes_verified:false,
    reviewer_signed_current_history_profile_verified:false,
    original_clock_restamped:false,paid_gri_or_indices_published:false,
    b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  });
}
export async function phase2GriAdmission({query,env=process.env,
  now=new Date()}={}){
  if(env.B2_ACCOUNT_QUOTA_REQUIRED!=="1" ||
     env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="historical_gri_version_recovery" ||
     env.GEOMACRO_GRI_RESTORE_WEBSITE_HISTORY!=="1")
    throw Error("PHASE2_PRODUCTION_READONLY_GOVERNANCE_REQUIRED");
  for(const forbidden of ["SUPABASE_DB_URL","SUPABASE_URL",
    "APP_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
    "APP_SUPABASE_SERVICE_ROLE_KEY","COINBASE_API_KEY",
    "COINBASE_X402_MAINNET_ACK","GEOMACRO_COMMERCIAL_LAUNCH_ACK"])
    if(env[forbidden])throw Error("PHASE2_FUNDS_SUPABASE_FORBIDDEN");
  const read=query??existingD1HistoryWriter(env);
  const rows=await read(SQL,[]);
  const history=inspectGriHistoryCandidateMetadata(rows,{now});
  const review=explainGriSignedInputBlockers({
    reviewedSha:env.GRI_READY_REVIEWED_SHA256,
    certificatesSha:env.GRI_READY_CERTIFICATES_SHA256,
    readyAt:env.GRI_READY_APPROVED_AT,now,
  });
  return Object.freeze({
    schema:"geomacro.phase2-signed-gri-historical-admission.v1",
    checked_at:now.toISOString(),historical:history,
    missing_signed_input_requirements:review.missing_requirements,
    externally_approved_current_review_hint_valid:
      review.externally_approved_fresh_hint_valid,
    next_phase:!history.two_historical_d1_candidates_observed?
      "VERIFY_IMMUTABLE_MULTI_SNAPSHOT_B2_HISTORY_AND_DISTINCT_ORIGINALS":
      !review.externally_approved_fresh_hint_valid?
        "OBTAIN_INDEPENDENT_REVIEW_AND_SIGNED_COUNTRY_CERTIFICATES":
        "PROTECTED_PUBLISHER_MUST_REVALIDATE_SIGNATURES_RIGHTS_B2_BYTES",
    signed_gri_now_verified:false,signed_risk_indices_now_verified:false,
    b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const status=await phase2GriAdmission();
    console.log(JSON.stringify(status));
    if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "### Phase 2 — signed GRI and actual B2 history admission (no funds)\n"+
      "- Distinct historical D1 website metadata candidates: "+
        status.historical.distinct_historical_website_snapshot_candidates+"\n"+
      "- Exact multi-snapshot B2 history readback: **NOT VERIFIED** (metadata only)\n"+
      "- Current externally approved reviewer hint: "+
        status.externally_approved_current_review_hint_valid+"\n"+
      "- Missing approval requirements: "+
        (status.missing_signed_input_requirements.join(", ")||"none at metadata level")+"\n"+
      "- Next: "+status.next_phase+"\n"+
      "No source timestamps refreshed; no B2 GET, signed GRI, D1 mutation, Supabase or payments.\n");
  }catch{
    console.error("::error::PHASE2_HISTORICAL_OR_REVIEW_READONLY_ADMISSION_UNVERIFIED");
    process.exitCode=2;
  }
}
