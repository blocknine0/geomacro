#!/usr/bin/env node
/**
 * No-laptop, no-funds HUMAN HANDOFF STATUS for the existing 15-minute
 * independently reviewed publication backstop. This script signs nothing,
 * grants no source rights, performs no network operation and prints no
 * key, immutable SHA, article, reviewer input, or private path.
 *
 * A pointer is NEVER evidence; the protected publisher independently
 * validates every reviewer signature, source grant and B2/D1 byte.
 */
import {appendFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {prepareGriSignedReadyCadenceHint} from "../lib/gri-signed-ready-cadence-hint.mjs";
import {prepareMachineIntelligenceSignedReadyHint} from "../lib/machine-intelligence-signed-ready-hint.mjs";

const bool = v => v === "true";
export function buildPallabSumanHostedHandoff({env={},now=new Date()}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("HUMAN_HANDOFF_CLOCK_INVALID");
  const gri=prepareGriSignedReadyCadenceHint({
    reviewedSha:env.GRI_READY_REVIEWED_SHA256,
    certificatesSha:env.GRI_READY_CERTIFICATES_SHA256,
    readyAt:env.GRI_READY_APPROVED_AT,
    now
  });
  const machine=prepareMachineIntelligenceSignedReadyHint({
    inputSha:env.MACHINE_INTELLIGENCE_READY_INPUT_SHA256,
    approvedAt:env.MACHINE_INTELLIGENCE_READY_APPROVED_AT,
    now
  });
  // The flag comes ONLY from the protected scheduled cryptographic
  // require-pallab-owner-signed-gri-ready gate, not from an operator variable.
  const ownerGate=bool(env.GEOMACRO_OWNER_GATE_APPROVED);
  const enrolled=env.GEOMACRO_GRI_AUTO_ENROLLED==="YES_CONSENT_ONLY" &&
    env.GEOMACRO_GRI_AUTO_REVOKED!=="YES";
  const standing=enrolled&&bool(env.GEOMACRO_STANDING_OWNER_POLICY_VERIFIED);
  const standingAdmission=standing&&env.GEOMACRO_OWNER_GATE_APPROVAL_MODE==="STANDING_OWNER_POLICY_CONDITIONAL";
  const status=gri.eligible&&ownerGate&&machine.eligible
    ?"APPROVED_POINTERS_PRESENT_PROTECTED_PUBLICATION_AND_READBACK_UNVERIFIED"
    :"HUMAN_AND_SOURCE_EVIDENCE_HANDOFF_PENDING";
  return Object.freeze({
    schema:"geomacro.pallab-suman-hosted-human-handoff.v1",
    mode:"HOSTED_READ_ONLY_NO_FUNDS",
    status,
    delegation_scope:standing
      ?"STANDING_OWNER_PUBLICATION_CONDITIONAL_ON_REAL_INDEPENDENT_REVIEW"
      :enrolled
      ?"DERIVED_ONLY_POLICY_AUDIT_NOT_NUMERICAL_GRI"
      :"NO_ACTIVE_DERIVED_ONLY_CONSENT_DETECTED",
    public_machine_intelligence_hint_eligible:machine.eligible,
    independent_gri_hints_eligible:gri.eligible,
    genuine_pallab_owner_signature_gate_passed:ownerGate&&!standingAdmission,
    standing_owner_policy_gate_verified:standing,
    owner_admission_gate_passed:ownerGate,
    handoff:[
      {role:"APPROVED_FACTS_AND_RIGHTS_CUSTODIANS",
       action:machine.eligible
         ?"PROTECTED_CANONICAL_INTELLIGENCE_PUBLISHER_MUST_VALIDATE_SIGNED_B2_INPUT"
         :"OBTAIN_REAL_ORIGINALS_SOURCE_SCOPE_AND_DISTINCT_FACTS_RIGHTS_SIGNATURES"},
      {role:"SUMAN_INDEPENDENT_GRI_REVIEWER",
       action:gri.eligible
         ?"REVIEWED_GRI_AND_CERTIFICATE_POINTERS_PENDING_ACTUAL_B2_SIGNATURE_VERIFICATION"
         :"REVIEW_REAL_NUMERICAL_GRI_AND_SIGN_EACH_COUNTRY_CATEGORY_CERTIFICATE"},
      {role:"PALLAB_OWNER",
       action:standing
         ?"STANDING_OWNER_POLICY_READY_NO_REPEAT_OWNER_BATCH_SIGNATURE_REQUIRED"
         :ownerGate
         ?"EXACT_BATCH_OWNER_SIGNATURE_GATE_PASSED_NO_NEW_OWNER_SIGNATURE_IN_THIS_RUN"
         :"APPROVE_ONLY_EXACT_SUMAN_SIGNED_GRI_AND_CERTIFICATE_BYTES"},
      {role:"HOSTED_GEOMACRO_PRODUCTION",
       action:"EXISTING_15_MINUTE_BACKSTOP_DISPATCHES_ONLY_VERIFIED_APPROVED_INPUTS_AND_RECHECKS_PUBLIC_3_OF_3"},
      {role:"PALLAB_REAL_MONEY_OWNER",
       action:"KEEP_X402_MAINNET_PAYMENT_DISABLED_UNTIL_SEPARATE_EXPLICIT_ACK_AND_TRUE_DELIVERY_ACCEPTANCE"}
    ],
    no_laptop_daemon_required:true,
    article_specific_rights_verified_by_this_report:false,
    reviewer_signed_input_verified_by_this_report:false,
    current_signed_3_of_3_verified_by_this_report:false,
    website_deep_health_200_verified_by_this_report:false,
    real_payments_authorized:false,
    b2_gets:0,d1_writes:0,supabase_requests:0,real_payments:0
  });
}
const ACTION_TEXT=Object.freeze({
 STANDING_OWNER_POLICY_READY_NO_REPEAT_OWNER_BATCH_SIGNATURE_REQUIRED:
  "Pallab owner standing policy is cryptographically verified; no repeat owner batch signature is needed for this conditional path. Real independent signed GRI, country certificates and all existing source/scoring/B2/D1 checks remain mandatory. This is not automated independent numerical review.",
 OBTAIN_REAL_ORIGINALS_SOURCE_SCOPE_AND_DISTINCT_FACTS_RIGHTS_SIGNATURES:
  "Approved Facts and Rights custodians: verify original publisher bytes, actual per-original commercial rights, then separately sign the same qualified three-domain batch.",
 PROTECTED_CANONICAL_INTELLIGENCE_PUBLISHER_MUST_VALIDATE_SIGNED_B2_INPUT:
  "Facts/Rights hint is recent, but the canonical signed Intelligence publisher must verify all signatures, source rights, original dates, B2 exact readback and D1 publication.",
 REVIEW_REAL_NUMERICAL_GRI_AND_SIGN_EACH_COUNTRY_CATEGORY_CERTIFICATE:
  "Suman Dey: independently review real numerical GRI v1.2 and sign the exact reviewed batch plus every qualified country/category certificate. Do not sign derived news alone.",
 REVIEWED_GRI_AND_CERTIFICATE_POINTERS_PENDING_ACTUAL_B2_SIGNATURE_VERIFICATION:
  "Suman GRI/certificate pointers are recent hints only; the canonical publisher must recheck real reviewer signatures, rights, original evidence and immutable B2 bytes.",
 APPROVE_ONLY_EXACT_SUMAN_SIGNED_GRI_AND_CERTIFICATE_BYTES:
  "Pallab Das: after Suman has genuinely signed, inspect and explicitly approve the SHA-bound signed GRI and certificate batch with the existing offline owner signer.",
 EXACT_BATCH_OWNER_SIGNATURE_GATE_PASSED_NO_NEW_OWNER_SIGNATURE_IN_THIS_RUN:
  "Pallab owner signature gate passed for this run; this does not prove a current GRI score or customer delivery.",
 EXISTING_15_MINUTE_BACKSTOP_DISPATCHES_ONLY_VERIFIED_APPROVED_INPUTS_AND_RECHECKS_PUBLIC_3_OF_3:
  "GitHub Actions: the existing 15-minute backstop handles approved pointers. Canonical production publishers must verify immutable B2 and current D1 3/3 before declaring success.",
 KEEP_X402_MAINNET_PAYMENT_DISABLED_UNTIL_SEPARATE_EXPLICIT_ACK_AND_TRUE_DELIVERY_ACCEPTANCE:
  "Owner: preserve no-funds x402 until actual signed 3/3, deep-health 200, deployed SHA parity, representative customer delivery and a separate real-money ACK."
});
export function humanHandoffMarkdown(receipt){
  if(receipt?.schema!=="geomacro.pallab-suman-hosted-human-handoff.v1"||
     !Array.isArray(receipt.handoff)||
     receipt.handoff.length!==5||
     receipt.handoff.some(x=>!Object.hasOwn(ACTION_TEXT,x.action)))
    throw Error("HUMAN_HANDOFF_RECEIPT_INVALID");
  return [
    "### GEOMACRO: Pallab / Suman signed-launch handoff (no laptop, no funds)",
    "",
    "**This is a human-action queue, NOT a signed-data or settlement acceptance.**",
    "",
    ...receipt.handoff.map(x=>"- "+ACTION_TEXT[x.action]),
    "",
    "Detailed owner-only procedure: [Pallab/Suman private signing handoff](../../docs/ops/PALLAB_SUMAN_TWO_PERSON_SIGNED_GRI_HANDOFF.md).",
    "Existing cloud automation: [15-minute signed-ready backstop](../../.github/workflows/gri-signed-ready-cadence-backstop.yml).",
    "",
    "No private file, fingerprint, key, article URL, permission grant, B2 operation, D1 change or payment was produced by this report.",
    "",
  ].join("\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    if(process.argv.length!==2||
       process.env.GITHUB_ACTIONS!=="true"||
       process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
       process.env.GITHUB_REF!=="refs/heads/main"||
       !/^[a-f0-9]{40}$/.test(process.env.EXPECTED_CANONICAL_MAIN_SHA??"")||
       process.env.GITHUB_SHA!==process.env.EXPECTED_CANONICAL_MAIN_SHA)
      throw Error("HUMAN_HANDOFF_PROTECTED_EXACT_MAIN_REQUIRED");
    const receipt=buildPallabSumanHostedHandoff({env:process.env});
    console.log(JSON.stringify(receipt));
    if(process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        humanHandoffMarkdown(receipt));
  }catch{
    console.error("HOSTED_HUMAN_HANDOFF_REPORT_REFUSED_NO_MUTATION");
    process.exitCode=2;
  }
}
