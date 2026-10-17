import {createHash,createPublicKey,verify as verifySignature} from "node:crypto";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {machineCommercialAuthorityConfigurationValid} from "./geomacro-machine-commercial-qualification.server";
import {checkGeomacroSingleOriginalRightsPreflight} from "./geomacro-single-original-rights-preflight.server";
import type {MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import type {B2CommercialSourceRight} from "./b2-live.server";

/**
 * Distinct founder-approved ONE-original private trust profile.
 *
 * It verifies an authentic first-party HTML source clock, a separately
 * facts/rights-dual-signed exact article-scoped permission, and the current B2
 * source rights registry. This DOES NOT assert independent corroboration,
 * generate a GRO, certify all three GRI domains, publish or authorize payment.
 * Existing multi-issuer and FEDERICO_STRICT paths are untouched.
 */
export const SINGLE_ORIGINAL_AUTHORITY_PROFILE =
  "GEOMACRO_SINGLE_ORIGINAL_FACTS_RIGHTS_PRIVATE_V1" as const;
export const SINGLE_ORIGINAL_AUTHORITY_PROOF_SCHEMA =
  "geomacro.single-original-dual-authority-proof.v1" as const;

const HASH=/^[a-f0-9]{64}$/u;
const SIGNATURE=/^[A-Za-z0-9+/]{86}==$/u;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const TYPES=new Set(["geopolitics","macro","rare_earth"]);
const sha=(data:string)=>createHash("sha256").update(data,"utf8").digest("hex");
const canonicalHash=(data:unknown)=>sha(canonicalRiskObjectJson(data));

type SignedPermission=Readonly<{
  article_sha256:string;
  licence_document_sha256:string;
  permission_record_sha256:string;
  derived_commercial_use_authorized:true;
  raw_redistribution_allowed:false;
  attribution_required:false;
  permission_checked_at:string;
  permission_expires_at:string;
}>;
export type SingleOriginalAuthorityProof=Readonly<{
  schema:typeof SINGLE_ORIGINAL_AUTHORITY_PROOF_SCHEMA;
  profile:typeof SINGLE_ORIGINAL_AUTHORITY_PROFILE;
  category:"geopolitics"|"macro"|"rare_earth";
  country_iso3:string;
  originating_reporting_organization_id:string;
  source_registry_id:string;
  exact_event_sha256:string;
  same_event_claim_sha256:string;
  original_article_sha256:string;
  original_published_at:string;
  original_count:1;
  independent_corroboration_verified:false;
  factual_claim_checked:true;
  counterevidence_checked:true;
  unresolved_contradictions:0;
  retractions_detected:0;
  permission:SignedPermission;
  attested_at:string;
  expires_at:string;
}>;
export type SingleOriginalAuthorityEnvelope=Readonly<{
  proof:SingleOriginalAuthorityProof;
  facts_signature_b64:string;
  rights_signature_b64:string;
}>;
type Dependencies=Readonly<{
  now?:Date;
  fetchImpl?:typeof fetch;
  readRights?:()=>Promise<B2CommercialSourceRight[]|null>;
  authorityEnvironment?:Record<string,string|undefined>;
}>;
const within=(v:unknown,now:number,ageMs:number)=>{
  if(typeof v!=="string"||!UTC.test(v))return false;
  const t=Date.parse(v);
  return Number.isFinite(t)&&t<=now&&now-t<=ageMs;
};
function validAuthoritySignature(pem:unknown,pin:unknown,bytes:Buffer,signature:string){
  if(typeof pem!=="string"||typeof pin!=="string"||!HASH.test(pin))
    return false;
  try{
    const key=createPublicKey(pem);
    if(key.asymmetricKeyType!=="ed25519")return false;
    const digest=createHash("sha256").update(key.export({format:"der",type:"spki"})).digest("hex");
    return digest===pin&&verifySignature(null,bytes,key,Buffer.from(signature,"base64"));
  }catch{return false;}
}
function validatePrivateProof(
  candidate:MachineOriginalWithRegistry,
  envelope:SingleOriginalAuthorityEnvelope,
  now:Date,
  env:Record<string,string|undefined>,
){
  const proof=envelope?.proof,permission=proof?.permission;
  const ms=now.getTime();
  if(!Number.isFinite(ms)||!proof||!permission||!candidate||
     !TYPES.has(proof.category)||
     proof.schema!==SINGLE_ORIGINAL_AUTHORITY_PROOF_SCHEMA||
     proof.profile!==SINGLE_ORIGINAL_AUTHORITY_PROFILE||
     proof.category!==candidate.category||
     proof.source_registry_id!==candidate.source_registry_id||
     proof.originating_reporting_organization_id!==candidate.originating_reporting_organization_id||
     !/^[A-Z]{3}$/u.test(proof.country_iso3)||
     proof.country_iso3!==(candidate.event as {country_iso3?:string})?.country_iso3||
     !HASH.test(proof.exact_event_sha256)||
     proof.exact_event_sha256!==canonicalHash(candidate.event)||
     proof.same_event_claim_sha256!==candidate.same_event_claim_sha256||
     !HASH.test(proof.same_event_claim_sha256)||
     proof.original_article_sha256!==candidate.original_article_sha256||
     !HASH.test(proof.original_article_sha256)||
     proof.original_published_at!==candidate.original_published_at||
     !within(proof.original_published_at,ms,6*3600_000)||
     proof.original_count!==1||
     proof.independent_corroboration_verified!==false||
     proof.factual_claim_checked!==true||proof.counterevidence_checked!==true||
     proof.unresolved_contradictions!==0||proof.retractions_detected!==0||
     permission.article_sha256!==proof.original_article_sha256||
     !HASH.test(permission.licence_document_sha256)||
     !HASH.test(permission.permission_record_sha256)||
     permission.licence_document_sha256===permission.permission_record_sha256||
     permission.derived_commercial_use_authorized!==true||
     permission.raw_redistribution_allowed!==false||
     permission.attribution_required!==false||
     !within(permission.permission_checked_at,ms,90*86400_000)||
     !UTC.test(permission.permission_expires_at)||
     Date.parse(permission.permission_expires_at)<=ms||
     Date.parse(permission.permission_expires_at)-Date.parse(permission.permission_checked_at)>366*86400_000||
     !within(proof.attested_at,ms,3600_000)||
     !UTC.test(proof.expires_at)||Date.parse(proof.expires_at)<=ms||
     Date.parse(proof.expires_at)-Date.parse(proof.attested_at)>3600_000||
     !SIGNATURE.test(envelope.facts_signature_b64??"")||
     !SIGNATURE.test(envelope.rights_signature_b64??"")||
     !machineCommercialAuthorityConfigurationValid(env))return false;
  // Reject extra unsigned policy fields; the same exact bytes are signed by
  // the two separately approved authorities and bound to the GRO public key.
  if(Object.keys(proof).length!==20||
     Object.keys(permission).length!==7||
     Object.keys(envelope).length!==3)return false;
  const bytes=Buffer.from(canonicalRiskObjectJson(proof),"utf8");
  return validAuthoritySignature(
    env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM,
    env.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,bytes,envelope.facts_signature_b64,
  )&&validAuthoritySignature(
    env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM,
    env.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,bytes,envelope.rights_signature_b64,
  );
}

export async function qualifySingleOriginalPrivateAuthority({
  candidate,envelope,now=new Date(),fetchImpl=fetch,
  readRights,authorityEnvironment=process.env,
}:Dependencies & Readonly<{
  candidate:MachineOriginalWithRegistry;
  envelope:SingleOriginalAuthorityEnvelope;
}>){
  const denied=(status:string,original=false,registry=false)=>Object.freeze({
    schema:"geomacro.single-original-private-authority-receipt.v1" as const,
    status,
    original_reread_verified:original,
    registry_compatible:registry,
    independent_corroboration_verified:false as const,
    source_original_count:1 as const,
    distinct_facts_rights_signatures_verified:status==="SINGLE_ORIGINAL_DUAL_ATTESTED_PRIVATE_ONLY",
    article_permission_dual_attested:status==="SINGLE_ORIGINAL_DUAL_ATTESTED_PRIVATE_ONLY",
    qualified_private_only:status==="SINGLE_ORIGINAL_DUAL_ATTESTED_PRIVATE_ONLY",
    signed_commercial_gro:false as const,
    gri_current_certified:false as const,
    public_hot_published:false as const,
    payment_authorized:false as const,
    supabase_writes:0 as const,b2_writes:0 as const,d1_writes:0 as const,
    payment_attempts:0 as const,
  });
  // Signature first: no source fetch or quota-consuming B2 rights read on an
  // untrusted/missing authority, tampered proof or invented permission hash.
  if(!validatePrivateProof(candidate,envelope,now,authorityEnvironment))
    return denied("FACTS_RIGHTS_AUTHORITY_OR_PROOF_INVALID");
  const registry=await checkGeomacroSingleOriginalRightsPreflight({
    candidate,now,fetchImpl,readRights,
  });
  if(!registry.original_byte_readback_verified)
    return denied("FIRST_PARTY_SOURCE_BYTES_OR_CLOCK_UNVERIFIED");
  if(!registry.source_registry_compatible||
     registry.status!=="B2_REGISTRY_COMPATIBLE_SINGLE_ARTICLE_PERMISSION_PENDING")
    return denied("SOURCE_REGISTRY_OR_RIGHTS_SCOPE_UNAVAILABLE",true);
  // The legal approval is solely from the two verified, already-provisioned
  // authorities; the registry does NOT mint an article licence. No public
  // GRO/x402 publisher consumes this distinct private receipt yet.
  return Object.freeze({
    ...denied("SINGLE_ORIGINAL_DUAL_ATTESTED_PRIVATE_ONLY",true,true),
    proof_sha256:canonicalHash(envelope.proof),
    exact_event_sha256:envelope.proof.exact_event_sha256,
    original_article_sha256:envelope.proof.original_article_sha256,
    qualified_until:envelope.proof.expires_at,
  });
}
