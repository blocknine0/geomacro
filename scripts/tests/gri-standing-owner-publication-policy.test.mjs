import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import {readFileSync} from "node:fs";
import {makeGriAutomationPolicy,signGriAutomationConsent,ROLES,ENVELOPE}
 from "../lib/gri-automation-consent.mjs";
import {spkiDigest} from "../lib/standing-derived-delegation.mjs";
import {verifyStandingGriOwnerPublicationPolicy,verifyStandingGriOwnerPublicationConsent,authorizeStandingGriOwnerInput,verifyStandingOwnerMachineIdentity}
 from "../lib/gri-standing-owner-publication-policy.mjs";
import {checkCurrentOwnerSignedReady} from "../ops/require-pallab-owner-signed-gri-ready.mjs";
import {buildPallabSumanHostedHandoff,humanHandoffMarkdown} from "../ops/report-pallab-suman-hosted-handoff.mjs";
const now=new Date("2026-10-23T19:00:00.000Z");
function fixture(){
 const pair=()=>{const k=generateKeyPairSync("ed25519");return {...k,
  pem:k.publicKey.export({format:"pem",type:"spki"}).toString(),pin:spkiDigest(k.publicKey)}};
 const owner=pair(),reviewer=pair(),om=pair(),rm=pair(),facts=pair(),rights=pair(),gro=pair();
 const policy=makeGriAutomationPolicy({ownerPem:owner.pem,reviewerPem:reviewer.pem,
  ownerMachinePem:om.pem,reviewMachinePem:rm.pem,now});
 const envelope={schema:ENVELOPE,policy,approvals:[
  signGriAutomationConsent(policy,ROLES[0],owner.privateKey),
  signGriAutomationConsent(policy,ROLES[1],reviewer.privateKey)]};
 const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
  GEOMACRO_GRI_STANDING_OWNER_ADMISSION:"VERIFIED_INPUTS_ONLY",
  GEOMACRO_GRI_AUTO_ENROLLED:"YES_CONSENT_ONLY",GEOMACRO_GRI_AUTO_REVOKED:"NO",
  GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64:Buffer.from(JSON.stringify(envelope)).toString("base64"),
  GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_PEM:owner.pem,GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_SHA256:owner.pin,
  GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM:reviewer.pem,GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256:reviewer.pin,
  GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM:om.pem,GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM:rm.pem,
  GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64:om.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:facts.pin,GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:rights.pin,
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:gro.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  GRI_READY_REVIEWED_SHA256:"a".repeat(64),GRI_READY_CERTIFICATES_SHA256:"b".repeat(64),
  GRI_READY_APPROVED_AT:now.toISOString()};
 return {env,envelope};
}
test("existing real two-person scope authorizes conditional owner admission, never per-batch human review",()=>{
 const {env}=fixture(),r=verifyStandingGriOwnerPublicationPolicy({env,now});
 assert.equal(r.two_genuine_policy_signatures_verified,true);
 assert.equal(r.owner_human_per_batch_review_attested,false);
 for(const k of ["independent_reviewer_signature_verified","source_rights_granted",
  "canonical_scoring_verified","b2_readback_verified","d1_promotion_verified",
  "signed_gri_published","real_payments_authorized"])assert.equal(r[k],false);
 assert.equal(r.b2_requests+r.d1_writes+r.payments,0);
 assert.equal(JSON.stringify(r).includes("a".repeat(64)),false);
 const gate=checkCurrentOwnerSignedReady({env,now,allowEmpty:true});
 assert.equal(gate.approved,true);
 assert.equal(gate.approval_mode,"STANDING_OWNER_POLICY_CONDITIONAL");
 assert.equal(gate.independent_review_and_country_certificates_still_required,true);
 assert.equal(gate.owner_human_per_batch_review_attested,false);
 assert.equal(gate.owner_machine_exact_input_authorization_verified,true);
});
test("standing consent alone, stale hint, identical input pins never dispatch the publisher",()=>{
 const {env}=fixture();
 for(const patch of [{GRI_READY_REVIEWED_SHA256:""},{GRI_READY_CERTIFICATES_SHA256:""},
  {GRI_READY_APPROVED_AT:""},{GRI_READY_APPROVED_AT:new Date(now.getTime()-28*60_000).toISOString()}])
  assert.equal(checkCurrentOwnerSignedReady({env:{...env,...patch},now,allowEmpty:true}).approved,false);
 assert.throws(()=>checkCurrentOwnerSignedReady({env:{...env,
  GRI_READY_CERTIFICATES_SHA256:env.GRI_READY_REVIEWED_SHA256},now,allowEmpty:true}));
 const canonical={...env,GRI_READY_REVIEWED_SHA256:"",GRI_READY_CERTIFICATES_SHA256:"",
  REVIEWED_B2_SHA256:env.GRI_READY_REVIEWED_SHA256,REVIEWED_CERTIFICATES_B2_SHA256:env.GRI_READY_CERTIFICATES_SHA256};
 assert.equal(checkCurrentOwnerSignedReady({env:canonical,now}).approved,true);
 assert.throws(()=>checkCurrentOwnerSignedReady({env:{...canonical,REVIEWED_B2_SHA256:""},now}));
});
test("revocation, non-main/PR, incomplete enrollment or reused rights key rejects before any B2",()=>{
 const {env}=fixture();
 for(const patch of [{GEOMACRO_GRI_AUTO_REVOKED:"YES"},{GITHUB_REF:"refs/pull/1/merge"},
  {GITHUB_REPOSITORY:"attacker/geomacro"},{GITHUB_ACTIONS:"false"},
  {GEOMACRO_GRI_STANDING_OWNER_ADMISSION:""},{GEOMACRO_GRI_AUTO_ENROLLED:"NO"},
  {GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256},
  {GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM:env.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM},
  {GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256:"f".repeat(64)},
  {RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:""}])
  assert.throws(()=>verifyStandingGriOwnerPublicationPolicy({env:{...env,...patch},now}));
});
test("forged, replaced or extended policy is not silently reinterpreted as consent",()=>{
 const {env,envelope}=fixture();
 for(const forged of [{...envelope,approvals:[]},
  {...envelope,policy:{...envelope.policy,human_per_batch_review_attested:true}},
  {...envelope,policy:{...envelope.policy,source_rights_granted:true}},
  {...envelope,policy:{...envelope.policy,allowed_outputs:[...envelope.policy.allowed_outputs,"unreviewed_publish"]}}])
  assert.throws(()=>verifyStandingGriOwnerPublicationPolicy({env:{...env,
   GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64:Buffer.from(JSON.stringify(forged)).toString("base64")},now}));
});
test("an explicit invalid human batch signature cannot fall back to standing authorization",()=>{
 const {env}=fixture();
 assert.throws(()=>checkCurrentOwnerSignedReady({env:{...env,
  GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64:"corrupted"},now,allowEmpty:true}));
});
test("only the genuinely enrolled owner machine can authorize an exact input pair",()=>{
 const {env}=fixture(),other=generateKeyPairSync("ed25519").privateKey.export({format:"der",type:"pkcs8"}).toString("base64");
 for(const privateKey of ["",other,"malformed"])
  assert.throws(()=>authorizeStandingGriOwnerInput({env:{...env,
   GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64:privateKey},now,
   reviewedSha:env.GRI_READY_REVIEWED_SHA256,certificatesSha:env.GRI_READY_CERTIFICATES_SHA256}));
 const receipt=authorizeStandingGriOwnerInput({env,now,
  reviewedSha:env.GRI_READY_REVIEWED_SHA256,certificatesSha:env.GRI_READY_CERTIFICATES_SHA256});
 assert.equal(receipt.owner_machine_exact_input_authorization_verified,true);
 assert.equal(receipt.independent_reviewer_signature_verified,false);
 assert.equal(JSON.stringify(receipt).includes(env.GRI_READY_REVIEWED_SHA256),false);
 assert.deepEqual(verifyStandingOwnerMachineIdentity({env,now}),{
  owner_machine_private_identity_verified:true,actual_input_admission_signed:false,human_private_key_used:false});
});
test("explicit private staging can verify genuine public consent without pretending to be protected CI",()=>{
 const {env}=fixture(),local={...env,GITHUB_ACTIONS:"",GITHUB_REF:"",GITHUB_REPOSITORY:""};
 assert.equal(verifyStandingGriOwnerPublicationConsent({env:local,now}).two_genuine_policy_signatures_verified,true);
 assert.throws(()=>verifyStandingGriOwnerPublicationPolicy({env:local,now}));
 const stage=readFileSync(new URL("../ops/stage-approved-reviewed-gri-private-b2.mjs",import.meta.url),"utf8");
 assert.ok(stage.includes("--stage-approved-review-with-standing-owner-no-funds"));
 const client=stage.indexOf("const b2=createB2Client(");
 for(const guard of ["EXPLICIT_BATCH_SIGNATURE_MUST_USE_HUMAN_MODE",
  "const stage=prepareImmutableReviewedGriHandoff(","const checked=computeReviewedCurrentGlobalRisk(",
  "CANONICAL_REVIEWED_NUMERICAL_PREFLIGHT_UNVERIFIED"])
  assert.ok(stage.indexOf(guard)>0&&stage.indexOf(guard)<client);
});
test("hosted queue stops asking owner to sign again but never labels conditional admission as human review",()=>{
 const {env}=fixture();
 const receipt=buildPallabSumanHostedHandoff({env:{...env,
  GEOMACRO_STANDING_OWNER_POLICY_VERIFIED:"true",GEOMACRO_OWNER_GATE_APPROVED:"true",
  GEOMACRO_OWNER_GATE_APPROVAL_MODE:"STANDING_OWNER_POLICY_CONDITIONAL"},now});
 assert.equal(receipt.standing_owner_policy_gate_verified,true);
 assert.equal(receipt.owner_admission_gate_passed,true);
 assert.equal(receipt.genuine_pallab_owner_signature_gate_passed,false);
 assert.equal(receipt.reviewer_signed_input_verified_by_this_report,false);
 assert.equal(receipt.current_signed_3_of_3_verified_by_this_report,false);
 assert.ok(humanHandoffMarkdown(receipt).includes("no repeat owner batch signature"));
 const waiting=buildPallabSumanHostedHandoff({env:{...env,
  GRI_READY_REVIEWED_SHA256:"",GRI_READY_CERTIFICATES_SHA256:"",
  GEOMACRO_STANDING_OWNER_POLICY_VERIFIED:"true"},now});
 assert.equal(waiting.owner_admission_gate_passed,false);
 assert.equal(waiting.standing_owner_policy_gate_verified,true);
 assert.ok(humanHandoffMarkdown(waiting).includes("no repeat owner batch signature"));
 const revoked=buildPallabSumanHostedHandoff({env:{...env,
  GEOMACRO_STANDING_OWNER_POLICY_VERIFIED:"true",GEOMACRO_GRI_AUTO_REVOKED:"YES"},now});
 assert.equal(revoked.standing_owner_policy_gate_verified,false);
});
test("cloud sites receive the enrolled owner-machine key and consent, with independent source checks unchanged",()=>{
 for(const name of ["gri-signed-ready-cadence-backstop.yml","gri-v12-supabase-free-reviewed-current.yml"]){
  const w=readFileSync(new URL("../../.github/workflows/"+name,import.meta.url),"utf8");
  assert.match(w,/GEOMACRO_GRI_STANDING_OWNER_ADMISSION: "VERIFIED_INPUTS_ONLY"/u);
  for(const key of ["GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64","GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM",
   "GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM"])assert.ok(w.includes(key));
  assert.ok(w.includes("GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64"));
  assert.equal(w.includes("GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PRIVATE"),false);
 }
 const publisher=readFileSync(new URL("../lib/supabase-free-gri-v12-current.mjs",import.meta.url),"utf8");
 for(const gate of ["trustedSignature(input","qualifyIndependentSameEvent(","assertHistoricalArchive(",
  "calculateGri(input.events","NO_NEW_ORIGINAL_AFTER_VERIFIED_HISTORICAL_SNAPSHOT"])
  assert.ok(publisher.includes(gate));
});
