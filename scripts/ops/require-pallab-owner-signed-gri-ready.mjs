#!/usr/bin/env node
// Same pure approval check in scheduled main and canonical GRI publisher.
// Scheduled cadence: missing signature = skip GRI only; no fake approval.
// Canonical publisher: missing or invalid signature = hard failure BEFORE B2.
import {appendFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {verifyPallabSignedReadyGate} from
 "../lib/pallab-signed-ready-gri-gate.mjs";
import {explainGriSignedInputBlockers,safeGriBlockerJobSummary} from
 "../lib/gri-signed-ready-cadence-hint.mjs";
const SHA=/^[a-f0-9]{64}$/u;
export function checkCurrentOwnerSignedReady({env=process.env,now=new Date(),allowEmpty=false}={}){
 const reviewedSha=env.GRI_READY_REVIEWED_SHA256||
   env.REVIEWED_B2_SHA256||"";
 const certSha=env.GRI_READY_CERTIFICATES_SHA256||
   env.REVIEWED_CERTIFICATES_B2_SHA256||"";
 const envelope=env.GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64||"";
 if(allowEmpty&&(!envelope||!SHA.test(reviewedSha)||!SHA.test(certSha)))
   return {status:"AWAITING_REAL_HUMAN_SIGNED_INPUT",approved:false};
 // A 90min human signature MUST NOT be reused as if signed recently.
 // Existing signed-input hints expire in 28min. For scheduled runs, skip
 // without a network call or spamming failed jobs once the pointer expires.
 if(allowEmpty){
   const readyAt=Date.parse(env.GRI_READY_APPROVED_AT??"");
   if(!Number.isFinite(readyAt)||readyAt>now.getTime()||
      now.getTime()-readyAt>=28*60_000)
     return {status:"STALE_OR_MISSING_HUMAN_SIGNED_READY_HINT",approved:false};
 }
 const result=verifyPallabSignedReadyGate({
   ownerEnvelopeBase64:envelope,
   ownerPublicKeyPem:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM,
   ownerPublicKeySpkiSha256:env.GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256,
   sumanReviewerSpkiSha256:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256,
   factsSpkiSha256:env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,
   rightsSpkiSha256:env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,
   reviewedSha256:reviewedSha,certificatesSha256:certSha,now
 });
 return {status:result.status,approved:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{
  if(process.argv.length!==3||
     !["--scheduled-owner-gate","--require-owner-before-b2"].includes(process.argv[2])||
     process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
     process.env.GITHUB_REF!=="refs/heads/main"||
     process.env.GITHUB_ACTIONS!=="true")
    throw Error("PALLAB_SIGNED_GATE_PROTECTED_MAIN_REQUIRED");
  const scheduled=process.argv[2]==="--scheduled-owner-gate";
  // Always report admission blockers, even when the publisher step is skipped.
  // No private hashes, envelopes, source payloads or keys enter this report.
  if(scheduled){
   const report=explainGriSignedInputBlockers({
    reviewedSha:process.env.GRI_READY_REVIEWED_SHA256,
    certificatesSha:process.env.GRI_READY_CERTIFICATES_SHA256,
    readyAt:process.env.GRI_READY_APPROVED_AT,
   });
   console.log(JSON.stringify(report));
   if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,safeGriBlockerJobSummary(report));
  }
  const r=checkCurrentOwnerSignedReady({allowEmpty:scheduled});
  if(process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT,
      "owner_approved="+(r.approved?"true":"false")+"\n");
  console.log(JSON.stringify({schema:"geomacro.owner-human-signed-gri-gate.v1",
   status:r.status,approved:r.approved,
   reviewer_signature_verified:false,publisher_not_yet_run:true,
   b2_requests:0,payments:0}));
  if(!r.approved&&!scheduled)process.exitCode=2;
 }catch{
  console.error("PALLAB_HUMAN_SIGNED_GRI_GATE_REJECTED_NO_PUBLICATION");
  process.exitCode=2;
 }
}
