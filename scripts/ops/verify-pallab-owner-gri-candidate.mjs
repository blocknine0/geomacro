#!/usr/bin/env node
// Protected cloud verifier for a ONE-signature owner-reviewed GRI candidate.
// Not a GRO reviewer signer; no private keys, B2, D1, x402 or publications.
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {assertOwnerApprovalEnvelope} from "../lib/pallab-human-gri-batch-approval.mjs";
const MAX_B64=4096;
export function verifyEncodedOwnerApprovedCandidate({
 envelopeBase64,ownerPublicKeyPem,ownerPublicKeySpkiSha256,
 now=new Date()
}={}){
 if(typeof envelopeBase64!=="string"||envelopeBase64.length<150||
    envelopeBase64.length>MAX_B64||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(envelopeBase64))
  throw Error("OWNER_APPROVAL_ENCODED_ENVELOPE_INVALID");
 const bytes=Buffer.from(envelopeBase64,"base64");
 if(bytes.length<120||bytes.length>3000||
    bytes.toString("base64")!==envelopeBase64)
  throw Error("OWNER_APPROVAL_ENCODED_ENVELOPE_INVALID");
 let envelope;
 try{envelope=JSON.parse(bytes.toString("utf8"));}
 catch{throw Error("OWNER_APPROVAL_JSON_INVALID");}
 const p=envelope?.payload;
 const proof=assertOwnerApprovalEnvelope({
  envelope,approvedOwnerPublicKeyPem:ownerPublicKeyPem,
  approvedOwnerSpkiSha256:ownerPublicKeySpkiSha256,
  expectedCandidateGriSha256:p?.candidate_gri_sha256,
  expectedEvidenceManifestSha256:p?.evidence_manifest_sha256,now
 });
 return Object.freeze({...proof,
  accepted_candidate_sha256:p.candidate_gri_sha256,
  accepted_evidence_manifest_sha256:p.evidence_manifest_sha256,
  actual_candidate_bytes_readback_verified:false,
  actual_evidence_manifest_bytes_verified:false,
  automated_signature_generation:false,
  output_trust_profile_only:"GEOMACRO_OWNER_REVIEWED_NOT_INDEPENDENT_V1",
  existing_independent_gri_publisher_not_called:true
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==2||process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    process.env.GITHUB_EVENT_NAME!=="workflow_dispatch")
   throw Error("OWNER_APPROVAL_PROTECTED_MANUAL_DISPATCH_REQUIRED");
  const verified=verifyEncodedOwnerApprovedCandidate({
   envelopeBase64:process.env.GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64,
   ownerPublicKeyPem:process.env.GEOMACRO_OWNER_PUBLIC_KEY_PEM,
   ownerPublicKeySpkiSha256:process.env.GEOMACRO_OWNER_PUBLIC_KEY_SHA256
  });
  // Only bounded safe statuses. Never log signed signature, name identity
  // proof, private key, full input SHA or original article.
  process.stdout.write(JSON.stringify({
   schema:verified.schema,status:verified.status,
   trust_profile:verified.trust_profile,
   signature_cryptographically_verified:verified.signature_cryptographically_verified,
   independently_reviewed_gri_verified:false,
   actual_candidate_bytes_readback_verified:false,
   published_gri:false,commercial_x402_authorized:false,
   requests_or_payments:0
  })+"\n");
 }catch{console.error("OWNER_HUMAN_APPROVAL_REJECTED_NO_PUBLICATION");process.exitCode=2;}
}
