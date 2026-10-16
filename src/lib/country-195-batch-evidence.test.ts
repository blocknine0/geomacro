import {describe,it,expect} from "vitest";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import {buildCanonical195x3CoverageMatrix} from "./canonical-195-country-coverage-matrix";
import {COUNTRY_BATCH_REVIEWED_TOPICS,summarizeCountryBatchCell}
  from "./country-195-batch-evidence";
import type {SourceProbe,PrivateOriginalCandidate,PrivatePageDatedOriginal}
  from "./on-demand-global-discovery.server";

type Domain="geopolitics"|"macro"|"rare_earth";
const SHA1="a".repeat(64),SHA2="b".repeat(64);
const mkProbe=(family:string,category:Domain,reachable:boolean,
    state:SourceProbe["retrieval_state"]="NO_MATCHING_RECORDS"):SourceProbe=>({
  family,category,reachable,attempted:true,
  observed_record_count:0,publication_clock_verified:false,
  independent_claim_verified:false,derived_commercial_rights_verified:false,
  retrieval_state:reachable?"NO_MATCHING_RECORDS":state,
});
const mkOriginal=(domain:Domain,family:string,sha:string,country="PSE"):PrivateOriginalCandidate=>({
 country_iso3:country,
 domain,publisher_family:family,article_url:"https://www.gov.uk/government/news/sample-"+family,
 article_title:"Private test fixture for Israel diplomacy policy announcement",
 article_identity_sha256:sha,first_party_article_url_verified:true,
 feed_item_published_at:"2026-10-14T12:30:00.000Z",
 source_native_feed_publication_date_verified:true,
 publisher_article_page_date_verified:false,
 independent_same_event_verified:false,derived_commercial_rights_verified:false,
 score_verified:false,signed_gro_verified:false,paid_delivery_allowed:false,
});
const verified=(c:PrivateOriginalCandidate):PrivatePageDatedOriginal=>({
 ...c,publisher_article_page_date_verified:true,
 page_original_published_at:"2026-10-14T12:30:00.000Z",
});
describe("Part 2 country-specific original issuer acceptance and quota boundary",()=>{
 it("uses one reviewed fixed topic vocabulary across ALL three categories",()=>{
  expect(COUNTRY_BATCH_REVIEWED_TOPICS).toEqual([
   "sanctions_restrictions","conflict_geopolitics","political_governance",
   "macro_risk","sovereign_risk","fx_external_risk","critical_minerals",
  ]);
  expect(COUNTRY_BATCH_REVIEWED_TOPICS.length).toBeLessThanOrEqual(8);
  expect(COUNTRIES_195.length).toBe(195);
 });
 it("200 from a global publisher does NOT prove country relevance/current original",()=>{
  const g=summarizeCountryBatchCell("VAT","geopolitics",[
   mkProbe("un_news_original_publisher","geopolitics",true),
  ],[],[]);
  expect(g.observation.source_adapter_registered).toBe(true);
  expect(g.observation.live_source_reachable).toBe(true);
  expect(g.observation.country_relevance_verified).toBe(false);
  expect(g.observation.original_evidence_verified).toBe(false);
  expect(g.observation.current_evidence_available).toBeUndefined();
  expect(g.observation.independent_fallback_verified).toBe(false);
  expect(g.verdict).toBe("NO_QUALIFYING_CURRENT_EVIDENCE");
  expect(g.observation.blocked_reason).toBe("NO_COUNTRY_RELEVANT_ORIGINAL");
  const m=buildCanonical195x3CoverageMatrix([g.observation]);
  const row=m.cells.find(x=>x.country_iso3==="VAT"&&x.category==="geopolitics")!;
  expect(row.SOURCE_ADAPTER_REGISTERED).toBe(true);
  expect(row.COUNTRY_RELEVANCE_VERIFIED).toBe(false);
  expect(m.live_source_verified_counts.geopolitics).toBe(1);
  expect(m.current_evidence_verified_counts.geopolitics).toBe(0);
  expect(m.cells.filter(x=>x.CURRENT_EVIDENCE_AVAILABLE===null)).toHaveLength(585);
 });
 it("a country-scoped unverified original is PARTIAL, never paid or signed",()=>{
  const v=summarizeCountryBatchCell("IND","rare_earth",[
   mkProbe("canada_nrcan_original_publisher","rare_earth",true),
  ],[mkOriginal("rare_earth","canada_nrcan_original_publisher",SHA1,"IND")],[]);
  expect(v.verdict).toBe("PARTIAL_SOURCE_COVERAGE");
  expect(v.observation.country_relevance_verified).toBe(true);
  expect(v.observation.original_evidence_verified).toBe(false);
  expect(v.observation.blocked_reason).toBe("ORIGINAL_PUBLICATION_UNVERIFIED");
  expect(v.commercial_rights_qualified).toBe(false);
  expect(v.signed_delivery_verified).toBe(false);
 });
 it("two country-relevant independently published and original-page-verified sources prove only fallback",()=>{
  const a=mkOriginal("geopolitics","un_news_original_publisher",SHA1);
  const b=mkOriginal("geopolitics","uk_fcdo_original_publisher",SHA2);
  const proof=summarizeCountryBatchCell("PSE","geopolitics",[
   mkProbe(a.publisher_family,"geopolitics",true),
   mkProbe(b.publisher_family,"geopolitics",true),
  ],[a,b],[verified(a),verified(b)],new Date("2026-10-14T13:00:00.000Z"));
  expect(proof.observation.independent_fallback_verified).toBe(true);
  expect(proof.observation.original_evidence_verified).toBe(true);
  expect(proof.verdict).toBe("PARTIAL_SOURCE_COVERAGE");
  expect(proof.observation.current_evidence_available).toBeUndefined();
  expect(proof.observation.blocked_reason).toBe("SAME_EVENT_AND_RIGHTS_REVIEW_PENDING");
  expect(proof.fallback_original_publisher_families).toBe(2);
  expect(proof.latest_verified_original_publication_utc)
    .toBe("2026-10-14T12:30:00.000Z");
  const row=buildCanonical195x3CoverageMatrix([proof.observation])
    .cells.find(x=>x.country_iso3==="PSE"&&x.category==="geopolitics")!;
  expect(row.INDEPENDENT_FALLBACK_VERIFIED).toBe(true);
  expect(row.RIGHTS_QUALIFIED).toBeNull();
  expect(row.SIGNED_DELIVERY_VERIFIED).toBeNull();
 });
 it("stale, future and malformed original release clocks cannot be counted as current",()=>{
  const lead=mkOriginal("geopolitics","un_news_original_publisher",SHA1);
  const probed=[mkProbe(lead.publisher_family,"geopolitics",true)];
  const asOf=new Date("2026-10-16T14:00:00.000Z");
  for(const date of ["2026-10-14T12:00:00.000Z",
    "2026-10-16T14:01:00.000Z","not-a-date"]){
    const p=summarizeCountryBatchCell("PSE","geopolitics",probed,[lead],
      [{...verified(lead),page_original_published_at:date}],asOf);
    expect(p.observation.original_evidence_verified).toBe(false);
    expect(p.observation.current_evidence_available).toBeUndefined();
    expect(p.observation.independent_fallback_verified).toBe(false);
    expect(p.signed_delivery_verified).toBe(false);
  }
  const fresh=summarizeCountryBatchCell("PSE","geopolitics",probed,[lead],
    [{...verified(lead),page_original_published_at:"2026-10-16T13:30:00.000Z"}],asOf);
  expect(fresh.observation.original_evidence_verified).toBe(true);
  expect(fresh.observation.current_evidence_available).toBeUndefined();
  expect(fresh.observation.blocked_reason).toBe("SECOND_INDEPENDENT_ORIGINAL_MISSING");
  expect(fresh.verdict).toBe("PARTIAL_SOURCE_COVERAGE");
  expect(fresh.commercial_rights_qualified).toBe(false);
  expect(()=>summarizeCountryBatchCell("PSE","geopolitics",probed,[lead],[],
    new Date("invalid"))).toThrow("COUNTRY_195_PROOF_CLOCK_INVALID");
 });
 it("never accepts cross-country, impersonated page URLs or duplicate-origin event claims",()=>{
  const a=mkOriginal("geopolitics","un_news_original_publisher",SHA1,"PSE");
  const b=mkOriginal("geopolitics","uk_fcdo_original_publisher",SHA2,"IND");
  const clock=new Date("2026-10-14T13:00:00.000Z");
  const one=summarizeCountryBatchCell("PSE","geopolitics",[
    mkProbe(a.publisher_family,"geopolitics",true),
    mkProbe(b.publisher_family,"geopolitics",true),
  ],[a,b],[verified(a),verified(b)],clock);
  expect(one.fallback_original_publisher_families).toBe(1);
  expect(one.observation.independent_fallback_verified).toBe(false);
  expect(one.observation.current_evidence_available).toBeUndefined();
  expect(one.observation.blocked_reason).toBe("SECOND_INDEPENDENT_ORIGINAL_MISSING");
  const bogus={...verified(a),article_url:"https://attacker.example/article"};
  const altered=summarizeCountryBatchCell("PSE","geopolitics",[],[a],[bogus],clock);
  expect(altered.verified_original_pages).toBe(0);
  const sameUrl=mkOriginal("geopolitics",b.publisher_family,SHA2,"PSE");
  const collision=summarizeCountryBatchCell("PSE","geopolitics",[],[a,sameUrl],
    [verified(a),{...verified(sameUrl),article_url:a.article_url}],clock);
  expect(collision.observation.independent_fallback_verified).toBe(false);
  const noLegalReview=buildCanonical195x3CoverageMatrix([{
    iso3:"PSE",category:"geopolitics",source_adapter_registered:true,
    live_source_reachable:true,country_relevance_verified:true,
    original_evidence_verified:true,independent_fallback_verified:true,
    current_evidence_available:false,blocked_reason:"SAME_EVENT_AND_RIGHTS_REVIEW_PENDING",
  }]);
  expect(noLegalReview.current_evidence_verified_counts.geopolitics).toBe(0);
  expect(()=>buildCanonical195x3CoverageMatrix([{
    iso3:"PSE",category:"geopolitics",source_adapter_registered:true,
    live_source_reachable:true,country_relevance_verified:true,
    original_evidence_verified:true,independent_fallback_verified:true,
    current_evidence_available:true,blocked_reason:"SAME_EVENT_AND_RIGHTS_REVIEW_PENDING",
  }])).toThrow("COUNTRY_195_UNSUPPORTED_PROOF_PROMOTION");
 });
 it("World Bank structural indicator and GDELT index are not originating publishers",()=>{
  const one=summarizeCountryBatchCell("BEL","macro",[
   mkProbe("world_bank_official_FP.CPI.TOTL.ZG","macro",true),
   mkProbe("gdelt_doc_discovery","macro",true),
  ],[],[]);
  expect(one.registered_source_adapters).toBe(0);
  expect(one.live_original_publisher_families).toBe(0);
  expect(one.observation.live_source_reachable).toBe(false);
  expect(one.verdict).toBe("UNTESTED");
 });
 it("429 or 403 is a blocked original issuer, never bypass via an index source",()=>{
  const a=summarizeCountryBatchCell("AUS","rare_earth",[
   mkProbe("australian_industry_original_publisher","rare_earth",false,"RATE_LIMITED"),
  ],[],[]);
  expect(a.observation.blocked_reason).toBe("PROVIDER_RATE_LIMIT_429");
  expect(a.verdict).toBe("SOURCE_BLOCKED");
  const denied=summarizeCountryBatchCell("AUS","rare_earth",[
   mkProbe("australian_industry_original_publisher","rare_earth",false,"ACCESS_RESTRICTED"),
  ],[],[]);
  expect(denied.observation.blocked_reason).toBe("PROVIDER_DENIED_401_403");
  expect(denied.verdict).toBe("SOURCE_BLOCKED");
 });
 it("category isolation rejects an unrelated domain proof and no automatic rights promotion",()=>{
  const p=mkOriginal("macro","ecb_original_publisher",SHA1);
  const out=summarizeCountryBatchCell("VAT","geopolitics",[
   mkProbe("un_news_original_publisher","geopolitics",true),
   mkProbe("ecb_original_publisher","macro",true),
  ],[p],[verified(p)]);
  expect(out.observation.original_evidence_verified).toBe(false);
  expect(out.observation.country_relevance_verified).toBe(false);
  expect(out.observation.independent_fallback_verified).toBe(false);
  expect(()=>buildCanonical195x3CoverageMatrix([{
    iso3:"VAT",category:"geopolitics",
    source_adapter_registered:true,live_source_reachable:true,
    country_relevance_verified:false,independent_fallback_verified:true,
  }])).toThrow("COUNTRY_195_UNSUPPORTED_PROOF_PROMOTION");
 });
});
