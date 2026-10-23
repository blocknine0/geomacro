import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createPublicKey,verify as cryptoVerify} from "node:crypto";
import {makeGriAutomationPolicy,signGriAutomationConsent,ROLES as HUMAN,ENVELOPE}
 from "../lib/gri-automation-consent.mjs";
import {spkiDigest,canonical} from "../lib/standing-derived-delegation.mjs";
import {issueAutomatedPolicyDerivedReview,qualifyDerivedNewsAuditForPolicy,ROLES}
 from "../lib/gri-automated-derived-policy-review.mjs";

const key=()=>{
 const pair=generateKeyPairSync("ed25519");
 return {pub:pair.publicKey.export({format:"pem",type:"spki"}).toString(),
 privateB64:pair.privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
 privateKey:pair.privateKey,
 spkiB64:pair.publicKey.export({format:"der",type:"spki"}).toString("base64")};
};
const now=new Date("2026-10-23T12:00:00.000Z");
function fixture(){
 const owner=key(),suman=key(),autoOwner=key(),autoSuman=key(),facts=key(),rights=key(),gro=key();
 const policy=makeGriAutomationPolicy({ownerPem:owner.pub,reviewerPem:suman.pub,
  ownerMachinePem:autoOwner.pub,reviewMachinePem:autoSuman.pub,now});
 const envelope={schema:ENVELOPE,policy,approvals:[
   signGriAutomationConsent(policy,HUMAN[0],owner.privateKey),
   signGriAutomationConsent(policy,HUMAN[1],suman.privateKey)]};
 const env={
  GITHUB_ACTIONS:"true",GITHUB_REF:"refs/heads/main",
  GITHUB_REPOSITORY:"blocknine0/geomacro",
  GEOMACRO_GRI_AUTO_ENROLLED:"YES_CONSENT_ONLY",
  GEOMACRO_GRI_AUTO_REVOKED:"NO",
  GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64:Buffer.from(JSON.stringify(envelope)).toString("base64"),
  GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_PEM:owner.pub,
  GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_SHA256:spkiDigest(owner.pub),
  GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM:suman.pub,
  GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256:spkiDigest(suman.pub),
  GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM:autoOwner.pub,
  GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM:autoSuman.pub,
  GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64:autoOwner.privateB64,
  GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PRIVATE_PKCS8_B64:autoSuman.privateB64,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:spkiDigest(facts.pub),
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:spkiDigest(rights.pub),
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:gro.spkiB64
 };
 const audit={
  schema:"geomacro.all-news-signed-publication-acceptance.v1",
  journal_items:7,unique_items:7,exact_signed_inputs_independently_verified:7,
  all_retained_unique_news_signature_verified:true,
  original_page_verified_reported:3,current_qualified_news:2,
  current_source_verified_signed_reported:2,
  all_current_qualified_news_source_verified_signed:true,
  legacy_signed_hot_3_of_3_verified:false,
  commercial_rights_attested:false,paid_delivery_enabled:false,payments:0,
 };
 return {env,audit,autoOwner,autoSuman,now};
}
test("once both HUMAN consents are real, same already-verified derived audit can receive two distinct automated machine signatures without human reapproval",()=>{
 const f=fixture();
 const signed=issueAutomatedPolicyDerivedReview(f);
 assert.equal(signed.status,"AUTOMATED_POLICY_DERIVED_AUDIT_SIGNED_NOT_CURRENT_GRI");
 assert.deepEqual(signed.approvals.map(x=>x.role),ROLES);
 assert.equal(signed.one_time_human_policy_consent_cryptographically_verified,true);
 assert.equal(signed.distinct_automated_machine_signers_verified,true);
 assert.equal(signed.source_rights_granted,false);
 assert.equal(signed.reviewed_gri_signed,false);
 assert.equal(signed.legacy_signed_hot_products_verified,false);
 assert.equal(signed.paid_delivery_authorized,false);
 for(const [i,k] of [f.autoOwner,f.autoSuman].entries()){
   const bytes=Buffer.from("GEOMACRO/GriAutomatedDerivedReviewV1\\n"+ROLES[i]+
     "\\n"+canonical(signed.payload));
   assert.ok(cryptoVerify(null,bytes,createPublicKey(k.pub),
     Buffer.from(signed.approvals[i].signature_base64,"base64")));
 }
 const str=JSON.stringify(signed);
 assert.ok(!str.includes(f.env.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64));
 assert.ok(!str.includes(f.env.GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PRIVATE_PKCS8_B64));
});
test("missing genuine current original -> skip rather than sign unverified news",()=>{
 const f=fixture(),a={...f.audit,
  original_page_verified_reported:0,current_source_verified_signed_reported:0,
  all_current_qualified_news_source_verified_signed:false};
 const r=issueAutomatedPolicyDerivedReview({...f,audit:a});
 assert.equal(r.status,"SKIPPED_NO_VERIFIED_CURRENT_ORIGINAL");
 assert.equal(r.reviewed_gri_signed,false);
 assert.equal(r.paid_delivery_authorized,false);
 assert.ok(!r.approvals);
});
test("false signer identities, forged Suman/owner consent, scope changes and revocation fail closed",()=>{
 for(const patch of [
 {GEOMACRO_GRI_AUTO_REVOKED:"YES"},
 {GEOMACRO_GRI_AUTO_ENROLLED:""},
 {GEOMACRO_GRI_AUTO_OWNER_MACHINE_PRIVATE_PKCS8_B64:key().privateB64},
 {GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PRIVATE_PKCS8_B64:key().privateB64},
 {GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:"bad"},
 {GITHUB_REF:"refs/heads/pr"}
 ]){
  const f=fixture();
  assert.throws(()=>issueAutomatedPolicyDerivedReview({...f,env:{...f.env,...patch}}));
 }
 const f=fixture();
 const e=JSON.parse(Buffer.from(f.env.GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64,"base64"));
 e.policy.source_rights_granted=true;
 assert.throws(()=>issueAutomatedPolicyDerivedReview({...f,env:{
  ...f.env,GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64:Buffer.from(JSON.stringify(e)).toString("base64")
 }}));
});
test("derived-only audit is NOT commercial original-source qualification or GRI scoring",()=>{
 const f=fixture();
 for(const patch of [
  {commercial_rights_attested:true},{paid_delivery_enabled:true},
  {legacy_signed_hot_3_of_3_verified:true},{payments:1},
  {exact_signed_inputs_independently_verified:2},
  {all_retained_unique_news_signature_verified:false},
  {original_page_verified_reported:1},
  {current_source_verified_signed_reported:3},
 ]){
  assert.throws(()=>qualifyDerivedNewsAuditForPolicy({...f.audit,...patch}));
 }
});
test("no secrets, B2, D1, x402 or independent reviewer claim in machine-scoped audit",()=>{
 const f=fixture(),r=issueAutomatedPolicyDerivedReview(f);
 assert.equal(r.payload.human_per_batch_review_attested,false);
 assert.equal(r.payload.external_independent_human_review_attested,false);
 assert.equal(r.payload.certified_numeric_gri_v12,false);
 assert.equal(r.payload.country_category_certificates_issued,false);
 assert.equal(r.b2_requests,0);assert.equal(r.d1_writes,0);
 assert.equal(r.payments,0);assert.equal(r.supabase_requests,0);
 assert.match(JSON.stringify(r),/DERIVED_SIGNED_NEWS_RESEARCH_AUDIT_ONLY/);
});
