// ONE Geomacro owner-human authority (Pallab Das) for a distinct OWNER-REVIEWED
// factual/scoring-candidate trust profile. No second approval signature.
// This owner is NOT an externally independent GRI v1.2 reviewer. The existing
// independently reviewed GRI publisher stays unchanged and fail-closed.
import {createHash,createPublicKey,verify as verifyEd25519} from "node:crypto";
export const OWNER_APPROVAL_SCHEMA="geomacro.owner-reviewed-gri-candidate-approval.v1";
export const OWNER_APPROVER="Pallab Das";
const SHA=/^[a-f0-9]{64}$/u,NONCE=/^[a-f0-9]{32}$/u;
const SIG=/^[A-Za-z0-9+/]{86}==$/u;
const MAX_AGE_MS=90*60_000;
const FAIL="OWNER_HUMAN_APPROVAL_";
const payloadKeys=["schema","human_approver","decision","candidate_gri_sha256",
 "evidence_manifest_sha256","approved_at","expires_at","nonce_hex"];
function fail(code){throw Error(FAIL+code);}
export function ownerApprovalCanonicalPayload(payload){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
    Object.keys(payload).length!==payloadKeys.length||
    payloadKeys.some(k=>!Object.hasOwn(payload,k))||
    payload.schema!==OWNER_APPROVAL_SCHEMA||
    payload.human_approver!==OWNER_APPROVER||
    payload.decision!=="OWNER_APPROVES_EXACT_DERIVED_GRI_CANDIDATE"||
    !SHA.test(payload.candidate_gri_sha256)||
    !SHA.test(payload.evidence_manifest_sha256)||
    payload.candidate_gri_sha256===payload.evidence_manifest_sha256||
    !NONCE.test(payload.nonce_hex)||
    typeof payload.approved_at!=="string"||
    typeof payload.expires_at!=="string"||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(payload.approved_at)||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(payload.expires_at))
    fail("INPUT_SCOPE_INVALID");
 const canonical=Object.fromEntries(payloadKeys.map(k=>[k,payload[k]]));
 return Buffer.from(JSON.stringify(canonical),"utf8");
}
export function assertOwnerApprovalEnvelope({
 envelope,approvedOwnerPublicKeyPem,approvedOwnerSpkiSha256,
 expectedCandidateGriSha256,expectedEvidenceManifestSha256,
 otherAuthoritySpkiSha256=[],now=new Date()
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))fail("CLOCK_INVALID");
 if(!envelope||typeof envelope!=="object"||Array.isArray(envelope)||
    Object.keys(envelope).length!==2||!Object.hasOwn(envelope,"payload")||
    !Object.hasOwn(envelope,"signature_base64")||
    typeof envelope.signature_base64!=="string"||!SIG.test(envelope.signature_base64))
    fail("SIGNED_ENVELOPE_INVALID");
 const signedBytes=ownerApprovalCanonicalPayload(envelope.payload);
 const p=envelope.payload,issued=Date.parse(p.approved_at),expires=Date.parse(p.expires_at);
 if(!Number.isFinite(issued)||!Number.isFinite(expires)||
    issued>now.getTime()+60_000||
    now.getTime()-issued>MAX_AGE_MS||
    expires<=now.getTime()||expires<=issued||
    expires-issued>MAX_AGE_MS)
    fail("HUMAN_APPROVAL_STALE_OR_FUTURE");
 if(!SHA.test(expectedCandidateGriSha256??"")||
    !SHA.test(expectedEvidenceManifestSha256??"")||
    p.candidate_gri_sha256!==expectedCandidateGriSha256||
    p.evidence_manifest_sha256!==expectedEvidenceManifestSha256)
    fail("EXACT_SIGNED_INPUT_SHA_MISMATCH");
 if(!SHA.test(approvedOwnerSpkiSha256??"")||
    typeof approvedOwnerPublicKeyPem!=="string")
    fail("APPROVED_HUMAN_OWNER_PIN_MISSING");
 let key,der;
 try{
  key=createPublicKey(approvedOwnerPublicKeyPem);
  if(key.asymmetricKeyType!=="ed25519")fail("ED25519_REQUIRED");
  der=Buffer.from(key.export({format:"der",type:"spki"}));
 }catch{fail("OWNER_PUBLIC_KEY_INVALID");}
 const h=createHash("sha256").update(der).digest("hex");
 if(h!==approvedOwnerSpkiSha256)fail("OWNER_KEY_PIN_MISMATCH");
 if(!Array.isArray(otherAuthoritySpkiSha256)||
    otherAuthoritySpkiSha256.some(x=>!SHA.test(x))||
    otherAuthoritySpkiSha256.includes(h))
    fail("OWNER_KEY_REUSED_OR_AUTHORITY_SCOPE_INVALID");
 const sig=Buffer.from(envelope.signature_base64,"base64");
 if(sig.length!==64||!verifyEd25519(null,signedBytes,key,sig))
    fail("HUMAN_SIGNATURE_INVALID");
 return Object.freeze({
  schema:"geomacro.owner-reviewed-gri-candidate-verification.v1",
  status:"OWNER_REVIEWED_CANDIDATE_APPROVAL_VERIFIED_ONLY",
  trust_profile:"GEOMACRO_OWNER_REVIEWED_NOT_INDEPENDENT_V1",
  approver:OWNER_APPROVER,
  exact_candidate_gri_sha256_verified:true,
  exact_evidence_manifest_sha256_verified:true,
  signature_cryptographically_verified:true,
  human_physical_presence_automatically_verified:false,
  independent_gri_reviewer_approval_verified:false,
  existing_independently_reviewed_gri_contract_satisfied:false,
  facts_signature_verified:false,rights_signature_verified:false,
  certified_country_category_events_verified:false,
  legal_derived_use_rights_verified:false,
  current_signed_gri_published:false,
  publisher_dispatch_authorized:false,
  paid_delivery_eligible:false,deep_health_200_verified:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,payments:0
 });
}
