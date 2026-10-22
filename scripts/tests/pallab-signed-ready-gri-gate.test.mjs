import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash} from "node:crypto";
import {signOwnerReviewedCandidate} from "../ops/sign-pallab-owner-gri-candidate.mjs";
import {verifyPallabSignedReadyGate} from "../lib/pallab-signed-ready-gri-gate.mjs";
import {checkCurrentOwnerSignedReady} from "../ops/require-pallab-owner-signed-gri-ready.mjs";
const now=new Date("2026-10-23T00:00:00.000Z");
const keys=()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 return {privateKey,pem:publicKey.export({format:"pem",type:"spki"}).toString(),
 pin:createHash("sha256").update(publicKey.export({format:"der",type:"spki"}))
   .digest("hex")};
};
const setup=()=>{
 const owner=keys(),suman=keys(),facts=keys(),rights=keys();
 const reviewed="a".repeat(64),certificates="b".repeat(64);
 const signed=signOwnerReviewedCandidate({
  privateKey:owner.privateKey,publicKeyPem:owner.pem,
  publicKeySpkiSha256:owner.pin,candidateSha256:reviewed,
  evidenceSha256:certificates,nonceHex:"c".repeat(32),now
 });
 return {owner,suman,facts,rights,reviewed,certificates,
  envelope:Buffer.from(JSON.stringify(signed)).toString("base64")};
};
const args=x=>({
 ownerEnvelopeBase64:x.envelope,ownerPublicKeyPem:x.owner.pem,
 ownerPublicKeySpkiSha256:x.owner.pin,
 sumanReviewerSpkiSha256:x.suman.pin,
 factsSpkiSha256:x.facts.pin,rightsSpkiSha256:x.rights.pin,
 reviewedSha256:x.reviewed,certificatesSha256:x.certificates,now
});
test("Pallab one genuine signature unlocks only signed input preflight, not independent review",()=>{
 const x=setup(),out=verifyPallabSignedReadyGate(args(x));
 assert.equal(out.signed_owner_approval_verified,true);
 assert.equal(out.reviewed_input_sha_matched,true);
 assert.equal(out.certificates_sha_matched,true);
 assert.equal(out.suman_independent_review_verified_by_this_gate,false);
 assert.equal(out.publisher_must_reverify_suman_and_source_originals,true);
 assert.equal(out.signed_gri_published,false);
 assert.equal(out.b2_requests,0);
 assert.equal(out.usdc_payments,0);
});
test("swap SHA, replace payload, wrong signer, reused key and missing key all reject before B2",()=>{
 const x=setup(),y=keys();
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   certificatesSha256:"e".repeat(64)}),/SIGNED_EXACT_DATA_NOT_MATCHED/);
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   reviewedSha256:"e".repeat(64)}),/SIGNED_EXACT_DATA_NOT_MATCHED/);
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   ownerPublicKeyPem:y.pem,ownerPublicKeySpkiSha256:y.pin}),
   /HUMAN_SIGNATURE_INVALID/);
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   sumanReviewerSpkiSha256:x.owner.pin}),/DISTINCT_AUTHORITY/);
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   factsSpkiSha256:""}),/DISTINCT_AUTHORITY/);
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   reviewedSha256:x.certificates}),/EXACT_SIGNED_SHA_REQUIRED/);
});
test("expired signature, future signature and no human envelope fail closed",()=>{
 const x=setup();
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   now:new Date(now.getTime()+91*60_000)}),/STALE_OR_FUTURE/);
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   now:new Date(now.getTime()-120_000)}),/STALE_OR_FUTURE/);
 assert.throws(()=>verifyPallabSignedReadyGate({...args(x),
   ownerEnvelopeBase64:""}),/ENCODED_ENVELOPE_INVALID/);
});
test("scheduler without real approval quietly skips; protected publisher always requires one",()=>{
 const x=setup();
 const env={
  GRI_READY_REVIEWED_SHA256:x.reviewed,
  GRI_READY_CERTIFICATES_SHA256:x.certificates,
  GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_PEM:x.owner.pem,
  GEOMACRO_OWNER_HUMAN_PUBLIC_KEY_SHA256:x.owner.pin,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:x.suman.pin,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:x.facts.pin,
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:x.rights.pin
 };
 assert.deepEqual(checkCurrentOwnerSignedReady({env,now,allowEmpty:true}),
  {status:"AWAITING_REAL_HUMAN_SIGNED_INPUT",approved:false});
 assert.throws(()=>checkCurrentOwnerSignedReady({env,now,allowEmpty:false}),
  /ENCODED_ENVELOPE_INVALID/);
 const accepted=checkCurrentOwnerSignedReady({
  env:{...env,GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64:x.envelope},
  now,allowEmpty:true
 });
 assert.equal(accepted.approved,true);
 assert.equal(accepted.status,"EXACT_HUMAN_OWNER_SIGNED_CURRENT_BATCH_VERIFIED");
 const canonical=checkCurrentOwnerSignedReady({
  env:{
   ...env,GRI_READY_REVIEWED_SHA256:"",
   GRI_READY_CERTIFICATES_SHA256:"",
   REVIEWED_B2_SHA256:x.reviewed,
   REVIEWED_CERTIFICATES_B2_SHA256:x.certificates,
   GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64:x.envelope
  },now,allowEmpty:false
 });
 assert.equal(canonical.approved,true);
});
