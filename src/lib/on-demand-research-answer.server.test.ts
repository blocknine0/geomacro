import {describe, expect, it, vi} from "vitest";
import type {PrivatePageDatedOriginal} from "../lib/on-demand-global-discovery.server";
import type {StatelessIntelligenceSignal, StatelessSourceCandidate} from "../lib/stateless-intelligence-model";
import {
  buildSourceGroundedResearchAnswer,
  buildStructuredEvidenceGap,
  isSourceGroundedResearchAnswer,
} from "../lib/on-demand-research-answer.server";

const NOW = new Date("2026-10-25T12:00:00.000Z");
const PUBLISHED = "2026-10-25T10:00:00.000Z";
const URL = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20261025a.htm";
const PLAN_HASH = "a".repeat(64);

function page(overrides: Partial<PrivatePageDatedOriginal> = {}): PrivatePageDatedOriginal {
  return {
    domain: "macro",
    country_iso3: "USA",
    publisher_family: "us_federal_reserve_original_publisher",
    article_url: URL,
    article_title: "Federal Reserve monetary policy release",
    item_scoped_summary_private: "Private original item summary",
    feed_item_published_at: PUBLISHED,
    article_identity_sha256: "b".repeat(64),
    first_party_article_url_verified: true,
    source_native_feed_publication_date_verified: true,
    publisher_article_page_date_verified: true,
    page_original_published_at: PUBLISHED,
    independent_same_event_verified: false,
    derived_commercial_rights_verified: false,
    score_verified: false,
    signed_gro_verified: false,
    paid_delivery_allowed: false,
    ...overrides,
  };
}

const candidate: StatelessSourceCandidate = {
  title: "Federal Reserve monetary policy release",
  articleUrl: URL,
  publishedAt: PUBLISHED,
  sourceId: "fed_press",
  category: "macro",
  credit: "Federal Reserve Board",
};

const signal: StatelessIntelligenceSignal = {
  id: "macro-abc123",
  category: "macro",
  title: "Geomacro finds a monetary-policy development",
  why_it_matters: "A policy release may affect financing assumptions; direction and market effects are not inferred.",
  topic: "monetary policy",
  what_changed: "A monetary-policy release was observed.",
  geography: null,
  development_type: "policy",
  published_at: PUBLISHED,
  date_precision: "exact",
  observed_release_count: 1,
  sources_credited: [],
  status: "official_release_observed_unscored",
  same_event_corrob_verified: false,
  severity: null,
};

