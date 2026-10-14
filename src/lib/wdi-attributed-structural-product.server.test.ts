import { createHash } from "node:crypto";
import { describe,it,expect } from "vitest";
import { assertAttributedWdiStructuralProduct, buildAttributedWdiStructuralProduct,
  certifiedWdiAttributionRights, preparePinnedChinaWdiStructuralNoFunds } from "./wdi-attributed-structural-product.server";
import type { B2CommercialSourceRight } from "./b2-live.server";

const rights:B2CommercialSourceRight={
  source_id:"world_bank_indicators",category:"MACRO",
  certification_state:"CERTIFIED",commercial_usage_status:"DERIVED_ONLY",
  enabled_for_ingestion:true,enabled_for_commercial_signals:true,
  raw_redistribution_allowed:false,attribution_required:true,licence_name:"CC BY 4.0",
};
const privatePair=()=>{
  const country_iso3="CHN",indicator="FP.CPI.TOTL.ZG";
  const latest_observation_year=2025,previous_observation_year=2024;
  const latest_annual_pct=1.2,previous_annual_pct=2.1;
  return {
    country_iso3,indicator,latest_observation_year,previous_observation_year,
    latest_annual_pct,previous_annual_pct,
    annual_rate_change_percentage_points:-0.9,
    source_observation_sha256:createHash("sha256").update(JSON.stringify([
      country_iso3,indicator,latest_observation_year,latest_annual_pct,
      previous_observation_year,previous_annual_pct])).digest("hex"),
    observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS" as const,
    publisher_original_release_date_verified:false as const,
    derived_commercial_rights_verified:false as const,
    risk_score_verified:false as const,paid_delivery_allowed:false as const,
  };
};
const input=()=>({
  country_iso3:"CHN" as const,
  indicator:"FP.CPI.TOTL.ZG" as const,
  source_api_id:"2" as const,
  pair:privatePair(),
  lastupdated:"2026-09-30",
  checked_at:"2026-10-13T19:00:00.000Z",
  query_plan_hash:"c".repeat(64),
  rights_rows:[rights],
  max_age_seconds:400*86400,
});
describe("WDI narrow attributed structural product: synthetic regression only",()=>{
  it("binds fixed indicator credit, data, change, uncertainty and canonical SHA256",()=>{
    const a=buildAttributedWdiStructuralProduct(input());
    const b=buildAttributedWdiStructuralProduct(input());
    expect(a).toEqual(b);
    expect(a.calculated_change.percentage_points).toBe(-0.9);
    expect(a.data_attribution.terms).toBe("CC BY 4.0");
    expect(a.data_attribution.material_uris).toEqual([
      "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG"]);
    expect(a.gro_generated).toBe(false);
    expect(a.integrity.signature_status).toBe("UNSIGNED_NOT_A_GRO");
    expect(()=>assertAttributedWdiStructuralProduct(a)).not.toThrow();
    expect(certifiedWdiAttributionRights([rights]).receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
    const alias=certifiedWdiAttributionRights([{...rights,category:"macro"}]);
    expect(alias.eligible).toBe(true);
    expect(alias.receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("fails closed on missing, unlicensed, miscertified or misattributed rights",()=>{
    expect(()=>buildAttributedWdiStructuralProduct({...input(),rights_rows:null}))
      .toThrow("WDI_RIGHTS_RECEIPT_UNAVAILABLE");
    for(const change of [
      {attribution_required:false},{certification_state:"PENDING"},
      {licence_name:"CC BY-NC 4.0"},{enabled_for_commercial_signals:false},
      {source_id:"world_bank_qpsd"},
      {category:"GEOPOLITICS"},{category:"Macro"},
      {commercial_usage_status:"REVIEW_REQUIRED"},
      {enabled_for_ingestion:false},
    ]){
      expect(()=>buildAttributedWdiStructuralProduct({...input(),
        rights_rows:[{...rights,...change}]})).toThrow();
    }
  });
  it("rejects wrong macro categories without weakening valid WDI rights",()=>{
    for(const category of ["GEOPOLITICS","Macro","CRITICAL_MINERALS"]){
      const result=certifiedWdiAttributionRights([{...rights,category}]);
      expect(result).toEqual({eligible:false,
        reason:"WDI_RIGHTS_CONTRACT_MISMATCH",receipt_sha256:null});
    }
    expect(certifiedWdiAttributionRights([{...rights,category:"MACRO"}]).eligible).toBe(true);
  });
  it("rejects wrong WDI API contract, forged source fact hash and nonconsecutive years",()=>{
    expect(()=>buildAttributedWdiStructuralProduct({...input(),source_api_id:"3" as "2"}))
      .toThrow("WDI_SOURCE_SCOPE_MISMATCH");
    expect(()=>buildAttributedWdiStructuralProduct({...input(),pair:{
      ...privatePair(),source_observation_sha256:"a".repeat(64)}}))
      .toThrow("WDI_OBSERVATION_INTEGRITY_FAILURE");
    expect(()=>buildAttributedWdiStructuralProduct({...input(),pair:{
      ...privatePair(),previous_observation_year:2023}}))
      .toThrow("WDI_UNTRUSTED_ANNUAL_PAIR");
  });
  it("rejects impossible release clock and too-strict annual freshness",()=>{
    expect(()=>buildAttributedWdiStructuralProduct({...input(),lastupdated:"2027-01-01"}))
      .toThrow("WDI_DATASET_CLOCK_INVALID");
    expect(()=>buildAttributedWdiStructuralProduct({...input(),max_age_seconds:86400}))
      .toThrow("WDI_ANNUAL_REFERENCE_PERIOD_STALE");
  });
  it("prepares the exact attributed product using mock-only official source=2 and B2 rights",async()=>{
    const pair=privatePair();
    const r=await preparePinnedChinaWdiStructuralNoFunds({
      query_plan_hash:"c".repeat(64),max_age_seconds:400*86400,
    },{
      now:new Date("2026-10-13T19:00:00Z"),
      readRights:async()=>[rights],
      readPair:async()=>({status:"VALID_ANNUAL_CHANGE",source_api_id:"2",
        lastupdated:"2026-09-30",pair}),
    });
    expect(r.status).toBe("READY_FOR_PRODUCT_INTEGRATION");
    if(r.status!=="READY_FOR_PRODUCT_INTEGRATION")return;
    expect(r.product.calculated_change.percentage_points).toBe(-0.9);
    expect(()=>assertAttributedWdiStructuralProduct(r.product)).not.toThrow();
    expect(r.rights_receipt_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("never claims readiness without real rights or an exact WDI source=2",async()=>{
    const base={query_plan_hash:"c".repeat(64),max_age_seconds:400*86400};
    const pair=privatePair();
    const readPair=async()=>({status:"VALID_ANNUAL_CHANGE" as const,
      source_api_id:"2" as const,lastupdated:"2026-09-30",pair});
    const a=await preparePinnedChinaWdiStructuralNoFunds(base,{
      now:new Date("2026-10-13T19:00:00Z"),readPair,readRights:async()=>null});
    expect(a).toEqual({status:"BLOCKED",code:"WDI_RIGHTS_RECEIPT_UNAVAILABLE"});
    const b=await preparePinnedChinaWdiStructuralNoFunds(base,{
      now:new Date("2026-10-13T19:00:00Z"),readPair:async()=>({
        ...await readPair(),source_api_id:null}),readRights:async()=>[rights]});
    expect(b).toEqual({status:"BLOCKED",code:"WDI_OFFICIAL_SOURCE2_PAIR_UNAVAILABLE"});
  });
  it("rejects altered values, removed or changed CC BY material credit after hashing",()=>{
    const value=buildAttributedWdiStructuralProduct(input());
    expect(()=>assertAttributedWdiStructuralProduct({...value,observations:[
      value.observations[0],{...value.observations[1],annual_percent:333}]}))
      .toThrow("WDI_PRODUCT_INTEGRITY_MISMATCH");
    expect(()=>assertAttributedWdiStructuralProduct({...value,data_attribution:{
      ...value.data_attribution,credit:"Anonymous"}}))
      .toThrow("WDI_PRODUCT_BOUNDARY_INVALID");
    expect(()=>assertAttributedWdiStructuralProduct({...value,integrity:{
      ...value.integrity,payload_hash_sha256:"0".repeat(64)}}))
      .toThrow("WDI_PRODUCT_INTEGRITY_MISMATCH");
  });
});
