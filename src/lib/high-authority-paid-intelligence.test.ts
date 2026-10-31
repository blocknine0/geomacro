import {describe,expect,it} from "vitest";
import {
  assertHighAuthorityPaidIntelligenceScope,
  extractQualifiedFiveFieldEvent,
  HIGH_AUTHORITY_FIVE_EVENT_FIELDS,
} from "./high-authority-paid-intelligence";

const qualified=()=>({
  deliverable:true,ineligible_source_ids:[],
  source_contracts:[{
    source_id:"us_bls_public_domain_cpi_u_unadjusted_v1",
    commercial_usage_status:"DERIVED_ONLY",attribution_required:false,
  }],
  subjects:[{required_source_ids:["us_bls_public_domain_cpi_u_unadjusted_v1"]}],
});
describe("High-authority first paid launch (no payment)",()=>{
  it("admits an already-qualified official source but never confers rights on its own",()=>{
    expect(()=>assertHighAuthorityPaidIntelligenceScope(qualified())).not.toThrow();
    expect(()=>assertHighAuthorityPaidIntelligenceScope({...qualified(),deliverable:false}))
      .toThrow("PAID_AUTHORITY_DELIVERABILITY_NOT_PROVEN");
  });
  it("rejects generic, missing, attributed or blended source rights",()=>{
    expect(()=>assertHighAuthorityPaidIntelligenceScope({...qualified(),source_contracts:[]}))
      .toThrow();
    expect(()=>assertHighAuthorityPaidIntelligenceScope({...qualified(),subjects:[
      {required_source_ids:["unknown"]}
    ]})).toThrow("PAID_AUTHORITY_SOURCE_NOT_PREQUALIFIED");
    expect(()=>assertHighAuthorityPaidIntelligenceScope({...qualified(),source_contracts:[
      ...qualified().source_contracts,
      {source_id:"unknown",commercial_usage_status:"COMMERCIAL_OK",attribution_required:false},
    ]})).toThrow("PAID_AUTHORITY_ADDITIONAL_SOURCE_NOT_PREQUALIFIED");
    expect(()=>assertHighAuthorityPaidIntelligenceScope({...qualified(),source_contracts:[
      {...qualified().source_contracts[0],attribution_required:true},
    ]})).toThrow();
  });
  it("emits exactly the five verified event fields and no source URL",()=>{
    const event={
      source_id:"us_bls_public_domain_cpi_u_unadjusted_v1",
      headline:"BLS confirms a documented monthly statistical release",
      event_timestamp:"2026-10-30T12:00:00Z",
      what_happened:"An original statistical release was published.",
      why_it_matters:"The verified release provides an official macroeconomic reference.",
      original_event_timestamp_verified:true,
      independent_same_event_verified:true,
      item_commercial_rights_verified:true,
    };
    const result=extractQualifiedFiveFieldEvent(event,Date.parse("2026-10-31T00:00:00Z"));
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toEqual(HIGH_AUTHORITY_FIVE_EVENT_FIELDS);
    for(const field of HIGH_AUTHORITY_FIVE_EVENT_FIELDS)
      expect(typeof result![field]).toBe("string");
    expect(extractQualifiedFiveFieldEvent({...event,independent_same_event_verified:false})).toBeNull();
    expect(extractQualifiedFiveFieldEvent({...event,item_commercial_rights_verified:false})).toBeNull();
    expect(extractQualifiedFiveFieldEvent({...event,source_id:"unknown"})).toBeNull();
    expect(extractQualifiedFiveFieldEvent({...event,event_timestamp:"2026-10-30"})).toBeNull();
    expect(extractQualifiedFiveFieldEvent({...event,why_it_matters:""})).toBeNull();
    expect(extractQualifiedFiveFieldEvent({...event,event_timestamp:"2027-10-30T12:00:00Z"},
      Date.parse("2026-10-31T00:00:00Z"))).toBeNull();
  });
});