describe("source-grounded on-demand research answer", () => {
  it("returns one stable structured no-evidence object instead of inventing a fact",()=>{
    const result=buildStructuredEvidenceGap({
      country_iso3:"LSO",categories:["macro"],topics:["sovereign_risk"],
      question:"What official sovereign debt and fiscal deficit evidence exists for Lesotho?",
      query_plan_hash:PLAN_HASH,checked_at:NOW.toISOString(),source_families_reached:3,
    });
    expect(result).toMatchObject({
      schema:"geomacro.structured-answer.v1",status:"INSUFFICIENT_VERIFIED_EVIDENCE",
      query_plan_hash:PLAN_HASH,
      query_scope:{country_iso3:"LSO",categories:["macro"],requested_topics:["sovereign_risk"],
        query_type:"CURRENT_EVENT_OR_RELEASE"},
      answer:null,evidence_summary:{verified_observation_count:0,latest_original_published_at:null},
      source_check:{checked_at:NOW.toISOString(),source_families_reached:3,bounded_search_exhaustive:false},
      delivery:{chargeable:false,payment_required_now:false,raw_upstream_delivered:false,
        source_identity_exposed:false,signed:false,execution_authorized:false},
    });
    expect(buildStructuredEvidenceGap({
      country_iso3:"LSO",categories:["macro"],topics:["macro_risk"],
      question:"What was the inflation rate?",query_plan_hash:PLAN_HASH,
      checked_at:NOW.toISOString(),source_families_reached:0,
    })?.query_scope.query_type).toBe("STATISTICAL_HISTORICAL_OR_FORECAST_SERIES");
  });

  it("accepts explicitly supplied verified USGS baseline as dated non-news five-part research",()=>{
    const result=buildStructuredEvidenceGap({
      country_iso3:"CHL",categories:["rare_earth"],topics:["critical_minerals"],
      question:"What do official copper production records say about Chile?",
      query_plan_hash:PLAN_HASH,checked_at:NOW.toISOString(),source_families_reached:1,
      mineral_commodity:"copper",
      mineral_statistical_observations:[{
        source:"USGS_MCS_2026",country_iso3:"CHL",commodity:"copper",
        reference_year:2025,metric:"MINE_PRODUCTION",value:125,unit:"metric_tonnes",
        dataset_url:"https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release",
        period_verified:true,country_mapping_verified:true,commodity_mapping_verified:true,
      }],
    });
    expect(result?.status).toBe("OFFICIAL_STATISTICAL_REFERENCE_ONLY");
    expect(result?.answer?.news_event_count).toBe(0);
    expect(result?.delivery.chargeable).toBe(false);
    expect(result?.answer?.five_part.evidence_and_confidence.current_event_verified).toBe(false);
    const gap=buildStructuredEvidenceGap({
      country_iso3:"LUX",categories:["rare_earth"],topics:["critical_minerals"],
      query_plan_hash:PLAN_HASH,checked_at:NOW.toISOString(),source_families_reached:1,
      mineral_commodity:"copper",mineral_statistical_observations:[],
    });
    expect(gap?.status).toBe("INSUFFICIENT_VERIFIED_EVIDENCE");
    expect(gap?.answer).toBeNull();
  });

  it("returns a machine-readable gap when a multi-mineral request cannot be narrowed safely",()=>{
    const result=buildStructuredEvidenceGap({
      country_iso3:"CHL",categories:["rare_earth"],topics:["critical_minerals"],
      question:"Compare current lithium and cobalt production in Chile",
      query_plan_hash:PLAN_HASH,checked_at:NOW.toISOString(),source_families_reached:2,
      gap_reason:"MULTIPLE_MINERALS_REQUIRE_SEPARATE_SCOPED_QUERY",
    });
    expect(result?.status).toBe("INSUFFICIENT_VERIFIED_EVIDENCE");
    expect(result?.gaps).toContain("MULTIPLE_MINERALS_REQUIRE_SEPARATE_SCOPED_QUERY");
    expect(result?.delivery.payment_required_now).toBe(false);
  });

  it("builds a concise derived-only answer from country/topic-matched original-page proof", () => {
    const candidateFromPage = vi.fn(() => candidate);
    const deriveSignals = vi.fn((_candidates: readonly StatelessSourceCandidate[], _now?: number, _options?: {websiteDelay?: boolean; maxSignals?: number; editorialVersion?: "legacy_v1" | "actor_action_v2"}) => [signal]);
    const answer = buildSourceGroundedResearchAnswer({
      country_iso3: "USA",
      categories: ["macro"],
      topics: ["macro_risk"],
      query_plan_hash: PLAN_HASH,
      pageProof: {attempted: 1, verified: 1, verified_candidates: [page()]},
      now: NOW,
    }, {
      candidateFromPage: candidateFromPage as unknown as typeof import("../lib/on-demand-global-discovery.server").websiteCandidateFromCountryOriginal,
      deriveSignals: deriveSignals as unknown as typeof import("../lib/stateless-intelligence-model").deriveStatelessSignals,
    });

    expect(answer).not.toBeNull();
    expect(answer).toMatchObject({
      schema: "geomacro.source-grounded-research-answer.v1",
      status: "UNVERIFIED_RESEARCH_ONLY",
      query_plan_hash: PLAN_HASH,
      answer: {
        summary: signal.what_changed,
        what_changed: "A monetary-policy release was observed.",
        why_it_matters: signal.why_it_matters,
        news_desk: {
          schema: "geomacro.query-bound-news-desk.v1",
          focus: "what_happened",
          direct_answer: signal.what_changed,
          unique_story_count: 1,
          stories: [{
            category: "macro",
            what_happened: signal.what_changed,
            potential_implication: signal.why_it_matters,
            affected_country_independently_verified: false,
            market_direction: null,
            price_impact: null,
          }],
          chargeable: false,
          execution_authorized: false,
        },
      },
      evidence_summary: {
        original_page_date_verified_count: 1,
        latest_original_published_at: PUBLISHED,
        categories_observed: ["macro"],
      },
      commercial_delivery: {
        chargeable: false,
        payment_required_now: false,
        commercial_rights_verified: false,
        independent_same_event_corroboration_verified: false,
        signed: false,
        raw_upstream_delivered: false,
        source_identity_exposed: false,
        execution_authorized: false,
      },
    });
    const serialized = JSON.stringify(answer);
    expect(serialized).not.toContain(URL);
    expect(serialized).not.toContain("Federal Reserve");
    expect(serialized).not.toContain("Private original item summary");
    expect(serialized).not.toContain("Geomacro found 1 original-dated research observation");
    expect(answer?.answer.news_desk.stories[0].original_page_date_verified).toBe(true);
  });

  it("deduplicates the same original item before deriving answer signals", () => {
    const candidateFromPage = vi.fn(() => candidate);
    const deriveSignals = vi.fn((_candidates: readonly StatelessSourceCandidate[], _now?: number, _options?: {websiteDelay?: boolean; maxSignals?: number; editorialVersion?: "legacy_v1" | "actor_action_v2"}) => [signal]);
    const first = page();
    const duplicate = page({article_identity_sha256: "c".repeat(64)});
    const answer = buildSourceGroundedResearchAnswer({
      country_iso3: "USA",
      categories: ["macro"],
      topics: ["macro_risk"],
      query_plan_hash: PLAN_HASH,
      pageProof: {attempted: 2, verified: 2, verified_candidates: [first, duplicate]},
      now: NOW,
    }, {
      candidateFromPage: candidateFromPage as unknown as typeof import("../lib/on-demand-global-discovery.server").websiteCandidateFromCountryOriginal,
      deriveSignals: deriveSignals as unknown as typeof import("../lib/stateless-intelligence-model").deriveStatelessSignals,
    });

    expect(answer?.evidence_summary.original_page_date_verified_count).toBe(1);
    expect(candidateFromPage).toHaveBeenCalledTimes(1);
    expect(deriveSignals).toHaveBeenCalledTimes(1);
    expect(deriveSignals.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("fails closed for stale, wrong-country, wrong-topic or unbound query evidence", () => {
    const deps = {
      candidateFromPage: (() => candidate) as unknown as typeof import("../lib/on-demand-global-discovery.server").websiteCandidateFromCountryOriginal,
      deriveSignals: (() => [signal]) as unknown as typeof import("../lib/stateless-intelligence-model").deriveStatelessSignals,
    };
    expect(buildSourceGroundedResearchAnswer({
      country_iso3: "USA", categories: ["macro"], topics: ["macro_risk"],
      query_plan_hash: PLAN_HASH, pageProof: {attempted: 0, verified: 0, verified_candidates: []}, now: NOW,
    }, deps)).toBeNull();
    expect(buildSourceGroundedResearchAnswer({
      country_iso3: "USA", categories: ["macro"], topics: ["macro_risk"],
      query_plan_hash: PLAN_HASH, pageProof: {attempted: 1, verified: 1, verified_candidates: [page({country_iso3: "BRA"})]}, now: NOW,
    }, deps)).toBeNull();
    expect(buildSourceGroundedResearchAnswer({
      country_iso3: "USA", categories: ["macro"], topics: ["fx_external_risk"],
      query_plan_hash: PLAN_HASH, pageProof: {attempted: 1, verified: 1, verified_candidates: [page()]}, now: NOW,
    }, deps)).toBeNull();
    expect(buildSourceGroundedResearchAnswer({
      country_iso3: "USA", categories: ["macro"], topics: ["macro_risk"],
      max_age_seconds: 3_600, query_plan_hash: PLAN_HASH,
      pageProof: {attempted: 1, verified: 1, verified_candidates: [page({page_original_published_at: "2026-10-23T10:00:00.000Z"})]},
      now: NOW,
    }, deps)).toBeNull();
    expect(buildSourceGroundedResearchAnswer({
      country_iso3: "USA", categories: ["macro"], topics: ["macro_risk"],
      query_plan_hash: "not-a-hash", pageProof: {attempted: 1, verified: 1, verified_candidates: [page()]}, now: NOW,
    }, deps)).toBeNull();
    expect(buildSourceGroundedResearchAnswer({
      country_iso3: "USA", categories: ["macro"], topics: ["macro_risk"],
      question: "What is Brazil's latest inflation rate?",
      query_plan_hash: PLAN_HASH, pageProof: {attempted: 1, verified: 1, verified_candidates: [page()]}, now: NOW,
    }, deps)).toBeNull();
  });

  it("recognizes only a response explicitly marked non-chargeable and unsigned", () => {
    const answer = buildSourceGroundedResearchAnswer({
      country_iso3: "USA", categories: ["macro"], topics: ["macro_risk"],
      query_plan_hash: PLAN_HASH, pageProof: {attempted: 1, verified: 1, verified_candidates: [page()]}, now: NOW,
    }, {
      candidateFromPage: (() => candidate) as unknown as typeof import("../lib/on-demand-global-discovery.server").websiteCandidateFromCountryOriginal,
      deriveSignals: (() => [signal]) as unknown as typeof import("../lib/stateless-intelligence-model").deriveStatelessSignals,
    });
    expect(answer).not.toBeNull();
    const response = {
      ok: false,
      chargeable: false,
      payment_required_now: false,
      execution_authorized: false,
      research_answer: answer,
    };
    expect(isSourceGroundedResearchAnswer(response)).toBe(true);
    expect(isSourceGroundedResearchAnswer({...response, chargeable: true})).toBe(false);
    expect(isSourceGroundedResearchAnswer({...response, research_answer: {...answer!, status: "ANSWERED"}})).toBe(false);
  });
});
