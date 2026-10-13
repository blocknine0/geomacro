import {createHash} from "node:crypto";
import {buildCountryRiskObject,type CountryRiskEventInput} from "./country-risk-engine";
import {withRiskObjectObservationTimestamp} from "./risk-object-observation";
import {canonicalRiskObjectJson,assertRiskObjectJsonKeysSafe,
  signRiskObject,verifyRiskObjectSignature,type RiskObjectSigningMaterial,
  type RiskObjectVerificationKeys} from "./risk-object-signing.server";
import {checkGeomacroMachineOriginalRightsPreflight,
  type MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import type {B2CommercialSourceRight} from "./b2-live.server";
import {readB2CommercialSourceRights} from "./b2-live.server";

/**
 * A separate FIRST-PARTY automated RESEARCH-only signed GRO path.
 *
 * No independent reviewer key. Existing FEDERICO_STRICT and paid GRO
 * qualification are not replaced or weakened. A cryptographic signature
 * authenticates Geomacro's calculated RESEARCH object, not semantic truth,
 * publisher article licences or commercial entitlement.
 *
 * Private trusted input only, never a public API request; no persistence,
 * customer publication, x402 payment, Supabase or D1 mutation.
 */
export const GEOMACRO_MACHINE_RESEARCH_PROFILE =
  "GEOMACRO_AUTOMATED_RESEARCH_UNVERIFIED_V1" as const;
const FAIL="GEOMACRO_MACHINE_RESEARCH_EVIDENCE_UNVERIFIED";
const HASH=/^[a-f0-9]{64}$/;
const CATEGORY=new Set(["geopolitics","macro","rare_earth"]);
const exact=(a:readonly string[],b:readonly string[])=>
  JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
type SupportedCategory="geopolitics"|"macro"|"rare_earth";
type Input={
  category:SupportedCategory;
  country_iso3:string;
  country_name?:string|null;
  event:CountryRiskEventInput;
  candidates:MachineOriginalWithRegistry[];
  now?:Date;
};
type Dependencies={
  signingMaterial:RiskObjectSigningMaterial;
  verificationKeys:RiskObjectVerificationKeys;
  fetchImpl?:typeof fetch;
  readRights?:()=>Promise<B2CommercialSourceRight[]|null>;
};
export type MachineSignedPrivateResearch=Readonly<{
  schema:"geomacro.private-machine-signed-research-gro.v1";
  profile:typeof GEOMACRO_MACHINE_RESEARCH_PROFILE;
  original_evidence_status:"TWO_FIRST_PARTY_ORIGINALS_RECHECKED";
  source_rights_registry_compatible:true;
  semantic_same_event_claim_verified:false;
  article_commercial_rights_verified:false;
  licensed_commercial_delivery_allowed:false;
  external_reviewer_attested:false;
  x402_payment_authorized:false;
  public_hot_published:false;
  persistence_performed:false;
  original_count:number;
  record_sha256:string;
  original_evidence_commitment_sha256:string;
  signed_gro_canonical_json:string;
  gro_signature_verified:true;
}>;
const value=(x:unknown):string=>{
  if(typeof x!=="string"||!x.trim())throw Error(FAIL);
  return x;
};
function validateExactEvent(input:Input,now:Date){
  if(!input||!CATEGORY.has(input.category)||
    !/^[A-Z]{3}$/.test(input.country_iso3)||!input.event||
    !Array.isArray(input.candidates)||input.candidates.length<2||
    input.candidates.length>4||!Number.isFinite(now.getTime()))
    throw Error(FAIL);
  const e=input.event;
  assertRiskObjectJsonKeysSafe(e);
  if(e.domain!==input.category||
    e.primary_country!==input.country_iso3||
    !e.countries?.includes(input.country_iso3)||
    !e.id||!/^[a-zA-Z0-9._:-]{3,128}$/.test(e.id)||
    e.corroboration_status!=="CORROBORATING"||
    !e.title?.trim()||e.title.length>280||
    e.severity===null||!Number.isFinite(e.severity)||e.severity<=0||e.severity>100||
    e.confidence===null||!Number.isFinite(e.confidence)||e.confidence<=0||e.confidence>100||
    !Number.isFinite(e.relevance_weight)||!e.relevance_weight||
    e.relevance_weight<=0||e.relevance_weight>1||
    e.evidence_count!==input.candidates.length||
    e.independent_source_count!==input.candidates.length||
    e.source_urls?.length||Array.isArray(e.evidence_refs)&&e.evidence_refs.length||
    !Array.isArray(e.content_hashes)||!Array.isArray(e.source_record_ids)||
    !Array.isArray(e.source_ids)||!Array.isArray(e.source_families))
    throw Error(FAIL);
  const rows=input.candidates;
  const orgs=rows.map(c=>value(c.originating_reporting_organization_id));
  const sourceIds=rows.map(c=>value(c.source_registry_id));
  const pageHashes=rows.map(c=>value(c.original_article_sha256));
  const occurredAt=rows.map(c=>(c.event as Record<string,unknown>)?.occurred_at);
  const claims=rows.map(c=>value(c.same_event_claim_sha256));
  if(orgs.some(x=>x.length>120)||new Set(orgs).size!==orgs.length||
    new Set(sourceIds).size!==sourceIds.length||
    !pageHashes.every(x=>HASH.test(x))||
    !claims.every(x=>HASH.test(x)&&x===claims[0])||
    !occurredAt.every(x=>typeof x==="string"&&x===occurredAt[0])||
    !exact(e.source_ids,sourceIds)||!exact(e.source_families,orgs)||
    !exact(e.source_record_ids,pageHashes)||!exact(e.content_hashes,pageHashes)||
    typeof e.first_seen_at!=="string"||
    Date.parse(e.first_seen_at)!==Date.parse(value(occurredAt[0]))||
    Date.parse(e.material_evidence_at??"")!==Date.parse(value(occurredAt[0]))||
    !Number.isFinite(Date.parse(e.material_evidence_at??""))||
    Date.parse(e.last_seen_at)!==Math.max(...rows.map(c=>
      Date.parse(value(c.original_published_at))))||
    Date.parse(e.material_evidence_at??"")>now.getTime()||
    now.getTime()-Date.parse(e.material_evidence_at??"")>6*60*60*1000)
    throw Error(FAIL);
  if(input.country_name!==undefined&&input.country_name!==null&&
    (typeof input.country_name!=="string"||input.country_name.length>120))
    throw Error(FAIL);
  return {claim:claims[0],pageHashes};
}
export async function signGeomacroMachinePrivateResearchGRO(
  input:Input,deps:Dependencies,
):Promise<MachineSignedPrivateResearch>{
  if(!deps?.signingMaterial||!deps.verificationKeys)throw Error(FAIL);
  const now=input.now??new Date();
  const {pageHashes}=validateExactEvent(input,now);
  const rights=await checkGeomacroMachineOriginalRightsPreflight({
    candidates:input.candidates,now,fetchImpl:deps.fetchImpl??fetch,
    readRights:deps.readRights??readB2CommercialSourceRights,
  });
  if(rights.status!=="B2_REGISTRY_COMPATIBLE_ARTICLE_PERMISSION_PENDING"||
    rights.original_reread_verified!==true||
    rights.registry_rights_compatible!==true||
    rights.actual_article_commercial_permission_verified!==false||
    rights.semantic_same_event_claim_verified!==false)
    throw Error("GEOMACRO_MACHINE_RESEARCH_ORIGINAL_OR_RIGHTS_NOT_READY");
  // Canonically score the immutable structured snapshot with a distinct
  // namespace. No reviewer signature; no bogus VERIFIED commercial flag.
  const event=JSON.parse(canonicalRiskObjectJson(input.event)) as CountryRiskEventInput;
  const scored=await buildCountryRiskObject({
    country_iso3:input.country_iso3,country_name:input.country_name??null,
    events:[event],as_of:now.toISOString(),
    calculation_namespace:"geomacro_automated_research_unverified_v1",
  });
  if(scored.evidence.length!==1||
    scored.evidence[0].event_id!==event.id||
    scored.evidence_summary.independent_source_count<2||
    scored.verification.status==="VERIFIED"||
    scored.commercial_eligibility.status!=="UNVERIFIED")
    throw Error("GEOMACRO_MACHINE_RESEARCH_UNQUALIFIED_SCORING");
  const observed=withRiskObjectObservationTimestamp(scored,now.toISOString());
  // The signature is for private provenance ONLY. Every normal production
  // commercial-deliverability check continues to reject this signed object.
  const signed=signRiskObject(observed,deps.signingMaterial);
  const replay=verifyRiskObjectSignature(signed,deps.verificationKeys);
  if(replay.valid!==true||signed.verification.status==="VERIFIED"||
    signed.commercial_eligibility.status!=="UNVERIFIED")
    throw Error("GEOMACRO_MACHINE_RESEARCH_SIGNATURE_REPLAY_FAILED");
  const canonical=canonicalRiskObjectJson(signed);
  return Object.freeze({
    schema:"geomacro.private-machine-signed-research-gro.v1",
    profile:GEOMACRO_MACHINE_RESEARCH_PROFILE,
    original_evidence_status:"TWO_FIRST_PARTY_ORIGINALS_RECHECKED",
    source_rights_registry_compatible:true,
    semantic_same_event_claim_verified:false,
    article_commercial_rights_verified:false,
    licensed_commercial_delivery_allowed:false,
    external_reviewer_attested:false,
    x402_payment_authorized:false,public_hot_published:false,
    persistence_performed:false,original_count:pageHashes.length,
    record_sha256:createHash("sha256").update(canonical,"utf8").digest("hex"),
    original_evidence_commitment_sha256:createHash("sha256")
      .update(canonicalRiskObjectJson([...pageHashes].sort()),"utf8").digest("hex"),
    signed_gro_canonical_json:canonical,gro_signature_verified:true,
  });
}
