import {describe,expect,it} from "vitest";
import {publicOnDemandSourceHealth} from "./mainnet-intelligence-endpoint.server";
import type {OnDemandCategory,SourceProbe} from "./on-demand-global-discovery.server";

const category:OnDemandCategory="macro";
function row(overrides:Partial<SourceProbe>):SourceProbe{
  return {
    family:"private-publisher-family",
    category,
    attempted:true,
    reachable:true,
    observed_record_count:0,
    publication_clock_verified:false,
    retrieval_state:"NO_MATCHING_RECORDS",
    independent_claim_verified:false,
    derived_commercial_rights_verified:false,
    ...overrides,
  };
}

describe("public on-demand source health",()=>{
  it("distinguishes an exhausted but reachable search from provider outage",()=>{
    const result=publicOnDemandSourceHealth([
      row({family:"private-a"}),row({family:"private-b"}),
    ],[category]);

    expect(result.macro).toMatchObject({
      state:"NO_LEADS_IN_BOUNDED_SEARCH",
      exhaustive:false,
      source_checks_attempted:2,
      source_checks_reachable:2,
      leads_observed:0,
      retryable:false,
    });
  });

  it("surfaces partial outages without hiding reachable providers",()=>{
    const result=publicOnDemandSourceHealth([
      row({family:"private-a"}),
      row({family:"private-b",reachable:false,retrieval_state:"TRANSPORT_UNAVAILABLE"}),
    ],[category]);

    expect(result.macro).toMatchObject({
      state:"PARTIAL_SOURCE_OUTAGE",
      source_checks_attempted:2,
      source_checks_reachable:1,
      transport_unavailable:1,
      retryable:true,
      automatic_retry:false,
    });
  });

  it("does not label access restrictions as generic transport failures",()=>{
    const result=publicOnDemandSourceHealth([
      row({family:"private-a",reachable:false,retrieval_state:"ACCESS_RESTRICTED"}),
      row({family:"private-b",reachable:false,retrieval_state:"ACCESS_RESTRICTED"}),
    ],[category]);

    expect(result.macro).toMatchObject({
      state:"ACCESS_RESTRICTED",
      access_restricted:2,
      transport_unavailable:0,
      retryable:false,
    });
  });

  it("preserves lead and outage counts while exposing no provider identity",()=>{
    const result=publicOnDemandSourceHealth([
      row({family:"private-a",observed_record_count:2,retrieval_state:"RECORDS_OBSERVED"}),
      row({family:"private-b",reachable:false,retrieval_state:"RATE_LIMITED"}),
    ],[category]);
    const encoded=JSON.stringify(result);

    expect(result.macro).toMatchObject({
      state:"LEADS_OBSERVED",
      leads_observed:2,
      rate_limited:1,
      retryable:true,
    });
    expect(encoded).not.toContain("private-publisher-family");
    expect(encoded).not.toContain("private-a");
    expect(encoded).not.toContain("private-b");
  });

  it("marks a category that never received a request",()=>{
    const result=publicOnDemandSourceHealth([], [category]);
    expect(result.macro).toMatchObject({
      state:"NOT_ATTEMPTED_WITHIN_BUDGET",
      source_checks_attempted:0,
      retryable:false,
    });
  });
});
