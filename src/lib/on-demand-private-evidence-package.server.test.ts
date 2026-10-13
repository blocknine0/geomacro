import {describe,expect,it} from "vitest";
import {createHash} from "node:crypto";
import {
  qualifyPrivateOnDemandEvidence, publicOnDemandEvidenceDisposition,
} from "./on-demand-private-evidence-package.server";
import type {
  PrivateOriginalCandidate,PrivatePageDatedOriginal,PrivateOfficialMacroChange,
  OnDemandCategory,
} from "./on-demand-global-discovery.server";
import type {B2CommercialSourceRight} from "./b2-live.server";

const now=new Date("2026-10-14T12:00:00Z");
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
const evt=(family:string,domain:OnDemandCategory,url:string,title:string,date:string):
  PrivateOriginalCandidate=>{
  return {
    domain,publisher_family:family,article_url:url,article_title:title,
    article_identity_sha256:digest(family+"|"+url),
    feed_item_published_at:null,search_index_original_page_pending:true,
    first_party_article_url_verified:true,
    source_native_feed_publication_date_verified:false,
    publisher_article_page_date_verified:false,
    independent_same_event_verified:false,derived_commercial_rights_verified:false,
    score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
  };
};
const page=(c:PrivateOriginalCandidate,date:string):PrivatePageDatedOriginal=>({
  ...c,publisher_article_page_date_verified:true,page_original_published_at:date,
});
const make=(country_iso3:string,categories:OnDemandCategory[],
  feed_candidates:PrivateOriginalCandidate[],
  page_verified_candidates:PrivatePageDatedOriginal[],
  extra:Partial<Parameters<typeof qualifyPrivateOnDemandEvidence>[0]>={})=>({
  country_iso3,categories,topics:categories.includes("rare_earth")
    ? ["critical_minerals"]:categories.includes("macro")?["macro_risk"]:["conflict_geopolitics"],
  mineral:categories.includes("rare_earth")?"lithium" as const:null,
  max_age_seconds:31*86_400,now,feed_candidates,page_verified_candidates,
  annual_macro_changes:[],...extra,
});
const rights=(source_id:string):B2CommercialSourceRight=>({
  source_id,category:null,certification_state:"CERTIFIED",
  commercial_usage_status:"DERIVED_ONLY",enabled_for_ingestion:true,
  enabled_for_commercial_signals:true,raw_redistribution_allowed:false,
  attribution_required:false,licence_name:"Fixture authorisation, not a real licence",
});
const russ=evt("uk_fcdo_search_original_page","geopolitics",
  "https://www.gov.uk/government/news/russia-uk-security-response",
  "UK announces Russia security response","2026-10-13T09:34:00Z");
const china=evt("uk_hmt_original_publisher","macro",
  "https://www.gov.uk/government/news/china-economic-dialogue",
  "China economic dialogue announcement","2026-10-13T13:22:15Z");
const uk=evt("uk_dbt_search_original_page","rare_earth",
  "https://www.gov.uk/government/news/uk-lithium-mineral-project",
  "UK lithium mineral project announcement","2026-09-27T08:00:03Z");

