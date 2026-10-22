// Two REAL persons, two distinct public keys, exact private bytes, and the
// original independently reviewed GRI v1.2 contract. Pallab signs one
// SHA-bound owner authorization; Suman signs GRI plus each actual certificate.
// No independent signature is synthesized or inferred from the owner's note.
import {createHash,createPublicKey} from "node:crypto";
import {assertOwnerApprovalEnvelope} from "./pallab-human-gri-batch-approval.mjs";
import {verifyThreeDomainReviewerHandoff} from "./three-domain-reviewed-handoff.mjs";
const HEX=/^[a-f0-9]{64}$/u;
const MAX={owner:8_192,gri:1_048_576,certs:524_288};
const fail=s=>{throw Error("PALLAB_SUMAN_HANDOFF_"+s)};
function exactBytes(value,max){
 if(!Buffer.isBuffer(value)||value.length<25||value.length>max)
  fail("BOUNDED_PRIVATE_INPUT_REQUIRED");
 return value;
}
const digest=x=>createHash("sha256").update(x).digest("hex");
function pubKey(pem,pin){
 if(typeof pem!=="string"||!HEX.test(pin??""))fail("PINNED_PUBLIC_KEY_REQUIRED");
 let key;
 try{key=createPublicKey(pem);}catch{fail("ED25519_PUBLIC_KEY_INVALID");}
 if(key.asymmetricKeyType!=="ed25519")fail("ED25519_PUBLIC_KEY_INVALID");
 const der=key.export({format:"der",type:"spki"});
 if(digest(der)!==pin)fail("PUBLIC_KEY_PIN_MISMATCH");
 return pin;
}
function safeJson(bytes,max){
 const b=exactBytes(bytes,max);
 try{return JSON.parse(b.toString("utf8"));}
 catch{fail("PRIVATE_SIGNED_JSON_INVALID");}
}
/** @returns safe metadata only. No raw GRI, article, hash or signer key is output. */
export function validatePallabSumanPrivateHandoff({
 ownerApprovalBytes,reviewedGriBytes,countryCertificateBytes,
 intelligence,historicalB2Bytes,
 ownerPublicKeyPem,ownerPublicKeySpkiSha256,
 reviewerPublicKeyPem,reviewerPublicKeySpkiSha256,
 groSignerPublicSpkiSha256,otherAuthoritySpkiSha256=[],
 now=new Date()
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  fail("INVALID_CLOCK");
 const owner=pubKey(ownerPublicKeyPem,ownerPublicKeySpkiSha256);
 const reviewer=pubKey(reviewerPublicKeyPem,reviewerPublicKeySpkiSha256);
 if(owner===reviewer||!HEX.test(groSignerPublicSpkiSha256??"")||
    owner===groSignerPublicSpkiSha256||reviewer===groSignerPublicSpkiSha256||
    !Array.isArray(otherAuthoritySpkiSha256)||
    otherAuthoritySpkiSha256.some(x=>!HEX.test(x)||x===owner||x===reviewer))
  fail("OWNER_REVIEWER_AND_OTHER_AUTHORITIES_NOT_INDEPENDENT");
 const approval=safeJson(ownerApprovalBytes,MAX.owner);
 const gri=safeJson(reviewedGriBytes,MAX.gri);
 const certs=safeJson(countryCertificateBytes,MAX.certs);
 const ownerVerified=assertOwnerApprovalEnvelope({
  envelope:approval,
  approvedOwnerPublicKeyPem:ownerPublicKeyPem,
  approvedOwnerSpkiSha256:owner,
  expectedCandidateGriSha256:digest(reviewedGriBytes),
  expectedEvidenceManifestSha256:digest(countryCertificateBytes),
  otherAuthoritySpkiSha256:[reviewer,groSignerPublicSpkiSha256,...otherAuthoritySpkiSha256],
  now
 });
 // Strict existing production reviewer, country-cell, two-origin evidence,
 // commercial rights, score, publishedAt, history gzip SHA and time checks.
 // No simulated values are permitted here.
 const strict=verifyThreeDomainReviewerHandoff({
  intelligence,reviewedGri:gri,countryCategoryCertificates:certs,
  historicalB2Bytes,trustedReviewerPublicKeyPem:reviewerPublicKeyPem,now
 });
 if(strict.receipt.independently_reviewer_signed!==true||
    strict.receipt.historical_b2_bytes_verified!==true||
    strict.receipt.current_three_domain_originals_verified!==true)
   fail("CANONICAL_INDEPENDENT_REVIEW_NOT_ACCEPTED");
 return Object.freeze({
  schema:"geomacro.pallab-suman-independent-reviewed-handoff.v1",
  human_owner_name:"Pallab Das",independent_reviewer_name:"Suman Dey",
  owner_exact_signed_batch_verified:ownerVerified.signature_cryptographically_verified,
  reviewer_exact_gri_and_country_certificates_verified:true,
  distinct_signing_public_keys_verified:true,
  immutable_historical_b2_lineage_verified:true,
  canonical_three_domain_review_verified:true,
  owner_claimed_physical_identity_independently_proven:false,
  reviewer_claimed_physical_identity_independently_proven:false,
  actual_b2_publication_performed:false,actual_d1_promotion_performed:false,
  public_deep_health_200_verified:false,
  ready_for_existing_approved_no_funds_staging:true,
  final_customer_publish_accepted:false,
  real_money_authorized:false,payments:0,
  supabase_requests:0,b2_requests:0,d1_writes:0
 });
}
