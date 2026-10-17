import {createHash,createPrivateKey,createPublicKey,sign,verify,timingSafeEqual} from "node:crypto";
import {verifyGeomacroTwoOriginalMachineBinding} from "./geomacro-machine-original-binding.mjs";

// OFFLINE issuer only: never import this from a public API, cron publisher, or
// a CI production signing job. The two issuer custodians independently review
// actual facts and legal documents before they authorize using their own PEM.
// This checks actual original HTML bytes and permission-document pins, not
// whether a licence is legally sufficient; that decision belongs to issuer.
const H=/^[a-f0-9]{64}$/u;
const CAT=new Set(["geopolitics","macro","rare_earth"]);
const FAIL="MACHINE_OFFLINE_ISSUER_REJECTED";
const fail=()=>{throw Error(FAIL)};
const sha=x=>createHash("sha256").update(x).digest("hex");
const sorted=v=>Array.isArray(v)?v.map(sorted):
 v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
export const canonicalMachineProofBytes=proof=>Buffer.from(JSON.stringify(sorted(proof)),"utf8");
const eq=(a,b)=>H.test(a??"")&&H.test(b??"")&&
 timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
const native=s=>{
 if(typeof s!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(s))fail();
 const t=Date.parse(s);if(!Number.isFinite(t))fail();return t;
};
function issuerKey({role,pem,publicPem,pin,otherPin,groSpki}){
 if(!["facts","rights"].includes(role)||!H.test(pin)||!H.test(otherPin)||
     !groSpki||!pem||!publicPem)fail();
 let privateKey,publicKey,approved,gro;
 try{
  privateKey=createPrivateKey(pem);publicKey=createPublicKey(privateKey);
  approved=createPublicKey(publicPem);
  gro=createPublicKey({key:Buffer.from(groSpki,"base64"),format:"der",type:"spki"});
 }catch{fail()}
 if([privateKey,publicKey,approved,gro].some(k=>k.asymmetricKeyType!=="ed25519"))fail();
 const derived=sha(publicKey.export({format:"der",type:"spki"}));
 const pinned=sha(approved.export({format:"der",type:"spki"}));
 const groPin=sha(gro.export({format:"der",type:"spki"}));
 if(!eq(derived,pin)||!eq(pinned,pin)||eq(pin,otherPin)||eq(pin,groPin)||
    eq(otherPin,groPin))fail();
 return privateKey;
}
export async function issueOfflineMachineAuthority({
 role,proof,candidates,review,reviewDocumentBytes,
 permissionDocumentBytes=[],privateKeyPem,publicKeyPem,pinnedPublicSha256,
 otherAuthorityPublicSha256,groPublicSpkiB64,now=new Date(),fetchImpl=fetch,
}){
 if(!["facts","rights"].includes(role)||!(now instanceof Date)||
    !Number.isFinite(now.getTime())||!Array.isArray(candidates)||
    candidates.length<2||candidates.length>4||
    typeof fetchImpl!=="function"||!proof||typeof proof!=="object"||
    proof.schema!=="geomacro.automated-commercial-proof.v1"||
    proof.profile!=="GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1"||
    !CAT.has(proof.category)||!/^[A-Z]{3}$/u.test(proof.country_iso3??"")||
    !H.test(proof.exact_evidence_sha256??"")||
    !H.test(proof.same_event_claim_sha256??"")||
    !H.test(proof.exact_original_evidence_set_sha256??"")||
    proof.semantic_same_event_verified!==true||
    proof.independent_original_issuers_verified!==true||
    proof.counterevidence_checked!==true||
    proof.unresolved_material_contradictions!==0||
    proof.retractions_detected!==0||
    !Array.isArray(proof.source_permissions)||
    proof.source_permissions.length!==candidates.length)fail();
 const at=native(proof.attested_at),expires=native(proof.expires_at);
 if(at>now.getTime()||expires<=now.getTime()||expires-at>60*60_000||
    now.getTime()-at>60*60_000)fail();
 if(!review||review.schema!=="geomacro.offline-issuer-review.v1"||
    review.role!==role||review.decision!=="APPROVED"||
    review.proof_sha256!==sha(canonicalMachineProofBytes(proof))||
    review.original_evidence_set_sha256!==proof.exact_original_evidence_set_sha256||
    review.original_pages_reviewed!==true||
    review.same_event_independence_reviewed!==true||
    review.retraction_and_contradiction_reviewed!==true||
    !reviewDocumentBytes||Buffer.byteLength(reviewDocumentBytes)<40||
    Buffer.byteLength(reviewDocumentBytes)>64*1024||
    !eq(review.review_document_sha256,sha(reviewDocumentBytes)))fail();
 const reviewedAt=native(review.reviewed_at);
 if(reviewedAt<at-60*60_000||reviewedAt>now.getTime()||
    now.getTime()-reviewedAt>60*60_000)fail();
 // The approved key is validated BEFORE first-party HTTP; a missing or
 // replaced custodian key never causes source reads or a signature.
 const signer=issuerKey({role,pem:privateKeyPem,publicPem:publicKeyPem,
  pin:pinnedPublicSha256,otherPin:otherAuthorityPublicSha256,
  groSpki:groPublicSpkiB64});
 const orgs=new Set(),articleIds=new Set(),sourceIds=new Set();
 for(const c of candidates){
  if(c.category!==proof.category||
     c.event?.country_iso3!==proof.country_iso3||
     c.same_event_claim_sha256!==proof.same_event_claim_sha256||
     !H.test(c.original_article_sha256??"")||
     !c.originating_reporting_organization_id||
     !c.source_registry_id||c.reporting_position!=="confirms"||
     orgs.has(c.originating_reporting_organization_id)||
     articleIds.has(c.original_article_sha256)||sourceIds.has(c.source_registry_id))fail();
  orgs.add(c.originating_reporting_organization_id);
  articleIds.add(c.original_article_sha256);
  sourceIds.add(c.source_registry_id);
  const matching=proof.source_permissions.filter(p=>
   p.source_registry_id===c.source_registry_id&&
   p.originating_reporting_organization_id===c.originating_reporting_organization_id&&
   p.original_article_sha256===c.original_article_sha256);
  if(matching.length!==1)fail();
  const p=matching[0];
  if(!H.test(p.licensed_article_scope_sha256??"")||
     !H.test(p.permission_record_sha256??"")||
     p.licensed_derived_use!==true||
     p.raw_redistribution_allowed!==false||
     p.attribution_required!==false||
     native(p.permission_verified_at)>now.getTime()||
     native(p.permission_expires_at)<=now.getTime())fail();
 }
 if(role==="facts"){
   // Facts approval is not legal approval. Rights signing is separate.
   if(permissionDocumentBytes.length!==0)fail();
 }else{
  // Rights custodian reads each independently obtained licence/permission
  // document and binds its actual bytes to the exact article scope.
  // Public-domain status or a publisher label alone is NOT a legal grant.
  if(review.article_scope_and_no_attribution_approved!==true||
     review.third_party_material_excluded!==true||
     !Array.isArray(review.license_basis)||
     review.license_basis.length!==candidates.length||
     permissionDocumentBytes.length!==candidates.length)fail();
  const used=new Set();
  for(const p of proof.source_permissions){
   const scope=review.license_basis.filter(x=>x.source_registry_id===p.source_registry_id&&
     x.original_article_sha256===p.original_article_sha256);
   if(scope.length!==1||used.has(scope[0].source_registry_id)||
      !["SCOPED_PUBLIC_DOMAIN_WITH_THIRD_PARTY_EXCLUDED","ARTICLE_SPECIFIC_WRITTEN_PERMISSION"]
         .includes(scope[0].basis)||scope[0].attribution_required!==false)fail();
   used.add(scope[0].source_registry_id);
   const doc=permissionDocumentBytes.find(x=>x.source_registry_id===p.source_registry_id);
   if(!doc||!doc.bytes||Buffer.byteLength(doc.bytes)<40||
      Buffer.byteLength(doc.bytes)>128*1024||
      !eq(sha(doc.bytes),p.permission_record_sha256))fail();
  }
 }
 // Reuse the single previously tested first-party HTML byte + native clock
 // verifier. This is NOT the semantic or legal approval authority itself.
 const reread=await verifyGeomacroTwoOriginalMachineBinding({candidates,now,fetchImpl});
 if(reread.accepted!==true||
    reread.status!=="TWO_ORIGINAL_BYTES_BOUND_SEMANTIC_AND_RIGHTS_PENDING"||
    reread.exact_original_evidence_set_sha256!==proof.exact_original_evidence_set_sha256||
    reread.observed_claim_sha256!==proof.same_event_claim_sha256)fail();
 const signature=sign(null,canonicalMachineProofBytes(proof),signer).toString("base64");
 if(!/^[A-Za-z0-9+/]{86}==$/u.test(signature))fail();
 return Object.freeze({
  schema:"geomacro.offline-machine-issuer-attestation.v1",
  role,proof_sha256:review.proof_sha256,
  original_evidence_set_sha256:proof.exact_original_evidence_set_sha256,
  signer_public_sha256:pinnedPublicSha256,
  signature_b64:signature,
  original_html_and_native_clock_reread:true,
  independent_external_reviewer_attested:false,
  current_public_hot_published:false,
  payment_authorized:false,
  supabase_requests:0,b2_requests:0,d1_writes:0,payments:0,
 });
}


