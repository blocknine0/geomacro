import {createHash,createPublicKey,verify as verifyEd25519} from "node:crypto";
import {canonicalRiskObjectJson,type RiskObjectSigningMaterial,
  type RiskObjectVerificationKeys} from "./risk-object-signing.server";
import {checkGeomacroMachineOriginalRightsPreflight,
  type MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import type {B2CommercialSourceRight} from "./b2-live.server";
import type {CountryRiskEventInput} from "./country-risk-engine";
import {scoreAndSignQualifiedOnDemandCountry,
  type OnDemandCountryScoringInput,
  type VerifiedOnDemandEvidenceReceipt} from "./on-demand-qualified-country-risk.server";

/**
 * Reviewer-free is NOT rights-free or source verification-free.
 * Distinct, PINNED Geomacro internal fact-auditor and legal policy authorities
 * independently attest the exact private original set. GRO signing is THIRD
 * and unrelated to either. The public API NEVER accepts these attestations.
 *
 * Does not modify the old machine research profile or Federico's reviewed
 * contract. A private prepared artifact is NEVER settlement authorization.
 */
export const MACHINE_COMMERCIAL_PROOF_VERSION=
  "geomacro.automated-commercial-proof.v1" as const;
export const MACHINE_COMMERCIAL_PROFILE=
  "GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1" as const;
type Category="geopolitics"|"macro"|"rare_earth";
type Permission=Readonly<{
  source_registry_id:string;
  originating_reporting_organization_id:string;
  original_article_sha256:string;
  licensed_article_scope_sha256:string;
  permission_record_sha256:string;
  licensed_derived_use:true;
  raw_redistribution_allowed:false;
  attribution_required:false;
  permission_verified_at:string;
  permission_expires_at:string;
}>;
export type MachineCommercialProof=Readonly<{
  schema:typeof MACHINE_COMMERCIAL_PROOF_VERSION;
  profile:typeof MACHINE_COMMERCIAL_PROFILE;
  country_iso3:string;
  category:Category;
  event_id:string;
  exact_evidence_sha256:string;
  same_event_claim_sha256:string;
  exact_original_evidence_set_sha256:string;
  attested_at:string;
  expires_at:string;
  semantic_same_event_verified:true;
  independent_original_issuers_verified:true;
  counterevidence_checked:true;
  unresolved_material_contradictions:0;
  retractions_detected:0;
  source_permissions:readonly Permission[];
}>;
export type MachineCommercialEnvelope=Readonly<{
  proof:MachineCommercialProof;
  facts_signature_b64:string;
  rights_signature_b64:string;
}>;
type PrivateBundle=Readonly<{
  candidates:readonly MachineOriginalWithRegistry[];
  envelope:MachineCommercialEnvelope;
}>;
type PrivateDependencies=Readonly<{
  fetchImpl?:typeof fetch;
  readRights?:()=>Promise<B2CommercialSourceRight[]|null>;
}>;
const HASH=/^[0-9a-f]{64}$/u;
const B64=/^[A-Za-z0-9+/]{86}==$/u; // Ed25519 64-byte signature
const FAIL="GEOMACRO_MACHINE_COMMERCIAL_PROOF_NOT_VERIFIED";
const sha=(x:string)=>createHash("sha256").update(x,"utf8").digest("hex");
function readAuthority(prefix:string,env:Record<string,string|undefined>=process.env){
  const pem=env[prefix+"_PUBLIC_KEY_PEM"];
  const expected=env[prefix+"_PUBLIC_KEY_SHA256"];
  if(!pem||!HASH.test(expected??""))return null;
  try{
    const key=createPublicKey(pem);
    if(key.asymmetricKeyType!=="ed25519")return null;
    const actual=createHash("sha256")
      .update(key.export({format:"der",type:"spki"})).digest("hex");
    if(actual!==expected)return null;
    return {key,actual};
  }catch{return null;}
}
function machineAuthorities(env:Record<string,string|undefined>){
  const facts=readAuthority("GEOMACRO_MACHINE_FACTS",env);
  const rights=readAuthority("GEOMACRO_MACHINE_RIGHTS",env);
  if(!facts||!rights||facts.actual===rights.actual)return null;
  try{
    const raw=env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
    if(!raw||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))return null;
    const gro=createPublicKey({key:Buffer.from(raw,"base64"),format:"der",type:"spki"});
    if(gro.asymmetricKeyType!=="ed25519")return null;
    const groHash=createHash("sha256").update(gro.export({format:"der",type:"spki"})).digest("hex");
    return groHash===facts.actual||groHash===rights.actual?null:{facts,rights};
  }catch{return null;}
}
// Public-key configuration only: never attests facts, rights or an input package.
export function machineCommercialAuthorityConfigurationValid(env:Record<string,string|undefined>=process.env){
  return machineAuthorities(env)!==null;
}
function proofSignaturesValid(envelope:MachineCommercialEnvelope){
  const authorities=machineAuthorities(process.env);
  if(!authorities||!B64.test(envelope.facts_signature_b64)||!B64.test(envelope.rights_signature_b64))return false;
  try{
    const bytes=Buffer.from(canonicalRiskObjectJson(envelope.proof),"utf8");
    return verifyEd25519(null,bytes,authorities.facts.key,Buffer.from(envelope.facts_signature_b64,"base64")) &&
      verifyEd25519(null,bytes,authorities.rights.key,Buffer.from(envelope.rights_signature_b64,"base64"));
  }catch{return false;}
}
const within=(value:string,now:number,maxAge:number)=>{
  if(typeof value!=="string"||
     !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value))return false;
  const ms=Date.parse(value);
  return Number.isFinite(ms)&&ms<=now&&now-ms<=maxAge;
};
function expectedOriginalSet(candidates:readonly MachineOriginalWithRegistry[]){
  return sha(JSON.stringify(candidates.map(c=>({
    article_bytes_sha256:c.original_article_sha256,
    original_published_at:c.original_published_at,
    same_event_claim_sha256:c.same_event_claim_sha256,
  })).sort((a,b)=>String(a.article_bytes_sha256)
    .localeCompare(String(b.article_bytes_sha256)))));
}
function validateProof(
  input:{category:Category;country_iso3:string;evidence_sha256:string;
    events:ReadonlyArray<CountryRiskEventInput>;now:Date},
  bundle:PrivateBundle,
){
  const {candidates,envelope}=bundle;
  const proof=envelope?.proof;
  const now=input.now.getTime();
  if(!Number.isFinite(now)||!Array.isArray(candidates)||
     candidates.length<2||candidates.length>4||input.events.length!==1||
     !proof||proof.schema!==MACHINE_COMMERCIAL_PROOF_VERSION||
     proof.profile!==MACHINE_COMMERCIAL_PROFILE||
     proof.category!==input.category||proof.country_iso3!==input.country_iso3||
     proof.event_id!==input.events[0].id||
     proof.exact_evidence_sha256!==input.evidence_sha256||
     !HASH.test(proof.same_event_claim_sha256)||
     proof.exact_original_evidence_set_sha256!==expectedOriginalSet(candidates)||
     !within(proof.attested_at,now,60*60*1000)||
     !within(proof.expires_at,now+60*60*1000,60*60*1000)||
     Date.parse(proof.expires_at)<=now||
     Date.parse(proof.expires_at)-Date.parse(proof.attested_at)>60*60*1000||
     proof.semantic_same_event_verified!==true||
     proof.independent_original_issuers_verified!==true||
     proof.counterevidence_checked!==true||
     proof.unresolved_material_contradictions!==0||
     proof.retractions_detected!==0||
     !Array.isArray(proof.source_permissions)||
     proof.source_permissions.length!==candidates.length||
     !proofSignaturesValid(envelope))return false;
  const e=input.events[0];
  if(e.corroboration_status!=="CONFIRMED"||
     e.primary_country!==input.country_iso3||
     e.domain!==input.category||
     e.evidence_count!==candidates.length||
     e.independent_source_count!==candidates.length||
     !Array.isArray(e.source_ids)||!Array.isArray(e.source_families)||
     !Array.isArray(e.content_hashes)||!Array.isArray(e.source_record_ids)||
     !within(String(e.material_evidence_at??""),now,6*60*60*1000))return false;
  const srcIds=new Set<string>(),orgIds=new Set<string>(),articleIds=new Set<string>();
  const matched=new Set<number>();
  for(const c of candidates){
    const id=c.source_registry_id,org=c.originating_reporting_organization_id;
    const article=c.original_article_sha256,claim=c.same_event_claim_sha256;
    const native=c.event as Record<string,unknown>|undefined;
    if(!native||native.country_iso3!==input.country_iso3||
       native.event_type!==e.event_type||
       native.occurred_at!==e.material_evidence_at||
       Date.parse(String(c.original_published_at??""))>
         now || !within(String(c.original_published_at??""),now,6*60*60*1000)||
       typeof id!=="string"||typeof org!=="string"||
       !HASH.test(String(article))||claim!==proof.same_event_claim_sha256||
       srcIds.has(id)||orgIds.has(org)||articleIds.has(String(article))||
       c.category!==input.category)return false;
    srcIds.add(id);orgIds.add(org);articleIds.add(String(article));
    const matches=proof.source_permissions.map((p,i)=>({p,i}))
      .filter(({p})=>p.source_registry_id===id&&
        p.originating_reporting_organization_id===org&&
        p.original_article_sha256===article);
    if(matches.length!==1||matched.has(matches[0].i))return false;
    matched.add(matches[0].i);
    const p=matches[0].p;
    if(!HASH.test(p.licensed_article_scope_sha256)||
       !HASH.test(p.permission_record_sha256)||
       p.licensed_derived_use!==true||
       p.raw_redistribution_allowed!==false||
       p.attribution_required!==false||
       !within(p.permission_verified_at,now,90*86_400_000)||
       !within(p.permission_expires_at,now+365*86_400_000,365*86_400_000)||
       Date.parse(p.permission_expires_at)<=now||
       Date.parse(p.permission_expires_at)<Date.parse(p.permission_verified_at))
      return false;
  }
  const latest=Math.max(...candidates.map(x=>Date.parse(String(x.original_published_at))));
  if(Date.parse(e.first_seen_at)!==Date.parse(String(candidates[0].event?.occurred_at))||
     Date.parse(e.last_seen_at)!==latest)return false;
  const same=(a:readonly string[],b:readonly string[])=>
    JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  return same(e.source_ids,[...srcIds])&&
    same(e.source_families,[...orgIds])&&
    same(e.source_record_ids,[...articleIds])&&
    same(e.content_hashes,[...articleIds]);
}
/**
 * Private trusted-only receipt adapter for the existing canonical scorer.
 * The signed facts & legal-policy approval MUST originate from separate
 * approved internal processes with verified real original evidence, not
 * input metadata. No rights reader or external GET occurs before both
 * pinned authority signatures and exact event/permission bindings pass.
 */
