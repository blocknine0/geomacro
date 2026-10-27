import { describe, expect, it } from "vitest";
import { privateQualificationMetadata } from "../lib/private-qualification-metadata";
import type { StructuralObservation } from "../lib/structural-context.server";

const row = {
  observation_id:"obs1",source_id:"issuer1",source_record_id:"raw1",
  country_iso3:"IND",partner_country_iso3:null,dimension:"external_fx",metric:"reporting_fx",
  observed_at:"2026-10-20T00:00:00.000Z",published_at:"2026-10-21T00:00:00.000Z",
  retrieved_at:"2026-10-27T12:00:00.000Z",value_numeric:1,value_text:null,
  unit:"percent",event_type:null,signal_type:null,source_url:null,
  parser_version:"v1",methodology_status:"evidence",quality_status:"VERIFIED",
  provenance:{},normalized_hash:"a".repeat(64),
} satisfies StructuralObservation;
const options = {
  as_of:"2026-10-27T20:00:00.000Z",
  max_age_seconds:30*86400,
  source_commercial_eligible:true,
  source_verified:true,
  independently_verified_source_families:["issuer-A","issuer-B","issuer-A"],
  corroborating_normalized_hashes:["b".repeat(64),"a".repeat(64)],
};
describe("private qualification contract",()=>{
  it("keeps original publication distinct from retrieval and deduplicates independent issuers",()=>{
    const x=privateQualificationMetadata(row,options);
    expect(x.original_published_at).toBe("2026-10-21T00:00:00.000Z");
    expect(x.observed_at).toBe("2026-10-20T00:00:00.000Z");
    expect(x.freshness.status).toBe("CURRENT");
    expect(x.source_independence).toBe("CORROBORATED_INDEPENDENT");
    expect(x.independent_source_family_count).toBe(2);
    expect(x.corroborating_evidence_count).toBe(1);
    expect(x.eligibility).toBe("ELIGIBLE");
    expect(x.provenance.internal_traceable).toBe(true);
  });
  it("fails closed without signed source verification",()=>{
    const x=privateQualificationMetadata(row,{...options,source_verified:null,independently_verified_source_families:[]});
    expect(x.eligibility).toBe("NOT_ESTABLISHED");
    expect(x.source_independence).toBe("NOT_ESTABLISHED");
  });
  it("cannot upgrade old evidence by refreshing it",()=>{
    const x=privateQualificationMetadata({...row,observed_at:"2025-01-01T00:00:00Z",
      published_at:null,retrieved_at:options.as_of},{...options,max_age_seconds:3600});
    expect(x.freshness.status).toBe("STALE");
    expect(x.eligibility).toBe("INELIGIBLE");
  });
  it("blocks rights-disabled or unqualified quality states",()=>{
    expect(privateQualificationMetadata(row,{...options,source_commercial_eligible:false}).eligibility).toBe("INELIGIBLE");
    expect(privateQualificationMetadata({...row,quality_status:"PENDING_REVIEW"},{...options}).eligibility).toBe("INELIGIBLE");
  });
  it("does not fabricate original publication for undated observations",()=>{
    const x=privateQualificationMetadata({...row,observed_at:null,published_at:null},options);
    expect(x.original_published_at).toBeNull();expect(x.freshness.status).toBe("UNKNOWN");
    expect(x.eligibility).toBe("NOT_ESTABLISHED");
  });
});
