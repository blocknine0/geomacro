import {createHash} from "node:crypto";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {issueGeomacroOwnedOutputLicense} from "./geomacro-owned-derived-output-license.server";
import {qualifySingleOriginalPrivateAuthority,
  SINGLE_ORIGINAL_AUTHORITY_PROFILE,
  type SingleOriginalAuthorityEnvelope} from "./single-original-private-authority.server";
import type {MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import type {B2CommercialSourceRight} from "./b2-live.server";

/**
 * Narrow single-original FACTUAL handoff, not commercial GRO/scoring/GRI.
 * The only accepted input is a freshly, independently dual-attested original
 * reread by the existing first-party and source-rights verifier in THIS call.
 * Returned fields contain no publisher identity/URL/headline/body or score.
 * No B2/D1 write, no publish, no signer private key, no customer settlement.
 */
export async function preparePrivateSingleOriginalFactualHandoff({
  candidate,envelope,now=new Date(),fetchImpl=fetch,readRights,
  authorityEnvironment=process.env,
}:{
  candidate:MachineOriginalWithRegistry;
  envelope:SingleOriginalAuthorityEnvelope;
  now?:Date;
  fetchImpl?:typeof fetch;
  readRights?:()=>Promise<B2CommercialSourceRight[]|null>;
  authorityEnvironment?:Record<string,string|undefined>;
}){
  const qualified=await qualifySingleOriginalPrivateAuthority({
    candidate,envelope,now,fetchImpl,readRights,authorityEnvironment,
  });
  if(!qualified.qualified_private_only ||
     qualified.status!=="SINGLE_ORIGINAL_DUAL_ATTESTED_PRIVATE_ONLY" ||
     qualified.independent_corroboration_verified!==false ||
     qualified.source_original_count!==1 ||
     !qualified.distinct_facts_rights_signatures_verified ||
     !qualified.article_permission_dual_attested ||
     qualified.signed_commercial_gro!==false ||
     qualified.gri_current_certified!==false ||
     qualified.public_hot_published!==false ||
     qualified.payment_authorized!==false ||
     !("proof_sha256" in qualified) ||
     !("exact_event_sha256" in qualified) ||
     !("original_article_sha256" in qualified) ||
     !("qualified_until" in qualified))
    return Object.freeze({accepted:false,reason:"SINGLE_ORIGINAL_FACTUAL_SOURCE_NOT_QUALIFIED",
      derived_input:null,derived_input_sha256:null});
  const identity=candidate.event as Record<string,unknown>|undefined;
  // No descriptive narrative or external risk/FX prices can be accepted from
  // an arbitrary candidate, even one otherwise approved as an original claim.
  const eventType=identity?.event_type;
  if(typeof eventType!=="string"||!/^[a-z][a-z0-9_]{2,63}$/u.test(eventType))
    return Object.freeze({accepted:false,reason:"SIGNED_EVENT_TYPE_NOT_ADMISSIBLE",
      derived_input:null,derived_input_sha256:null});
  if(typeof qualified.qualified_until!=="string")
    return Object.freeze({accepted:false,reason:"SIGNED_PROOF_WINDOW_INVALID",derived_input:null,derived_input_sha256:null});
  const expires=Date.parse(qualified.qualified_until);
  if(!Number.isFinite(expires)||expires<=now.getTime()||
     expires-now.getTime()>3600_000)
    return Object.freeze({accepted:false,reason:"SIGNED_PROOF_WINDOW_INVALID",
      derived_input:null,derived_input_sha256:null});
  const result=Object.freeze({
    schema:"geomacro.private-single-original-factual-handoff.v1" as const,
    authority_profile:SINGLE_ORIGINAL_AUTHORITY_PROFILE,
    product_type:"ISSUER_FACTUAL_OBSERVATION_UNSCORED" as const,
    category:envelope.proof.category,
    country_iso3:envelope.proof.country_iso3,
    event_type:eventType,
    original_source_native_at:envelope.proof.original_published_at,
    original_verified_html_sha256:qualified.original_article_sha256,
    exact_event_sha256:qualified.exact_event_sha256,
    dual_authority_proof_sha256:qualified.proof_sha256,
    qualified_until:qualified.qualified_until,
    original_source_count:1 as const,
    independent_corroboration_verified:false as const,
    independently_scored_risk:false as const,
    severity:null,
    score:null,
    derived_prediction:null,
    commercial_gro_signed:false as const,
    public_published:false as const,
    gri_country_category_certified:false as const,
    chargeable:false as const,
    payment_authorized:false as const,
    supabase_writes:0 as const,
    b2_writes:0 as const,
    d1_writes:0 as const,
  });
  const fingerprint=createHash("sha256").update(canonicalRiskObjectJson(result),"utf8").digest("hex");
  return Object.freeze({
    accepted:true,reason:"PRIVATE_ONE_ORIGINAL_FACTUAL_INPUT_PREPARED",
    derived_input:result,derived_input_sha256:fingerprint,
    // This is a licence of Geomacro-owned DERIVED expression only. It is
    // not an upstream license, scored-product grant or payment clearance.
    owner_output_license:issueGeomacroOwnedOutputLicense(result),
  });
}
