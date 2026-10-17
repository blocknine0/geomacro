import {describe,expect,it} from "vitest";
import {issueGeomacroOwnedOutputLicense,
  GEOMACRO_OWNER_OUTPUT_LICENSE_ID} from "./geomacro-owned-derived-output-license.server";
import {canonicalRiskObjectJson} from "./risk-object-signing.server";
import {createHash} from "node:crypto";

function minimal(){
  return {
    schema:"geomacro.private-single-original-factual-handoff.v1",
    authority_profile:"GEOMACRO_SINGLE_ORIGINAL_FACTS_RIGHTS_PRIVATE_V1",
    product_type:"ISSUER_FACTUAL_OBSERVATION_UNSCORED",
    category:"macro",country_iso3:"USA",
    event_type:"central_bank_policy",
    original_source_native_at:"2026-10-18T08:00:00Z",
    original_verified_html_sha256:"a".repeat(64),
    exact_event_sha256:"b".repeat(64),
    dual_authority_proof_sha256:"c".repeat(64),
    qualified_until:"2026-10-18T09:00:00Z",
    original_source_count:1,independent_corroboration_verified:false,
    independently_scored_risk:false,severity:null,score:null,
    derived_prediction:null,commercial_gro_signed:false,
    public_published:false,gri_country_category_certified:false,
    chargeable:false,payment_authorized:false,
    supabase_writes:0,b2_writes:0,d1_writes:0,
  };
}
describe("Geomacro owner declaration licenses only its own original derived outputs",()=>{
  it("binds the policy to the exact safe structured output, without upstream or paid rights",()=>{
    const payload=minimal();
    const receipt=issueGeomacroOwnedOutputLicense(payload);
    expect(receipt.schema).toBe(GEOMACRO_OWNER_OUTPUT_LICENSE_ID);
    expect(receipt.owner_output_use_granted).toBe(true);
    expect(receipt.rights_scope).toBe("ONLY_RIGHTS_LEGALLY_HELD_BY_GEOMACRO");
    expect(receipt.source_use_permission_granted).toBe(false);
    expect(receipt.third_party_rights_warranted).toBe(false);
    expect(receipt.attribution_obligations_unaffected).toBe(true);
    expect(receipt.gro_or_gri_authorized).toBe(false);
    expect(receipt.public_delivery_authorized).toBe(false);
    expect(receipt.payment_authorized).toBe(false);
    expect(receipt.output_sha256).toBe(createHash("sha256")
      .update(canonicalRiskObjectJson(payload),"utf8").digest("hex"));
    expect(JSON.stringify(receipt)).not.toMatch(/federalreserve|headline|licence_document_sha256/u);
  });
  it("rejects publisher text, URLs and unapproved additional fields",()=>{
    for(const extra of [
      {original_article_url:"https://www.federalreserve.gov"},
      {raw_source_title:"Copyrighted publisher title"},
      {news_html:"<html>publisher text</html>"},
      {attribution_required:false},
      {self_granted_upstream_rights:true},
    ])expect(()=>issueGeomacroOwnedOutputLicense({...minimal(),...extra})).toThrow();
  });
  it("cannot self-grant commercial GRO scoring or customer billing",()=>{
    for(const changed of [
      {score:42},{severity:77},{derived_prediction:"up"},
      {commercial_gro_signed:true},{gri_country_category_certified:true},
      {payment_authorized:true},{chargeable:true},{public_published:true},
      {independent_corroboration_verified:true},{original_source_count:2},
      {supabase_writes:1},{b2_writes:1},{d1_writes:1},
    ])expect(()=>issueGeomacroOwnedOutputLicense({...minimal(),...changed})).toThrow();
  });
  it("rejects false provenance, invalid source time and missing proof fields",()=>{
    for(const x of [
      {original_verified_html_sha256:"fake"},
      {exact_event_sha256:null},
      {qualified_until:"2026-10-18T07:00:00Z"},
      {original_source_native_at:"2026-10-18T12:00:00Z"},
      {category:"unknown"},{country_iso3:"US"},
      {authority_profile:"GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1"},
    ])expect(()=>issueGeomacroOwnedOutputLicense({...minimal(),...x})).toThrow();
    const {score,...missing}=minimal();
    expect(()=>issueGeomacroOwnedOutputLicense(missing)).toThrow();
  });
});
