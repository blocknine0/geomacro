import {createHash} from "node:crypto";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";

/**
 * Only Geomacro-controlled ORIGINAL DERIVED OUTPUT usage is licensed.
 * This NEVER certifies rights in upstream original publisher material,
 * including government-hosted third-party works or attributed databases.
 *
 * This grant must never be treated as a canonical GRO/GRI rights receipt,
 * a source-use approval, or x402 settlement authorization.
 */
export const GEOMACRO_OWNER_OUTPUT_LICENSE_ID=
  "geomacro.owner-derived-output-commercial-grant.v1" as const;

const SHA=/^[0-9a-f]{64}$/u;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const ALLOWED_PRIVATE_FACT_KEYS=new Set([
  "schema","authority_profile","product_type","category","country_iso3",
  "event_type","original_source_native_at","original_verified_html_sha256",
  "exact_event_sha256","dual_authority_proof_sha256","qualified_until",
  "original_source_count","independent_corroboration_verified",
  "independently_scored_risk","severity","score","derived_prediction",
  "commercial_gro_signed","public_published","gri_country_category_certified",
  "chargeable","payment_authorized","supabase_writes","b2_writes","d1_writes",
]);
const hash=(value:unknown)=>createHash("sha256")
  .update(canonicalRiskObjectJson(value),"utf8").digest("hex");

export type OwnedOutputLicenseReceipt=Readonly<{
  schema:typeof GEOMACRO_OWNER_OUTPUT_LICENSE_ID;
  licence_owner:"Geomacro";
  rights_scope:"ONLY_RIGHTS_LEGALLY_HELD_BY_GEOMACRO";
  grant_type:"NON_EXCLUSIVE_COMMERCIAL_USE_OF_ELIGIBLE_DERIVED_OUTPUT";
  owner_output_use_granted:true;
  owner_policy_version:"2026-10-18";
  output_schema:"geomacro.private-single-original-factual-handoff.v1";
  output_sha256:string;
  source_use_permission_granted:false;
  third_party_rights_warranted:false;
  independent_corroboration_claimed:false;
  gro_or_gri_authorized:false;
  public_delivery_authorized:false;
  payment_authorized:false;
  no_raw_publisher_material_granted:true;
  attribution_obligations_unaffected:true;
}>;

/**
 * Creates an OWNER policy receipt only for an already qualified, minimal,
 * unscored privately derived Geomacro factual record.
 * It does not perform the real upstream permission or signing check; callers
 * must pass only records from the separately fail-closed source verifier.
 */
export function issueGeomacroOwnedOutputLicense(
  candidate:unknown,
):OwnedOutputLicenseReceipt{
  if(!candidate||typeof candidate!=="object"||Array.isArray(candidate))
    throw Error("OWNER_DERIVED_LICENSE_INPUT_INVALID");
  const d=candidate as Record<string,unknown>;
  if(Object.keys(d).length!==ALLOWED_PRIVATE_FACT_KEYS.size||
     Object.keys(d).some(k=>!ALLOWED_PRIVATE_FACT_KEYS.has(k))||
     d.schema!=="geomacro.private-single-original-factual-handoff.v1"||
     d.authority_profile!=="GEOMACRO_SINGLE_ORIGINAL_FACTS_RIGHTS_PRIVATE_V1"||
     d.product_type!=="ISSUER_FACTUAL_OBSERVATION_UNSCORED"||
     !CATEGORIES.has(String(d.category??""))||
     typeof d.country_iso3!=="string"||!/^[A-Z]{3}$/u.test(d.country_iso3)||
     typeof d.event_type!=="string"||!/^[a-z][a-z0-9_]{2,63}$/u.test(d.event_type)||
     typeof d.original_source_native_at!=="string"||!UTC.test(d.original_source_native_at)||
     typeof d.qualified_until!=="string"||!UTC.test(d.qualified_until)||
     !Number.isFinite(Date.parse(d.original_source_native_at))||
     !Number.isFinite(Date.parse(d.qualified_until))||
     Date.parse(d.original_source_native_at)>=Date.parse(d.qualified_until)||
     !SHA.test(String(d.original_verified_html_sha256??""))||
     !SHA.test(String(d.exact_event_sha256??""))||
     !SHA.test(String(d.dual_authority_proof_sha256??""))||
     d.original_source_count!==1||
     d.independent_corroboration_verified!==false||
     d.independently_scored_risk!==false||
     d.severity!==null||d.score!==null||d.derived_prediction!==null||
     d.commercial_gro_signed!==false||d.public_published!==false||
     d.gri_country_category_certified!==false||
     d.chargeable!==false||d.payment_authorized!==false||
     d.supabase_writes!==0||d.b2_writes!==0||d.d1_writes!==0)
    throw Error("OWNER_DERIVED_LICENSE_CANNOT_CLEAR_UPSTREAM_OR_SCORED_PRODUCT");
  return Object.freeze({
    schema:GEOMACRO_OWNER_OUTPUT_LICENSE_ID,
    licence_owner:"Geomacro",
    rights_scope:"ONLY_RIGHTS_LEGALLY_HELD_BY_GEOMACRO",
    grant_type:"NON_EXCLUSIVE_COMMERCIAL_USE_OF_ELIGIBLE_DERIVED_OUTPUT",
    owner_output_use_granted:true,
    owner_policy_version:"2026-10-18",
    output_schema:"geomacro.private-single-original-factual-handoff.v1",
    output_sha256:hash(d),
    source_use_permission_granted:false,
    third_party_rights_warranted:false,
    independent_corroboration_claimed:false,
    gro_or_gri_authorized:false,
    public_delivery_authorized:false,
    payment_authorized:false,
    no_raw_publisher_material_granted:true,
    attribution_obligations_unaffected:true,
  });
}
