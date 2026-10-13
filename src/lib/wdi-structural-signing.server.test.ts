import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildAttributedWdiStructuralProduct } from "./wdi-attributed-structural-product.server";
import { signWdiStructuralAnswer, verifyWdiStructuralAnswer } from "./wdi-structural-signing.server";
import { prepareVerifiedChinaCpiStructuralAnswer } from "./wdi-attributed-structural-product.server";
import { buildAgentQueryPlan } from "./agent-query-plan";
import type { B2CommercialSourceRight } from "./b2-live.server";
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const material={
  key_id:"wdi-structural-test-2026",
  private_key_pkcs8_b64:privateKey.export({format:"der",type:"pkcs8"}).toString("base64"),
  public_key_spki_b64:publicKey.export({format:"der",type:"spki"}).toString("base64"),
};
const plan="a".repeat(64),receipt="b".repeat(64);
const row:B2CommercialSourceRight={
  source_id:"world_bank_indicators",category:"macro",
  certification_state:"CERTIFIED",commercial_usage_status:"DERIVED_ONLY",
  enabled_for_ingestion:true,enabled_for_commercial_signals:true,
  raw_redistribution_allowed:false,attribution_required:true,licence_name:"CC BY 4.0",
};
function original(){
  const latest=0.0595646916565402,previous=0.218128938439177;
  const delta=Math.round((latest-previous)*1e5)/1e5;
  const data=["CHN","FP.CPI.TOTL.ZG",2025,latest,2024,previous];
  return buildAttributedWdiStructuralProduct({
    country_iso3:"CHN",indicator:"FP.CPI.TOTL.ZG",source_api_id:"2",
    lastupdated:"2026-10-08",checked_at:"2026-10-13T20:00:00Z",
    query_plan_hash:plan,rights_rows:[row],max_age_seconds:400*86400,
    pair:{
      country_iso3:"CHN",indicator:"FP.CPI.TOTL.ZG",
      latest_observation_year:2025,previous_observation_year:2024,
      latest_annual_pct:latest,previous_annual_pct:previous,
      annual_rate_change_percentage_points:delta,
      source_observation_sha256:createHash("sha256")
        .update(JSON.stringify(data)).digest("hex"),
      observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
      publisher_original_release_date_verified:false,
      derived_commercial_rights_verified:false,
      risk_score_verified:false,paid_delivery_allowed:false,
    },
  });
}
const keys=()=>({[material.key_id]:{
  public_key_spki_b64:material.public_key_spki_b64,status:"active" as const,
}});
const signed=()=>signWdiStructuralAnswer({
  product:original(),certified_rights_receipt_sha256:receipt,
  query_plan_hash:plan,material,
});
describe("standalone WDI answer Ed25519 (synthetic signing keys, never production)",()=>{
  it("verifies exact signed WDI facts, fixed licence credit and pinned query+rights",()=>{
    const proof=signed();
    expect(proof.integrity.signature_scheme).toBe("Ed25519");
    expect(proof.integrity.gro_signature).toBe(false);
    expect(verifyWdiStructuralAnswer(proof,keys(),
      {query_plan_hash:plan,certified_rights_receipt_sha256:receipt}))
      .toEqual({valid:true,reason:"VERIFIED"});
  });
  it("rejects untrusted, revoked, unregistered, time-invalid keys",()=>{
    const proof=signed(), binding={query_plan_hash:plan,certified_rights_receipt_sha256:receipt};
    expect(verifyWdiStructuralAnswer(proof,{},binding).valid).toBe(false);
    expect(verifyWdiStructuralAnswer(proof,{
      [material.key_id]:{...keys()[material.key_id],status:"revoked"},
    },binding).valid).toBe(false);
    expect(verifyWdiStructuralAnswer(proof,{
      [material.key_id]:{...keys()[material.key_id],not_after:"2026-10-12T00:00:00Z"},
    },binding).valid).toBe(false);
  });
  it("rejects post-signing value, attribution, query binding and rights substitution",()=>{
    const proof=signed(), binding={query_plan_hash:plan,certified_rights_receipt_sha256:receipt};
    expect(verifyWdiStructuralAnswer(proof,keys(),{
      ...binding,certified_rights_receipt_sha256:"c".repeat(64)}).valid).toBe(false);
    expect(verifyWdiStructuralAnswer(proof,keys(),{
      ...binding,query_plan_hash:"d".repeat(64)}).valid).toBe(false);
    expect(verifyWdiStructuralAnswer({...proof,structural_product:{
      ...proof.structural_product,observations:[
        proof.structural_product.observations[0],
        {year:2025,annual_percent:22},
      ],
    }},keys(),binding).valid).toBe(false);
    expect(verifyWdiStructuralAnswer({...proof,structural_product:{
      ...proof.structural_product,data_attribution:{
        ...proof.structural_product.data_attribution,credit:"no licence credit" as typeof proof.structural_product.data_attribution.credit,
      },
    }},keys(),binding).valid).toBe(false);
  });
  it("prevents GRO domain confusion and forged signature/public key",()=>{
    const p=signed(),binding={query_plan_hash:plan,certified_rights_receipt_sha256:receipt};
    expect(verifyWdiStructuralAnswer({...p,integrity:{
      ...p.integrity,signature_base64:"AA==",
    }},keys(),binding).valid).toBe(false);
    expect(verifyWdiStructuralAnswer({...p,integrity:{
      ...p.integrity,gro_signature:true as false,
    }},keys(),binding).valid).toBe(false);
    expect(()=>signWdiStructuralAnswer({
      product:original(),certified_rights_receipt_sha256:receipt,
      query_plan_hash:plan,material:{...material,public_key_spki_b64:"AA=="},
    })).toThrow();
  });
});


