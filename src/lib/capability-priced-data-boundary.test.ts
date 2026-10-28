import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {assertLockedCapabilityDataBoundary} from "./capability-priced-data-boundary.server";

const row=(type:"country"|"corridor"="country",count=3,modules=1)=>({
  subject:type==="country"?{type,country_iso3:"IND"}:
    {type,origin_country_iso3:"IND",destination_country_iso3:"USA"},
  intelligence:Object.fromEntries(Array.from({length:modules},(_,i)=>[
    "module_"+i,{observations:Array.from({length:count},(_,n)=>({value:n}))},
  ])),
});

const payload=(type:"country"|"corridor"="country",count=3,modules=1):Record<string,unknown>=>({
  execution_authorized:false,
  structural:[row(type,count,modules)],
  current_state:[{risk:null}],
  signed_risk_objects:[],
  risk_gate:[],
  gri_context:null,
});

describe("x402 delivered-data ceiling for exact founder-locked prices",()=>{
  it("allows only compact single-dimension country/corridor digests",()=>{
    expect(()=>assertLockedCapabilityDataBoundary(payload(),"structural_country_digest","standard")).not.toThrow();
    expect(()=>assertLockedCapabilityDataBoundary(payload("corridor"),"structural_corridor_digest","standard")).not.toThrow();
    expect(()=>assertLockedCapabilityDataBoundary(payload("country",4),"structural_country_digest","standard"))
      .toThrow("DETAIL_LIMIT_EXCEEDED");
    expect(()=>assertLockedCapabilityDataBoundary(payload("country",3,2),"structural_country_digest","standard"))
      .toThrow("DIMENSIONS_INVALID");
    expect(()=>assertLockedCapabilityDataBoundary(payload("corridor"),"structural_country_digest","standard"))
      .toThrow("SUBJECT_SCOPE_INVALID");
  });
  it("allows governed profiles to carry more dimensions but not unlimited rows",()=>{
    expect(()=>assertLockedCapabilityDataBoundary(payload("country",12,3),"structural_country_profile","standard")).not.toThrow();
    expect(()=>assertLockedCapabilityDataBoundary(payload("corridor",12,3),"structural_corridor_profile","standard")).not.toThrow();
    expect(()=>assertLockedCapabilityDataBoundary(payload("country",13,2),"structural_country_profile","standard"))
      .toThrow("DETAIL_LIMIT_EXCEEDED");
  });
  it("cannot leak a separately priced signed score, GRI or Risk Gate into a digest",()=>{
    const signed={...payload(),signed_risk_objects:[{object:{risk:{score:90}}}]};
    expect(()=>assertLockedCapabilityDataBoundary(signed,"structural_country_digest","standard"))
      .toThrow("SIGNED_UPSELL_FORBIDDEN");
    const gri={...payload(),gri_context:{score:42}};
    expect(()=>assertLockedCapabilityDataBoundary(gri,"structural_country_digest","standard"))
      .toThrow("SIGNED_UPSELL_FORBIDDEN");
    const state={...payload(),current_state:[{risk:{score:40}}]};
    expect(()=>assertLockedCapabilityDataBoundary(state,"structural_country_digest","standard"))
      .toThrow("RISK_UPSELL_FORBIDDEN");
    const gate={...payload(),risk_gate:[{result:{decision:"review"}}]};
    expect(()=>assertLockedCapabilityDataBoundary(gate,"signed_risk_object","existing_valid_signed"))
      .toThrow("RISK_GATE_UPSELL_FORBIDDEN");
    expect(()=>assertLockedCapabilityDataBoundary(gate,"intelligence_query","focused"))
      .toThrow("RISK_GATE_UPSELL_FORBIDDEN");
    expect(()=>assertLockedCapabilityDataBoundary(gate,"risk_gate_bundle","standard")).not.toThrow();
  });
  it("enforces exact purchased market-watch item ceiling without retroactively changing legacy receipts",()=>{
    const watch=(count:number)=>({items:Array.from({length:count},(_,i)=>({watch_id:String(i)}))});
    expect(()=>assertLockedCapabilityDataBoundary({...payload(),decision_intelligence:[{market_watch:watch(1)}]},
      "structural_country_digest","standard")).not.toThrow();
    expect(()=>assertLockedCapabilityDataBoundary({...payload(),decision_intelligence:[{market_watch:watch(2)}]},
      "structural_country_digest","standard")).toThrow("MARKET_WATCH_TIER_EXCEEDED");
    expect(()=>assertLockedCapabilityDataBoundary({execution_authorized:false,risk_gate:[],
      decision_intelligence:[{market_watch:watch(3)}]},
      "signed_risk_object","existing_valid_signed")).toThrow("MARKET_WATCH_TIER_EXCEEDED");
    expect(()=>assertLockedCapabilityDataBoundary({execution_authorized:false,risk_gate:[],
      decision_intelligence:[{market_watch:watch(5)}]},
      "intelligence_query","complex_multi_source")).not.toThrow();
    expect(()=>assertLockedCapabilityDataBoundary({...payload()},
      "structural_country_digest","standard")).not.toThrow();
  });
  it("refuses fabricated variants and execution privileges",()=>{
    expect(()=>assertLockedCapabilityDataBoundary(payload(),"structural_country_digest","premium"))
      .toThrow("CAPABILITY_PRICE_VARIANT_NOT_APPROVED");
    expect(()=>assertLockedCapabilityDataBoundary({...payload(),execution_authorized:true},"structural_country_digest","standard"))
      .toThrow("DATA_BOUNDARY_INVALID");
  });
  it("guards both immutable quote preparation and frozen-response revalidation",()=>{
    const route=readFileSync("src/lib/capability-x402-offer.server.ts","utf8");
    expect(route).toContain("assertLockedCapabilityDataBoundary(prepared,price.capability,price.variant)");
    expect(route).toContain("assertLockedCapabilityDataBoundary(response,capability,variant)");
    expect(route).toContain("assertPricedStructuredDelivery(prepared,price.capability,price.variant)");
  });
});