describe("Phase 2 real-retrieval -> governed private evidence seam",()=>{
  it("binds authentic-shaped original date claims and dedups exact publisher URL",async()=>{
    const q=make("RUS",["geopolitics"],[russ,russ],[page(russ,"2026-10-13T09:34:00Z")]);
    const first=await qualifyPrivateOnDemandEvidence(q,{readRights:async()=>[rights("uk_fcdo")]});
    const second=await qualifyPrivateOnDemandEvidence(q,{readRights:async()=>[rights("uk_fcdo")]});
    expect(first.exact_evidence_sha256).toBe(second.exact_evidence_sha256);
    expect(first.distinct_original_articles).toBe(1);
    expect(first.duplicate_announcements_discarded).toBe(1);
    expect(first.disposition).toBe("SOURCE_RIGHTS_VERIFIED_REVIEW_PENDING");
    expect(first.commercial_derived_rights_verified).toBe(true);
    expect(first.evidence[0].source_native_published_at).toBe("2026-10-13T09:34:00.000Z");
    expect(first.evidence[0].material_facts_independently_verified).toBe(false);
    expect(first.risk_severity_score).toBeNull();
    expect(first.signed_gro_verified).toBe(false);
    const publiclySafe=publicOnDemandEvidenceDisposition(first);
    expect(JSON.stringify(publiclySafe)).not.toContain("gov.uk");
    expect(JSON.stringify(publiclySafe)).not.toContain("Russia");
    expect(JSON.stringify(publiclySafe)).not.toContain(first.exact_evidence_sha256);
    expect(publiclySafe.x402_payment_authorized).toBe(false);
  });
  it("accepts a true China macro original only as an unreviewed announcement",async()=>{
    const pkg=await qualifyPrivateOnDemandEvidence(
      make("CHN",["macro"],[china],[page(china,"2026-10-13T13:22:15Z")]),
      {readRights:async()=>[rights("ecb")]});
    expect(pkg.distinct_original_articles).toBe(1);
    expect(pkg.disposition).toBe("SOURCE_RIGHTS_NOT_CERTIFIED");
    expect(pkg.commercial_derived_rights_verified).toBe(false);
    expect(pkg.confidence.factual_impact).toBe("NOT_ASSESSED");
  });
  it("never invents rights for a genuine historical UK lithium announcement",async()=>{
    const pkg=await qualifyPrivateOnDemandEvidence(
      make("GBR",["rare_earth"],[uk],[page(uk,"2026-09-27T08:00:03Z")]),
      {readRights:async()=>[rights("uk_dbt")]});
    expect(pkg.evidence).toHaveLength(1);
    expect(pkg.evidence[0].source_native_published_at).toBe("2026-09-27T08:00:03.000Z");
    expect(pkg.disposition).toBe("SOURCE_RIGHTS_NOT_CERTIFIED");
    expect(pkg.evidence[0].source_registry_id).toBeNull();
    expect(pkg.signed_gro_verified).toBe(false);
  });
  it("rejects forged source binding, future/updated clocks and cross-commodity material",async()=>{
    const forged={...uk,article_identity_sha256:digest("not-a-real-source")};
    const impossible=await qualifyPrivateOnDemandEvidence(
      make("GBR",["rare_earth"],[forged],[page(forged,"2026-10-14T11:59:00Z")]),
      {readRights:async()=>[rights("uk_dbt")]});
    expect(impossible.distinct_original_articles).toBe(0);
    expect(impossible.disposition).toBe("INSUFFICIENT_EVIDENCE");
    const stale=await qualifyPrivateOnDemandEvidence(
      make("GBR",["rare_earth"],[uk],[page(uk,"2026-09-27T08:00:03Z")],
        {max_age_seconds:86_400}),
      {readRights:async()=>[rights("uk_dbt")]});
    expect(stale.disposition).toBe("NO_CURRENT_EVIDENCE");
    const wrong={...uk,article_title:"UK nickel production announcement"};
    const wrongItem=await qualifyPrivateOnDemandEvidence(
      make("GBR",["rare_earth"],[wrong],[page(wrong,"2026-10-14T11:00:00Z")]),
      {readRights:async()=>[rights("uk_dbt")]});
    expect(wrongItem.distinct_original_articles).toBe(0);
  });
  it("refuses attribution-hiding even with an otherwise certified source",async()=>{
    const pkg=await qualifyPrivateOnDemandEvidence(
      make("RUS",["geopolitics"],[russ],[page(russ,"2026-10-13T09:34:00Z")]),
      {readRights:async()=>[{...rights("uk_fcdo"),attribution_required:true}]});
    expect(pkg.disposition).toBe("ATTRIBUTION_NOT_SUPPORTED");
    expect(pkg.attribution_obligations_unmet).toBe(1);
    expect(pkg.commercial_derived_rights_verified).toBe(false);
  });
  it("separates annual macro context from current events and chargeability",async()=>{
    const annual:PrivateOfficialMacroChange={
      country_iso3:"CHN",indicator:"NY.GDP.MKTP.KD.ZG",
      latest_observation_year:2025,previous_observation_year:2024,
      latest_annual_pct:5.2,previous_annual_pct:5.1,
      annual_rate_change_percentage_points:0.1,
      source_observation_sha256:digest("valid-fixture"),
      observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
      publisher_original_release_date_verified:false,
      derived_commercial_rights_verified:false,risk_score_verified:false,
      paid_delivery_allowed:false,
    };
    const pkg=await qualifyPrivateOnDemandEvidence(
      make("CHN",["macro"],[],[],{max_age_seconds:86_400,
        annual_macro_changes:[annual]}),{readRights:async()=>[]});
    expect(pkg.annual_structural_observations).toBe(1);
    expect(pkg.distinct_original_articles).toBe(0);
    expect(pkg.disposition).toBe("INSUFFICIENT_EVIDENCE");
    expect(pkg.x402_payment_authorized).toBe(false);
  });
});