describe("existing exact China CPI query plan to no-funds signed preparation",()=>{
  const plan=buildAgentQueryPlan({
    question:"China CPI inflation annual structural baseline",
    subjects:[{type:"country",country_iso3:"CHN"}],
    topics:["macro_risk"],delivery_tier:"structural_baseline",
    fulfillment_mode:"published_only",max_age_seconds:400*86400,detail:"compact",
  });
  const makePair=()=>{
    const latest=0.0595646916565402,prev=0.218128938439177;
    return {
      country_iso3:"CHN",indicator:"FP.CPI.TOTL.ZG",
      latest_observation_year:2025,previous_observation_year:2024,
      latest_annual_pct:latest,previous_annual_pct:prev,
      annual_rate_change_percentage_points:-0.15856,
      source_observation_sha256:createHash("sha256")
        .update(JSON.stringify(["CHN","FP.CPI.TOTL.ZG",2025,latest,2024,prev])).digest("hex"),
      observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS" as const,
      publisher_original_release_date_verified:false as const,
      derived_commercial_rights_verified:false as const,
      risk_score_verified:false as const,
      paid_delivery_allowed:false as const,
    };
  };
  it("narrows only explicit China annual CPI macro_risk to one module",()=>{
    expect(plan.required_modules).toEqual(["macro_monetary"]);
    const legacy=buildAgentQueryPlan({
      subjects:[{type:"country",country_iso3:"CHN"}],
      topics:["macro_risk"],fulfillment_mode:"published_only",
    });
    expect(legacy.required_modules).toEqual(["macro_monetary","sovereign_fiscal"]);
  });
  it("rehearses exact source/receipt/signature/query verification without payments",async()=>{
    const result=await prepareVerifiedChinaCpiStructuralAnswer(plan,{
      now:new Date("2026-10-13T20:00:00Z"),
      readPair:async()=>({status:"VALID_ANNUAL_CHANGE",pair:makePair(),
        source_api_id:"2",lastupdated:"2026-10-08"}),
      readRights:async()=>[row],signingMaterial:material,verifyKeys:keys(),
    });
    expect(result.status).toBe("PREPARED_NO_FUNDS_ONLY");
    if(result.status!=="PREPARED_NO_FUNDS_ONLY")return;
    expect(result.payment_authorized).toBe(false);
    expect(result.signed_answer.query_plan_hash).toBe(plan.query_plan_hash);
    expect(result.signed_answer.structural_product.data_attribution.credit)
      .toBe("World Bank, World Development Indicators");
    expect(verifyWdiStructuralAnswer(result.signed_answer,keys(),{
      query_plan_hash:plan.query_plan_hash,
      certified_rights_receipt_sha256:result.rights_receipt_sha256,
    }).valid).toBe(true);
  });
  it("fails closed when source=2 is good but the real rights reader has no receipt",async()=>{
    const result=await prepareVerifiedChinaCpiStructuralAnswer(plan,{
      now:new Date("2026-10-13T20:00:00Z"),
      readPair:async()=>({status:"VALID_ANNUAL_CHANGE",pair:makePair(),
        source_api_id:"2",lastupdated:"2026-10-08"}),
      readRights:async()=>null,signingMaterial:material,verifyKeys:keys(),
    });
    expect(result).toEqual({status:"BLOCKED",code:"WDI_RIGHTS_RECEIPT_UNAVAILABLE"});
  });
});