/** Join two genuinely independent offline issuer decisions. This checks
 * cryptographic signatures but does not re-approve an article licence or
 * invoke the GRO signer: the existing private machine acceptance repeats
 * every live HTML, rights registry and actual GRO proof check.
 */
export function assembleOfflineMachineCommercialRequest({
 proof,candidates,event,attestations,factsPublicPem,rightsPublicPem,
 factsPublicSha256,rightsPublicSha256,groPublicSpkiB64,
 countryName=null,now=new Date(),
}){
 if(!proof||!Array.isArray(candidates)||candidates.length<2||
    !event||event.id!==proof.event_id||
    proof.exact_evidence_sha256!==sha(canonicalMachineProofBytes([event]))||
    !Array.isArray(attestations)||attestations.length!==2||
    !eq(factsPublicSha256,factsPublicSha256)||
    !eq(rightsPublicSha256,rightsPublicSha256)||
    eq(factsPublicSha256,rightsPublicSha256)||
    !Number.isFinite(now.getTime())||
    native(proof.expires_at)<=now.getTime())fail();
 const keys=[["facts",factsPublicPem,factsPublicSha256],
             ["rights",rightsPublicPem,rightsPublicSha256]];
 const bytes=canonicalMachineProofBytes(proof);
 let gro;
 try{gro=createPublicKey({key:Buffer.from(groPublicSpkiB64,"base64"),format:"der",type:"spki"})}
 catch{fail()}
 const groHash=sha(gro.export({format:"der",type:"spki"}));
 const signatures={};
 for(const [role,pem,pin] of keys){
   let pub;
   try{pub=createPublicKey(pem)}catch{fail()}
   if(pub.asymmetricKeyType!=="ed25519"||!eq(sha(pub.export({format:"der",type:"spki"})),pin)||
      eq(pin,groHash))fail();
   const matches=attestations.filter(a=>a?.role===role&&
     a.schema==="geomacro.offline-machine-issuer-attestation.v1");
   if(matches.length!==1)fail();
   const a=matches[0];
   if(a.proof_sha256!==sha(bytes)||
      a.original_evidence_set_sha256!==proof.exact_original_evidence_set_sha256||
      a.signer_public_sha256!==pin||
      a.original_html_and_native_clock_reread!==true||
      a.independent_external_reviewer_attested!==false||
      a.current_public_hot_published!==false||
      a.payment_authorized!==false||
      typeof a.signature_b64!=="string"||
      !/^[A-Za-z0-9+/]{86}==$/u.test(a.signature_b64)||
      !verify(null,bytes,pub,Buffer.from(a.signature_b64,"base64")))fail();
   signatures[role]=a.signature_b64;
 }
 return Object.freeze({
  schema:"geomacro.private-machine-commercial-request.v1",
  category:proof.category,country_iso3:proof.country_iso3,
  country_name:countryName,event,candidates,
  envelope:{proof,facts_signature_b64:signatures.facts,
   rights_signature_b64:signatures.rights},
 });
}
