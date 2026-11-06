import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createPublicKey,verify} from "node:crypto";
import {
 makeSourceNeutralIssuerAudit,verifySourceNeutralIssuerAudit,
 signConsentedSourceNeutralPolicy,AUDIT_SCHEMA,SIGNED_SCHEMA
} from "./gri-safe-machine-policy-bridge.mjs";
import {
 makeGriAutomationPolicy,signGriAutomationConsent,
 ROLES as HUMAN_ROLES,ENVELOPE
} from "./gri-automation-consent.mjs";
import {canonical,spkiDigest} from "./standing-derived-delegation.mjs";

const now=new Date("2026-11-06T12:00:00.000Z");
function identity(){
 const pair=generateKeyPairSync("ed25519");
 return {pub:pair.publicKey.export({format:"pem",type:"spki"}).toString(),
  privateKey:pair.privateKey,
  privateB64:pair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  spkiB64:pair.publicKey.export({format:"der",type:"spki"}).toString("base64")};
}
function fixture(){
 const owner=identity(),reviewer=identity(),ownerMachine=identity(),
  reviewerMachine=identity(),facts=identity(),rights=identity(),issuer=identity();
 const policy=makeGriAutomationPolicy({
  ownerPem:owner.pub,reviewerPem:reviewer.pub,
  ownerMachinePem:ownerMachine.pub,reviewMachinePem:reviewerMachine.pub,now});
 const envelope={schema:ENVELOPE,policy,approvals:[
  signGriAutomationConsent(policy,HUMAN_ROLES[0],owner.privateKey),
  signGriAutomationConsent(policy,HUMAN_ROLES[1],reviewer.privateKey)]};
 const env={
  GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
  GITHUB_REF:"refs/heads/main",GITHUB_SHA:"a".repeat(40),GITHUB_RUN_ID:"123",
  RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:issuer.privateB64,
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:issuer.spkiB64,
  GEOMACRO_GRI_AUTO_ENROLLED:"YES_CONSENT_ONLY",GEOMACRO_GRI_AUTO_REVOKED:"NO",
  GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64:Buffer.from(JSON.stringify(envelope)).toString("base64"),
  GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_PEM:owner.pub,
  GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_SHA256:spkiDigest(owner.pub),
  GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM:reviewer.pub,
  GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256:spkiDigest(reviewer.pub),
  GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM:ownerMachine.pub,
  GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM:reviewerMachine.pub,
  GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64:ownerMachine.privateB64,
  GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PRIVATE_PKCS8_B64:reviewerMachine.privateB64,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:spkiDigest(facts.pub),
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:spkiDigest(rights.pub)
 };
 const report={schema:"geomacro.all-news-signed-publication-acceptance.v1",
  journal_items:7,unique_items:6,exact_signed_inputs_independently_verified:6,
  all_retained_unique_news_signature_verified:true,
  journal_fingerprint_verified:true,publication_pages_bound_to_same_journal:true,
  commercial_rights_attested:false,paid_delivery_enabled:false,
  legacy_signed_hot_3_of_3_verified:false,payments:0,
  category_original_freshness:{geopolitics:{private_original_url:"owner-only-secret"}},
  original_page_verified_reported:2,current_qualified_news:1,
  current_source_verified_signed_reported:0};
 return {env,report,now,issuer,ownerMachine,reviewerMachine};
}
test("privileged issuer exports only strictly source-neutral, signed coverage",()=>{
 const f=fixture();
 const audit=makeSourceNeutralIssuerAudit(f);
 assert.equal(audit.payload.schema,AUDIT_SCHEMA);
 assert.equal(audit.payload.issuer_verified_derived_items,6);
 assert.equal(audit.payload.independent_reviewer_certified,false);
 assert.equal(audit.payload.public_current_indices_authorized,false);
 assert.ok(!JSON.stringify(audit).includes("owner-only-secret"));
 assert.ok(!JSON.stringify(audit).includes("category_original_freshness"));
 assert.ok(!JSON.stringify(audit).includes("current_source_verified_signed"));
 const read=verifySourceNeutralIssuerAudit({audit,
  issuerPublicSpkiB64:f.issuer.spkiB64,
  expectedSha:f.env.GITHUB_SHA,expectedRunId:f.env.GITHUB_RUN_ID,now});
 assert.equal(read.ok,true);
 assert.equal(read.issuer_verified_derived_items,6);
});
test("two previously consented machine roles sign and independently verify source-neutral policy",()=>{
 const f=fixture(),audit=makeSourceNeutralIssuerAudit(f);
 const signed=signConsentedSourceNeutralPolicy({audit,env:f.env,now});
 assert.equal(signed.status,"CONSENTED_TWO_MACHINE_SOURCE_NEUTRAL_POLICY_SIGNED");
 assert.equal(signed.schema,SIGNED_SCHEMA);
 assert.equal(signed.payload.independently_reviewed_numeric_gri,false);
 assert.equal(signed.payload.country_category_certificates_signed,false);
 assert.equal(signed.payload.current_risk_indices_published,false);
 assert.equal(signed.numerical_gri_authorized_by_this_receipt,false);
 assert.equal(signed.approvals.length,2);
 for(const [i,key] of [f.ownerMachine,f.reviewerMachine].entries()){
  const role=signed.approvals[i].role;
  const message=Buffer.from("GEOMACRO/GriSourceNeutralMachineV1/"+role+"\n"+canonical(signed.payload));
  assert.equal(verify(null,message,createPublicKey(key.pub),
   Buffer.from(signed.approvals[i].signature_base64,"base64")),true);
 }
 const result=JSON.stringify(signed);
 assert.ok(!result.includes(f.env.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64));
 assert.ok(!result.includes(f.env.GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PRIVATE_PKCS8_B64));
});
test("reject forgery, untrusted fields, wrong SHA/run, stale or future issuer clocks",()=>{
 const f=fixture(),a=makeSourceNeutralIssuerAudit(f);
 for(const patch of [
  {audit:{...a,payload:{...a.payload,issuer_verified_derived_items:99}}},
  {audit:{...a,payload:{...a.payload,private_original_source_verdict_transported:true}}},
  {audit:{...a,payload:{...a.payload,original_source_url:"secret"}}},
  {audit:{...a,issuer_signature_base64:"A".repeat(86)+"=="}},
  {audit:{...a,payload_sha256:"f".repeat(64)}},
  {expectedSha:"b".repeat(40)},
  {expectedRunId:"456"},
  {now:new Date(+now+11*60_000)}
 ]){
  assert.throws(()=>verifySourceNeutralIssuerAudit({
   audit:a,issuerPublicSpkiB64:f.issuer.spkiB64,
   expectedSha:f.env.GITHUB_SHA,expectedRunId:f.env.GITHUB_RUN_ID,
   now,...patch
  }),/GRI_SOURCE_NEUTRAL_/);
 }
});
test("revoked consent, forged consent, wrong signer identity and wrong branch fail closed",()=>{
 const f=fixture(),audit=makeSourceNeutralIssuerAudit(f);
 for(const patch of [
  {GEOMACRO_GRI_AUTO_REVOKED:"YES"},
  {GEOMACRO_GRI_AUTO_ENROLLED:""},
  {GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PRIVATE_PKCS8_B64:identity().privateB64},
  {GITHUB_REF:"refs/heads/feature"},
  {GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64:Buffer.from("{}").toString("base64")}
 ])assert.throws(()=>signConsentedSourceNeutralPolicy({audit,
  env:{...f.env,...patch},now}));
 assert.throws(()=>makeSourceNeutralIssuerAudit({
  report:{...f.report,exact_signed_inputs_independently_verified:5},
  env:f.env,now
 }),/GRI_SOURCE_NEUTRAL_PRIVILEGED_ISSUER_VERIFICATION_REQUIRED/);
});
