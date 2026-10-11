import { describe, expect, it, vi } from "vitest";
import { checkPrivateOnDemandMacroRights } from "./on-demand-private-macro-rights.server";
import type { PrivateOnDemandMacroDriver } from "./on-demand-private-macro-drivers.server";
import type { B2CommercialSourceRight } from "./b2-live.server";

function driver(overrides: Partial<PrivateOnDemandMacroDriver> = {}):PrivateOnDemandMacroDriver {
  return {
    schema:"geomacro.private-annual-macro-driver.v1",
    country_iso3:"IND",driver:"inflation",direction:"DECREASING",
    latest_observation_year:2025,previous_observation_year:2024,
    change_percentage_points:-0.9,
    cause:"Annual consumer price inflation decreased between 2024 and 2025.",
    source_observation_sha256:"a".repeat(64),
    observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
    methodology_status:"DIRECTIONAL_ONLY_NOT_A_CALIBRATED_RISK_SCORE",
    source_commercial_rights_verified:false,
    publisher_release_date_verified:false,
    confidence_calibrated:false,score_verified:false,signed:false,
    payment_eligible:false,...overrides,
  };
}
function right(overrides:Partial<B2CommercialSourceRight> = {}):B2CommercialSourceRight {
  return {
    source_id:"world_bank_indicators",category:"macro",
    certification_state:"CERTIFIED",commercial_usage_status:"DERIVED_ONLY",
    enabled_for_ingestion:true,enabled_for_commercial_signals:true,
    raw_redistribution_allowed:false,attribution_required:false,
    licence_name:"Approved derived-use licence",...overrides,
  };
}
const reader=(rows:B2CommercialSourceRight[]|null)=>
  vi.fn(async()=>rows);

describe("private B2-only macro derived-use rights gate",()=>{
  it("skips rights reads entirely if there is no evidence or if the candidate claims signing/payment",async()=>{
    const readRights=reader([right()]);
    expect(await checkPrivateOnDemandMacroRights([],{readRights}))
      .toEqual({status:"NO_ANNUAL_EVIDENCE",checked_driver_count:0,
        rights_verified_driver_count:0,signed_intelligence_verified:false,
        payment_eligible:false,required_data_attribution:null});
    for (const forged of [
      driver({signed:true as false}),
      driver({payment_eligible:true as false}),
      driver({source_commercial_rights_verified:true as false}),
      driver({score_verified:true as false}),
      driver({source_observation_sha256:"not-a-hash"}),
    ]) {
      const proof=await checkPrivateOnDemandMacroRights([forged],{readRights});
      expect(proof.status).toBe("UNVERIFIED_ANNUAL_EVIDENCE");
      expect(proof.rights_verified_driver_count).toBe(0);
      expect(proof.payment_eligible).toBe(false);
    }
    expect(readRights).not.toHaveBeenCalled();
  });

  it("reuses existing certified-source policy and a single rights read for two private macro drivers",async()=>{
    const readRights=reader([right()]);
    const out=await checkPrivateOnDemandMacroRights([
      driver(),driver({driver:"real_gdp_growth"}),
    ],{readRights});
    expect(readRights).toHaveBeenCalledTimes(1);
    expect(out).toEqual({
      status:"DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT",
      checked_driver_count:2,rights_verified_driver_count:2,
      signed_intelligence_verified:false,payment_eligible:false,
      required_data_attribution:null,
    });
    const serialized=JSON.stringify(out);
    expect(serialized).not.toContain("world_bank_indicators");
    expect(serialized).not.toContain("Approved derived-use licence");
    expect(serialized).not.toContain("source_observation_sha256");
  });

  it.each([
    ["missing rights",null,"RIGHTS_RECEIPT_UNAVAILABLE"],
    ["unknown issuer",[right({source_id:"wrong_id"})],"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"],
    ["uncertified",[right({certification_state:"PENDING"})],"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"],
    ["unapproved commercial use",[right({commercial_usage_status:"RESEARCH_ONLY"})],"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"],
    ["ingestion disabled",[right({enabled_for_ingestion:false})],"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"],
    ["commercial signals disabled",[right({enabled_for_commercial_signals:false})],"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"],
    ["licence missing",[right({licence_name:null})],"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"],
    ["unknown licence needs attribution",[right({attribution_required:true,licence_name:"Unreviewed proprietary"})],"ATTRIBUTION_NOT_SUPPORTED_BY_PRIVATE_OUTPUT"],
    ["duplicate issuer records",[right(),right()],"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"],
  ] as const)("fails closed when %s",async(_name,rows,status)=>{
    const out=await checkPrivateOnDemandMacroRights([driver()],{readRights:reader(rows as B2CommercialSourceRight[]|null)});
    expect(out.status).toBe(status);
    expect(out.rights_verified_driver_count).toBe(0);
    expect(out.payment_eligible).toBe(false);
    expect(out.signed_intelligence_verified).toBe(false);
  });

  it("prepares exact legally-required WDI CC BY 4.0 credit with both material links, but never marks signed or payable",async()=>{
    const rights=await checkPrivateOnDemandMacroRights(
      [driver(),driver({driver:"real_gdp_growth"})],
      {readRights:reader([right({attribution_required:true,licence_name:"CC BY 4.0",
        commercial_usage_status:"COMMERCIAL_OK",raw_redistribution_allowed:true})])});
    expect(rights.status).toBe("DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT");
    expect(rights.rights_verified_driver_count).toBe(2);
    expect(rights.required_data_attribution).toEqual({
      schema:"geomacro.approved-derived-data-attribution.v1",
      credit:"World Bank, World Development Indicators",
      terms:"CC BY 4.0",
      terms_uri:"https://creativecommons.org/licenses/by/4.0/",
      material_uris:[
        "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG",
        "https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG",
      ],
      modifications:"Geomacro adapted annual indicator observations into derived analysis; World Bank does not endorse the analysis.",
    });
    expect(rights.signed_intelligence_verified).toBe(false);
    expect(rights.payment_eligible).toBe(false);
  });

  it("fails closed without a Supabase fallback if B2 lookup fails",async()=>{
    const readRights=vi.fn(async():Promise<B2CommercialSourceRight[]|null>=>{throw Error("B2 quota exhausted");});
    const out=await checkPrivateOnDemandMacroRights([driver()],{readRights});
    expect(out.status).toBe("RIGHTS_RECEIPT_UNAVAILABLE");
    expect(readRights).toHaveBeenCalledTimes(1);
    expect(out.payment_eligible).toBe(false);
  });

  it("rejects cross-country or duplicated driver bundles before any network request",async()=>{
    const readRights=reader([right()]);
    for(const cases of [
      [driver(),driver()],
      [driver(),driver({country_iso3:"CHN",driver:"real_gdp_growth"})],
      [driver({previous_observation_year:2023})],
    ]){
      expect((await checkPrivateOnDemandMacroRights(cases,{readRights})).status)
        .toBe("UNVERIFIED_ANNUAL_EVIDENCE");
    }
    expect(readRights).not.toHaveBeenCalled();
  });
});
