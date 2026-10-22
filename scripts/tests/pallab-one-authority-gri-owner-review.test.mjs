import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash} from "node:crypto";
import {signOwnerReviewedCandidate} from "../ops/sign-pallab-owner-gri-candidate.mjs";
import {verifyEncodedOwnerApprovedCandidate} from "../ops/verify-pallab-owner-gri-candidate.mjs";
import {assertOwnerApprovalEnvelope} from "../lib/pallab-human-gri-batch-approval.mjs";
const now=new Date("2026-10-22T12:00:00.000Z");
const makeKey=()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const der=publicKey.export({format:"der",type:"spki"});
 return {privateKey,publicKeyPem:publicKey.export({format:"pem",type:"spki"}).toString(),
  pin:createHash("sha256").update(der).digest("hex")};
};
const a="a".repeat(64),b="b".repeat(64),nonce="1".repeat(32);
const sign=(key=makeKey())=>({key,envelope:signOwnerReviewedCandidate({
 privateKey:key.privateKey,publicKeyPem:key.publicKeyPem,
 publicKeySpkiSha256:key.pin,candidateSha256:a,evidenceSha256:b,
 now,nonceHex:nonce
})});
const check=({key,envelope},time=now)=>verifyEncodedOwnerApprovedCandidate({
 envelopeBase64:Buffer.from(JSON.stringify(envelope),"utf8").toString("base64"),
 ownerPublicKeyPem:key.publicKeyPem,ownerPublicKeySpkiSha256:key.pin,now:time
});
test("ONE Pallab Das human key signs two immutable hashes, NOT two authorities",()=>{
 const case1=sign(),r=check(case1);
 assert.equal(r.schema,"geomacro.owner-reviewed-gri-candidate-verification.v1");
 assert.equal(r.signature_cryptographically_verified,true);
 assert.equal(r.trust_profile,"GEOMACRO_OWNER_REVIEWED_NOT_INDEPENDENT_V1");
 assert.equal(r.approver,"Pallab Das");
 assert.equal(r.existing_independently_reviewed_gri_contract_satisfied,false);
 assert.equal(r.independent_gri_reviewer_approval_verified,false);
 assert.equal(r.publisher_dispatch_authorized,false);
 assert.equal(r.actual_candidate_bytes_readback_verified,false);
 assert.equal(r.automated_signature_generation,false);
 assert.equal(r.paid_delivery_eligible,false);
 assert.equal(r.b2_requests,0);
 assert.equal(r.payments,0);
});
test("no public key, incorrect pin, wrong signer, tampered hash and evidence denied",()=>{
 const v=sign(),other=makeKey();
 assert.throws(()=>verifyEncodedOwnerApprovedCandidate({
  envelopeBase64:Buffer.from(JSON.stringify(v.envelope)).toString("base64"),
  ownerPublicKeyPem:other.publicKeyPem,ownerPublicKeySpkiSha256:other.pin,now
 }),/HUMAN_SIGNATURE_INVALID/);
 assert.throws(()=>verifyEncodedOwnerApprovedCandidate({
  envelopeBase64:Buffer.from(JSON.stringify(v.envelope)).toString("base64"),
  ownerPublicKeyPem:v.key.publicKeyPem,ownerPublicKeySpkiSha256:other.pin,now
 }),/OWNER_KEY_PIN_MISMATCH/);
 const edit=structuredClone(v.envelope);
 edit.payload.evidence_manifest_sha256="c".repeat(64);
 assert.throws(()=>check({key:v.key,envelope:edit}),/HUMAN_SIGNATURE_INVALID/);
 assert.throws(()=>assertOwnerApprovalEnvelope({
  envelope:v.envelope,approvedOwnerPublicKeyPem:v.key.publicKeyPem,
  approvedOwnerSpkiSha256:v.key.pin,expectedCandidateGriSha256:a,
  expectedEvidenceManifestSha256:"c".repeat(64),now
 }),/EXACT_SIGNED_INPUT_SHA_MISMATCH/);
});
test("independent GRI label, extra payload flags and wrong human name are invalid",()=>{
 const v=sign();
 for(const change of [
   p=>p.decision="APPROVE_EXACT_INPUT_FOR_INDEPENDENT_REVIEW",
   p=>p.human_approver="Another Person",
   p=>p.paid_delivery_eligible=true,
   p=>p.schema="geomacro.gri-v12-reviewed-current-input.v1",
 ]){
  const o=structuredClone(v.envelope);change(o.payload);
  assert.throws(()=>check({key:v.key,envelope:o}),/OWNER_HUMAN_APPROVAL_INPUT_SCOPE_INVALID/);
 }
 const extra=structuredClone(v.envelope);
 extra.independent_reviewer_signed=true;
 assert.throws(()=>check({key:v.key,envelope:extra}),/SIGNED_ENVELOPE_INVALID/);
});
test("signature expires in 90 minutes and future/expired clocks fail closed",()=>{
 const v=sign();
 assert.equal(check(v,new Date(now.getTime()+45*60_000)).signature_cryptographically_verified,true);
 assert.throws(()=>check(v,new Date(now.getTime()+91*60_000)),/STALE_OR_FUTURE/);
 assert.throws(()=>check(v,new Date(now.getTime()-120_000)),/STALE_OR_FUTURE/);
});
test("no signature, same candidate/evidence hashes, reused signer authority and bad Ed25519 denied",()=>{
 const v=sign();
 const invalid=structuredClone(v.envelope);invalid.signature_base64="";
 assert.throws(()=>check({key:v.key,envelope:invalid}),/SIGNED_ENVELOPE_INVALID/);
 assert.throws(()=>signOwnerReviewedCandidate({
   privateKey:v.key.privateKey,publicKeyPem:v.key.publicKeyPem,
   publicKeySpkiSha256:v.key.pin,candidateSha256:a,evidenceSha256:a,now,nonceHex:nonce
 }),/INPUT_SCOPE_INVALID/);
 assert.throws(()=>assertOwnerApprovalEnvelope({
   envelope:v.envelope,approvedOwnerPublicKeyPem:v.key.publicKeyPem,
   approvedOwnerSpkiSha256:v.key.pin,expectedCandidateGriSha256:a,
   expectedEvidenceManifestSha256:b,otherAuthoritySpkiSha256:[v.key.pin],now
 }),/OWNER_KEY_REUSED_OR_AUTHORITY_SCOPE_INVALID/);
});
test("no bypass via base64 whitespace or oversize payload",()=>{
 const v=sign(),encoded=Buffer.from(JSON.stringify(v.envelope)).toString("base64");
 assert.throws(()=>verifyEncodedOwnerApprovedCandidate({
  envelopeBase64:" "+encoded,ownerPublicKeyPem:v.key.publicKeyPem,
  ownerPublicKeySpkiSha256:v.key.pin,now
 }),/ENCODED_ENVELOPE_INVALID/);
 assert.throws(()=>verifyEncodedOwnerApprovedCandidate({
  envelopeBase64:encoded.repeat(20),ownerPublicKeyPem:v.key.publicKeyPem,
  ownerPublicKeySpkiSha256:v.key.pin,now
 }),/ENCODED_ENVELOPE_INVALID/);
});

test("same-laptop password-encrypted owner key requires the correct private passphrase",()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const encrypted=privateKey.export({
  format:"pem",type:"pkcs8",cipher:"aes-256-cbc",
  passphrase:"owner-isolated-key-passphrase-test"
 });
 const pem=publicKey.export({format:"pem",type:"spki"}).toString();
 const pin=createHash("sha256").update(publicKey.export({
  format:"der",type:"spki"})).digest("hex");
 const params={
  privateKey:encrypted,publicKeyPem:pem,publicKeySpkiSha256:pin,
  candidateSha256:a,evidenceSha256:b,now,nonceHex:nonce
 };
 assert.throws(()=>signOwnerReviewedCandidate(params),/OWNER_PRIVATE_KEY_UNUSABLE/);
 assert.throws(()=>signOwnerReviewedCandidate({...params,
  privateKeyPassphrase:"incorrect-password"}),/OWNER_PRIVATE_KEY_UNUSABLE/);
 const owner=signOwnerReviewedCandidate({...params,
  privateKeyPassphrase:"owner-isolated-key-passphrase-test"});
 assert.equal(owner.payload.human_approver,"Pallab Das");
 assert.equal(owner.signature_base64.length,88);
});
