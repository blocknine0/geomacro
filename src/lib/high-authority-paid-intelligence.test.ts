import {describe,expect,it} from "vitest";
import {sanitizePublicPaidOutput,assertPublicPaidOutputBoundary} from "./public-paid-output-boundary";
import {
  assertHighAuthorityPaidIntelligenceScope,
  extractQualifiedFiveFieldEvent,
  HIGH_AUTHORITY_FIVE_EVENT_FIELDS,
  assertPaidIntelligenceEventFieldCompleteness,
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

describe("prequote five-field completeness",()=>{
  const event={
    headline:"Verified official event",
    source_authority:"US Bureau of Labor Statistics — CPI-U unadjusted",
    event_timestamp:"2026-10-23T12:00:00Z",
    what_happened:"An independently verified event occurred.",
    why_it_matters:"This event has a verified economic relevance.",
  };
  it("admits structural-only states and exact complete events",()=>{
    expect(()=>assertPaidIntelligenceEventFieldCompleteness({
      current_state:[{developments:[]}]
    })).not.toThrow();
    expect(()=>assertPaidIntelligenceEventFieldCompleteness({
      current_state:[{developments:[{qualified_five_field_event:event}]}]
    })).not.toThrow();
  });
  it("rejects a claimed event with any missing field or future clock",()=>{
    expect(()=>assertPaidIntelligenceEventFieldCompleteness({
      current_state:[{developments:[{event_id:"a"}]}]
    })).toThrow("PAID_EVENT_FIVE_FIELDS_REQUIRED");
    expect(()=>assertPaidIntelligenceEventFieldCompleteness({
      current_state:[{developments:[{qualified_five_field_event:{...event,why_it_matters:""}}]}]
    })).toThrow("PAID_EVENT_FIVE_FIELDS_INVALID");
    expect(()=>assertPaidIntelligenceEventFieldCompleteness({
      current_state:[{developments:[{qualified_five_field_event:{...event,event_timestamp:"2099-01-01T00:00:00Z"}}]}]
    })).toThrow("PAID_EVENT_ORIGINAL_TIMESTAMP_UNVERIFIED");
  });
});

describe("only licensed qualified event authority survives the paid sanitizer",()=>{
  it("keeps the exact approved label and removes upstream identity",()=>{
    const payload={current_state:[{developments:[{
      qualified_five_field_event:{
        headline:"Official item",
        source_authority:"US Geological Survey — Mineral Commodity Summaries 2026 (pinned CC0)",
        event_timestamp:"2026-10-23T12:00:00Z",
        what_happened:"An official event has been proven.",
        why_it_matters:"A verified observation is relevant.",
      },
      source_id:"private_source_identity",
      source_url:"https://publisher.invalid",
    }]}]};
    const sanitized=sanitizePublicPaidOutput(payload,{rejectEmbeddedLinks:true});
    expect(sanitized.current_state[0].developments[0].qualified_five_field_event.source_authority)
      .toBe(payload.current_state[0].developments[0].qualified_five_field_event.source_authority);
    expect(sanitized.current_state[0].developments[0]).not.toHaveProperty("source_id");
    expect(sanitized.current_state[0].developments[0]).not.toHaveProperty("source_url");
    expect(()=>assertPublicPaidOutputBoundary(sanitized)).not.toThrow();
  });
  it("does not grant arbitrary source labels or source_authority elsewhere",()=>{
    const raw={source_authority:"US Geological Survey — Mineral Commodity Summaries 2026 (pinned CC0)",
      current_state:[{developments:[{qualified_five_field_event:{
        source_authority:"Unapproved outlet",
      }}]}]};
    const sanitized=sanitizePublicPaidOutput(raw,{rejectEmbeddedLinks:true});
    expect(sanitized).not.toHaveProperty("source_authority");
    expect(sanitized.current_state[0].developments[0].qualified_five_field_event)
      .not.toHaveProperty("source_authority");
  });
});
