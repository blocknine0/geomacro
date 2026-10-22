// Autonomous verification of an ALREADY signed owner approval. Public pins
// verify cryptographic authorship; there is NO automatic human signing,
// no derived-rights waiver and NO replacement for Suman independent review.
import {verifyEncodedOwnerApprovedCandidate} from
 "../ops/verify-pallab-owner-gri-candidate.mjs";
const SHA=/^[a-f0-9]{64}$/u;
export function verifyPallabSignedReadyGate({
  ownerEnvelopeBase64,ownerPublicKeyPem,ownerPublicKeySpkiSha256,
  sumanReviewerSpkiSha256,factsSpkiSha256,rightsSpkiSha256,
  reviewedSha256,certificatesSha256,now=new Date()
}={}){
 if(!SHA.test(reviewedSha256??"")||!SHA.test(certificatesSha256??"")||
    reviewedSha256===certificatesSha256)
  throw Error("PALLAB_HUMAN_READY_EXACT_SIGNED_SHA_REQUIRED");
 const authorityPins=[sumanReviewerSpkiSha256,factsSpkiSha256,rightsSpkiSha256];
 if(!SHA.test(ownerPublicKeySpkiSha256??"")||
    authorityPins.some(v=>!SHA.test(v??""))||
    new Set([ownerPublicKeySpkiSha256,...authorityPins]).size!==4)
  throw Error("PALLAB_HUMAN_READY_DISTINCT_AUTHORITY_PINS_REQUIRED");
 const verified=verifyEncodedOwnerApprovedCandidate({
   envelopeBase64:ownerEnvelopeBase64,
   ownerPublicKeyPem,
   ownerPublicKeySpkiSha256,
   now
 });
 if(verified.signature_cryptographically_verified!==true||
    verified.trust_profile!=="GEOMACRO_OWNER_REVIEWED_NOT_INDEPENDENT_V1"||
    verified.accepted_candidate_sha256!==reviewedSha256||
    verified.accepted_evidence_manifest_sha256!==certificatesSha256)
   throw Error("PALLAB_HUMAN_READY_SIGNED_EXACT_DATA_NOT_MATCHED");
 return Object.freeze({
   schema:"geomacro.pallab-signed-ready-gri-publisher-gate.v1",
   status:"EXACT_HUMAN_OWNER_SIGNED_CURRENT_BATCH_VERIFIED",
   signed_owner_approval_verified:true,
   reviewed_input_sha_matched:true,certificates_sha_matched:true,
   suman_independent_review_verified_by_this_gate:false,
   publisher_must_reverify_suman_and_source_originals:true,
   approval_is_not_newly_generated:true,
   human_presence_automatically_proven:false,
   signed_gri_published:false,
   b2_requests:0,d1_writes:0,usdc_payments:0
 });
}