export function createGeomacroMachineCommercialQualifier(
  bundle:PrivateBundle,deps:PrivateDependencies={},
){
  return async(input:Readonly<{category:Category;country_iso3:string;
    evidence_sha256:string;events:ReadonlyArray<CountryRiskEventInput>;now:Date;
  }>):Promise<VerifiedOnDemandEvidenceReceipt|null>=>{
    try{
      if(!validateProof(input,bundle))return null;
      const source=await checkGeomacroMachineOriginalRightsPreflight({
        candidates:[...bundle.candidates],now:input.now,
        fetchImpl:deps.fetchImpl??fetch,
        readRights:deps.readRights,
      });
      if(source.status!=="B2_REGISTRY_COMPATIBLE_ARTICLE_PERMISSION_PENDING"||
         !source.original_reread_verified||!source.registry_rights_compatible)
        return null;
      return {
        schema:"geomacro.on-demand-qualified-events.v1",
        category:input.category,country_iso3:input.country_iso3,
        exact_evidence_sha256:input.evidence_sha256,
        event_ids:[input.events[0].id],
        independent_claims_verified:true,
        verified_commercial_rights:true,
        event_commercial_eligibility:[{
          event_id:input.events[0].id,status:"DERIVED_ONLY",
          reason_codes:["geomacro_machine_dual_authority_v1",
            "source_bytes_reread_native_clock",
            "same_event_claim_and_counterevidence_verified",
            "article_scope_licensed_derived_only_no_attribution"],
        }],
      };
    }catch{return null;}
  };
}
/**
 * No public API wiring, D1/B2 mutation or funds. Successful acceptance yields
 * only the existing signed private CANONICAL prepared artifact, which the
 * caller must separately verify and explicitly authorize for publication.
 */
export async function prepareGeomacroMachineCommercialGRO(
  input:OnDemandCountryScoringInput,
  bundle:PrivateBundle,
  deps:PrivateDependencies & Readonly<{
    signingMaterial:RiskObjectSigningMaterial;
    verificationKeys:RiskObjectVerificationKeys;
  }>,
){
  if(input.profile==="FEDERICO_STRICT"||
     !deps.signingMaterial||!deps.verificationKeys)
    throw Error(FAIL);
  return scoreAndSignQualifiedOnDemandCountry({...input,profile:"CANONICAL"},{
    signingMaterial:deps.signingMaterial,
    verificationKeys:deps.verificationKeys,
    qualifyEvidence:createGeomacroMachineCommercialQualifier(bundle,deps),
  });
}
