import type {B2CommercialSourceRight} from "./b2-live.server";
import {readB2CommercialSourceRights} from "./b2-live.server";
import {commercialSourceEligibilityFromRow} from "./commercial-source-eligibility.server";
import {ACCEPTED_SOURCE_IDS} from "./on-demand-reviewed-rights-qualifier.server";
import {verifyGeomacroTwoOriginalMachineBinding} from "../../scripts/lib/geomacro-machine-original-binding.mjs";

/**
 * Bounded, private and reviewer-FREE precommercial rights readback.
 * Never interpret a B2 registry status string as article-specific legal
 * permission. No signing/settlement/hot publication anywhere in this path.
 *
 * Source IDs are admitted by exactly the SAME pinned organization registry
 * already used by the strict independent-reviewer commercial qualifier.
 */
export type MachineOriginalWithRegistry=Readonly<{
  category:"geopolitics"|"macro"|"rare_earth";
  source_registry_id:string;
  originating_reporting_organization_id:string;
  [key:string]:unknown;
}>;
type PreflightArgs={
  candidates:MachineOriginalWithRegistry[];
  now?:Date;
  fetchImpl?:typeof fetch;
  readRights?:()=>Promise<B2CommercialSourceRight[]|null>;
};
export type MachineRightsPreflight=Readonly<{
  schema:"geomacro.private-automated-original-rights-preflight.v1";
  status:"SOURCE_INPUT_REJECTED"|"ORIGINAL_PAGE_NOT_VERIFIED"|
    "B2_RIGHTS_REGISTRY_UNAVAILABLE"|"B2_RIGHTS_SOURCE_INELIGIBLE"|
    "B2_REGISTRY_COMPATIBLE_ARTICLE_PERMISSION_PENDING";
  original_reread_verified:boolean;
  registry_rights_compatible:boolean;
  actual_article_commercial_permission_verified:false;
  semantic_same_event_claim_verified:false;
  independent_external_reviewer_attested:false;
  signed_commercial_gro:false;
  payment_authorized:false;
  public_published:false;
  d1_writes:0;
  supabase_requests:0;
  payments:0;
}>;
function receipt(
  status:MachineRightsPreflight["status"],
  original:boolean,rights:boolean,
):MachineRightsPreflight{
  return Object.freeze({
    schema:"geomacro.private-automated-original-rights-preflight.v1",
    status,original_reread_verified:original,
    registry_rights_compatible:rights,
    actual_article_commercial_permission_verified:false,
    semantic_same_event_claim_verified:false,
    independent_external_reviewer_attested:false,
    signed_commercial_gro:false,payment_authorized:false,
    public_published:false,d1_writes:0,supabase_requests:0,payments:0,
  });
}
export async function checkGeomacroMachineOriginalRightsPreflight({
  candidates,now=new Date(),fetchImpl=fetch,
  readRights=readB2CommercialSourceRights,
}:PreflightArgs):Promise<MachineRightsPreflight>{
  if(!Array.isArray(candidates)||candidates.length<2||
     candidates.length>4||!Number.isFinite(now?.getTime())||
     typeof fetchImpl!=="function"||typeof readRights!=="function")
    return receipt("SOURCE_INPUT_REJECTED",false,false);
  const ids=new Set<string>();
  for(const c of candidates){
    if(!c||typeof c!=="object"||Array.isArray(c)||
       typeof c.source_registry_id!=="string"||
       typeof c.originating_reporting_organization_id!=="string"||
       !ACCEPTED_SOURCE_IDS[c.originating_reporting_organization_id]
         ?.includes(c.source_registry_id)||
       ids.has(c.source_registry_id))
      return receipt("SOURCE_INPUT_REJECTED",false,false);
    ids.add(c.source_registry_id);
  }
  // Nothing may query commercial-rights B2 metadata before the real
  // original HTML content hash/native-clock checks have succeeded.
  let bound;
  try{
    bound=await verifyGeomacroTwoOriginalMachineBinding({
      candidates,now,fetchImpl,
    });
  }catch{return receipt("SOURCE_INPUT_REJECTED",false,false)}
  if(bound?.accepted!==true ||
     bound.status!=="TWO_ORIGINAL_BYTES_BOUND_SEMANTIC_AND_RIGHTS_PENDING")
    return receipt("ORIGINAL_PAGE_NOT_VERIFIED",false,false);

  // This existing B2 reader is quota-reserved and fail-closed, and rejects
  // stale/invalid snapshot schema. It never silently falls back to Supabase.
  let records:B2CommercialSourceRight[]|null;
  try{records=await readRights()}catch{
    return receipt("B2_RIGHTS_REGISTRY_UNAVAILABLE",true,false);
  }
  if(!Array.isArray(records) || records.length===0)
    return receipt("B2_RIGHTS_REGISTRY_UNAVAILABLE",true,false);
  for(const c of candidates){
    const matches=records.filter(row=>row.source_id===c.source_registry_id);
    if(matches.length!==1 ||
       matches[0].category!==c.category ||
       !matches[0].licence_name?.trim())
      return receipt("B2_RIGHTS_SOURCE_INELIGIBLE",true,false);
    const eligibility=commercialSourceEligibilityFromRow(
      c.source_registry_id,matches[0]);
    if(!eligibility.eligible||
       !["COMMERCIAL_OK","DERIVED_ONLY"].includes(
         eligibility.commercial_usage_status??"")||
       eligibility.delivery_boundary!=="DERIVED_ONLY"||
       eligibility.raw_payload_allowed!==false||
       eligibility.attribution_required===true)
      return receipt("B2_RIGHTS_SOURCE_INELIGIBLE",true,false);
  }
  // Explicitly stops short of actual article permission and machine GRO:
  // a B2 metadata entry can be technically admissible but legally wrong.
  return receipt("B2_REGISTRY_COMPATIBLE_ARTICLE_PERMISSION_PENDING",true,true);
}
