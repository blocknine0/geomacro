import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  qualifyRetrievedOnDemandEvidence, publicOnDemandQualificationStatus,
} from "./on-demand-evidence-qualification.server";
import type {
  OnDemandSearchInput, OnDemandDiscovery, PrivateOriginalCandidate,
  PrivateOfficialMacroChange, PrivatePageDateResult,
} from "./on-demand-global-discovery.server";

const now=new Date("2026-10-14T12:00:00.000Z");
const sha=(s:string)=>createHash("sha256").update(s,"utf8").digest("hex");
const discovery=(search:OnDemandSearchInput):OnDemandDiscovery=>({
  schema:"geomacro.on-demand-global-private-discovery.v1",
  country_iso3:search.country_iso3,categories:search.categories,
  checked_at:now.toISOString(),searched_in_parallel:true,
  network_attempts:3,reached_source_families:1,source_probes:[],
  query_fingerprint_sha256:sha(JSON.stringify(search)),
  status:"DISCOVERY_OBSERVED_NOT_YET_VERIFIED",
  independent_same_event_corroboration_verified:false,
  source_derived_commercial_rights_verified:false,
  signed_derived_intelligence_created:false,payable:false,
  raw_upstream_delivered:false,supabase_requests:0,b2_requests:0,
  settlement_attempted:false,
});
const original=(overrides:Partial<PrivateOriginalCandidate>={}):PrivateOriginalCandidate=>{
  const publisher_family=overrides.publisher_family??"uk_dbt_search_original_page";
  const article_url=overrides.article_url??"https://www.gov.uk/government/news/cornwall-lithium-production";
  return {
    domain:"rare_earth",publisher_family,article_url,
    article_title:"UK lithium production in Cornwall announced",
    feed_item_published_at:null,search_index_original_page_pending:true,
    article_identity_sha256:sha(publisher_family+"|"+article_url),
    first_party_article_url_verified:true,
    source_native_feed_publication_date_verified:false,
    publisher_article_page_date_verified:false,
    independent_same_event_verified:false,
    derived_commercial_rights_verified:false,
    score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
    ...overrides,
  };
};
function fixture(search:OnDemandSearchInput, records:PrivateOriginalCandidate[],
  verifiedCountryName:string|null, date:string|null){
  const pageProof:PrivatePageDateResult={
    attempted:date?1:0,verified:date?1:0,
    verified_candidates:date?[{
      ...records[0],publisher_article_page_date_verified:true as const,
      page_original_published_at:date,
    }]:[],
  };
  return {
    search,discovery:discovery(search),originals:records,
    verifiedCountryName,pageProof,macroChanges:[],now,
  };
}
describe("Phase 2 private qualification bridge - synthetic regression fixtures, not live evidence",()=>{
  it("binds a genuine-shape UK lithium historical page to its source and prevents payment",()=>{
    const search:OnDemandSearchInput={
      country_iso3:"GBR",categories:["rare_earth"],topics:["critical_minerals"],
      mineral:"lithium",max_age_seconds:31*86400,
    };
    const q=qualifyRetrievedOnDemandEvidence(fixture(search,[original()],"United Kingdom",
      "2026-09-27T08:00:03.000Z"));
    expect(q.originals).toHaveLength(1);
    expect(q.originals[0].evidence_kind).toBe("HISTORICAL_PUBLISHER_ANNOUNCEMENT");
    expect(q.originals[0].original_clock_basis).toBe("VERIFIED_ORIGINAL_PAGE");
    expect(q.originals[0].article_commercial_rights_verified).toBe(false);
    expect(q.qualified_for_same_event_signing).toBe(false);
    expect(q.commercial_delivery_eligible).toBe(false);
    expect(q.evidence_fingerprint_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(publicOnDemandQualificationStatus(q)).toEqual({
      status:"EVIDENCE_IDENTIFIED_REVIEW_PENDING",
      original_record_count:1,original_page_verified_count:1,
      structural_annual_record_count:0,
      independent_same_event_verified:false,
      commercial_rights_verified:false,signing_eligible:false,payment_eligible:false,
    });
    const publiclySafe=JSON.stringify(publicOnDemandQualificationStatus(q));
    expect(publiclySafe).not.toContain("gov.uk");
    expect(publiclySafe).not.toContain("lithium");
    expect(publiclySafe).not.toContain(q.evidence_fingerprint_sha256);
  });

  it("keeps native-only macro publisher news distinct from annual structural observations",()=>{
    const search:OnDemandSearchInput={
      country_iso3:"CHN",categories:["macro"],topics:["macro_risk"],
      max_age_seconds:7*86400,
    };
    const native=original({
      domain:"macro",publisher_family:"uk_hmt_original_publisher",
      article_url:"https://www.gov.uk/government/news/china-inflation",
      article_title:"China inflation and economic growth announcement",
      feed_item_published_at:"2026-10-13T12:00:00.000Z",
      source_native_feed_publication_date_verified:true,
      search_index_original_page_pending:undefined,
    });
    native.article_identity_sha256=sha(native.publisher_family+"|"+native.article_url);
    const annual:PrivateOfficialMacroChange={
      country_iso3:"CHN",indicator:"FP.CPI.TOTL.ZG",
      latest_observation_year:2025,previous_observation_year:2024,
      latest_annual_pct:2.1,previous_annual_pct:2,
      annual_rate_change_percentage_points:0.1,
      source_observation_sha256:sha(JSON.stringify(["CHN","FP.CPI.TOTL.ZG",2025,2.1,2024,2])),
      observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
      publisher_original_release_date_verified:false,
      derived_commercial_rights_verified:false,risk_score_verified:false,
      paid_delivery_allowed:false,
    };
    const q=qualifyRetrievedOnDemandEvidence({
      ...fixture(search,[native],"China",null),macroChanges:[annual],
    });
    expect(q.originals[0].original_clock_basis).toBe("VERIFIED_NATIVE_FEED");
    expect(q.originals[0].evidence_kind).toBe("CURRENT_PUBLISHER_ANNOUNCEMENT");
    expect(q.structural[0].observation_type).toBe("ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS");
    expect(q.structural[0].score_verified).toBe(false);
    expect(q.commercial_delivery_eligible).toBe(false);
  });

  it("rejects mismatched publisher page proof, wrong mineral and mismatched country",()=>{
    const search:OnDemandSearchInput={
      country_iso3:"GBR",categories:["rare_earth"],topics:["critical_minerals"],
      mineral:"lithium",max_age_seconds:31*86400,
    };
    const row=original();
    const invalid=fixture(search,[row],"United Kingdom","2026-09-27T08:00:03.000Z");
    invalid.pageProof.verified_candidates[0].article_title="Different publisher article";
    expect(()=>qualifyRetrievedOnDemandEvidence(invalid)).toThrow("ON_DEMAND_PAGE_PROOF_NOT_BOUND_TO_SOURCE");
    const nickel=original({article_title:"UK nickel production in Cornwall announced"});
    expect(qualifyRetrievedOnDemandEvidence(fixture(search,[nickel],"United Kingdom",null)).originals).toHaveLength(0);
    const scope=original({article_title:"China lithium mine announced"});
    expect(qualifyRetrievedOnDemandEvidence(fixture(search,[scope],"United Kingdom",null)).originals).toHaveLength(0);
  });

  it("deduplicates repeated publisher claims without inventing independent corroboration",()=>{
    const search:OnDemandSearchInput={
      country_iso3:"RUS",categories:["geopolitics"],topics:["conflict_geopolitics"],
      max_age_seconds:31*86400,
    };
    const a=original({
      domain:"geopolitics",publisher_family:"uk_fcdo_original_publisher",
      article_url:"https://www.gov.uk/government/news/russia-conflict-1",
      article_title:"Russia conflict ceasefire update",
      feed_item_published_at:"2026-10-10T08:00:00.000Z",
      source_native_feed_publication_date_verified:true,
    });
    a.article_identity_sha256=sha(a.publisher_family+"|"+a.article_url);
    const b={...a,article_url:"https://www.gov.uk/government/news/russia-conflict-2",
      article_identity_sha256:sha(a.publisher_family+"|https://www.gov.uk/government/news/russia-conflict-2")};
    const aFirst=qualifyRetrievedOnDemandEvidence(fixture(search,[a,b],"Russian Federation",null));
    const reversed=qualifyRetrievedOnDemandEvidence(fixture(search,[b,a],"Russian Federation",null));
    expect(aFirst.originals).toHaveLength(1);
    expect(aFirst.originals[0].independent_same_event_verified).toBe(false);
    // Stable value irrespective of upstream listing order, even with duplicate announcements.
    expect(aFirst.evidence_fingerprint_sha256).toBe(reversed.evidence_fingerprint_sha256);
  });

  it("uses truthful no-current versus historical-insufficient outcomes",()=>{
    const latest:OnDemandSearchInput={country_iso3:"GBR",categories:["rare_earth"],
      topics:["critical_minerals"],max_age_seconds:86400};
    const history={...latest,max_age_seconds:31*86400};
    expect(qualifyRetrievedOnDemandEvidence(fixture(latest,[],"United Kingdom",null)).disposition)
      .toBe("NO_CURRENT_EVIDENCE");
    expect(qualifyRetrievedOnDemandEvidence(fixture(history,[],"United Kingdom",null)).disposition)
      .toBe("INSUFFICIENT_EVIDENCE");
  });
});
