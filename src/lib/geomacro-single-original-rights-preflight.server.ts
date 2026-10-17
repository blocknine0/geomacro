import type {B2CommercialSourceRight} from "./b2-live.server";
import {readB2CommercialSourceRights} from "./b2-live.server";
import {commercialSourceEligibilityFromRow} from "./commercial-source-eligibility.server";
import {ACCEPTED_SOURCE_IDS} from "./on-demand-reviewed-rights-qualifier.server";
import type {MachineOriginalWithRegistry} from "./geomacro-machine-source-rights.server";
import {verifyGeomacroSingleOriginalBinding} from "../../scripts/lib/geomacro-single-original-binding.mjs";

/**
 * Explicit ONE first-party issuer registry preflight. The source count policy
 * is NOT an automatic article-use licence nor an independent review. This
 * separate profile never satisfies the two-independent-source risk scorer.
 */
export async function checkGeomacroSingleOriginalRightsPreflight({
  candidate,now=new Date(),fetchImpl=fetch,
  readRights=readB2CommercialSourceRights,
}:{
  candidate:MachineOriginalWithRegistry;
  now?:Date;
  fetchImpl?:typeof fetch;
  readRights?:()=>Promise<B2CommercialSourceRight[]|null>;
}){
 const denied=(status:string,original=false,registry=false)=>Object.freeze({
  schema:"geomacro.single-original-commercial-rights-preflight.v1" as const,
  status,
  verified_original_count:original?1:0,
  independent_original_count:0,
  original_byte_readback_verified:original,
  source_registry_compatible:registry,
  actual_article_commercial_permission_verified:false as const,
  facts_signature_verified:false as const,
  rights_signature_verified:false as const,
  independently_corroborated:false as const,
  signed_commercial_gro:false as const,
  public_hot_published:false as const,
  payment_authorized:false as const,
  b2_writes:0 as const,d1_writes:0 as const,supabase_writes:0 as const,
 });
 if(!candidate||!Number.isFinite(now?.getTime?.())||
    typeof fetchImpl!=="function"||typeof readRights!=="function"||
    !ACCEPTED_SOURCE_IDS[candidate.originating_reporting_organization_id]
      ?.includes(candidate.source_registry_id))
   return denied("SOURCE_REGISTRY_OR_INPUT_INVALID");
 let original;
 try{
  original=await verifyGeomacroSingleOriginalBinding({
   candidate,now,fetchImpl,
  });
 }catch{return denied("SOURCE_REGISTRY_OR_INPUT_INVALID")}
 if(original?.accepted!==true||
    original.verified_first_party_original_count!==1||
    original.independent_same_event_corroboration_verified!==false)
   return denied("ORIGINAL_BYTES_OR_CLOCK_UNVERIFIED");
 let records:B2CommercialSourceRight[]|null;
 try{records=await readRights()}catch{return denied("B2_RIGHTS_REGISTRY_UNAVAILABLE",true)}
 if(!Array.isArray(records)||!records.length)
  return denied("B2_RIGHTS_REGISTRY_UNAVAILABLE",true);
 const matching=records.filter(row=>row.source_id===candidate.source_registry_id);
 if(matching.length!==1||matching[0].category!==candidate.category||
    !matching[0].licence_name?.trim())
   return denied("B2_RIGHTS_SOURCE_INELIGIBLE",true);
 const e=commercialSourceEligibilityFromRow(candidate.source_registry_id,matching[0]);
 if(!e.eligible||!["COMMERCIAL_OK","DERIVED_ONLY"].includes(
    e.commercial_usage_status??"")||
    e.delivery_boundary!=="DERIVED_ONLY"||
    e.raw_payload_allowed!==false||e.attribution_required===true)
   return denied("B2_RIGHTS_SOURCE_INELIGIBLE",true);
 // A generic source registry approval is NOT the original article licence.
 // The distinct facts and rights issuers must still sign the real article.
 return denied("B2_REGISTRY_COMPATIBLE_SINGLE_ARTICLE_PERMISSION_PENDING",
   true,true);
}
