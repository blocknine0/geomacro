import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Ask Geomacro realtime search fallback", () => {
  it("runs independent public retrieval paths concurrently with bounded fallbacks", () => {
    const orchestrator = read("src/lib/ask-answer.server.ts");
    expect(orchestrator).toContain("Promise.allSettled([");
    expect(orchestrator).toContain('boundedAskAdapter("current_originals"');
    expect(orchestrator).toContain('boundedAskAdapter("derived_intelligence"');
    expect(orchestrator).toContain('boundedAskAdapter("indexed_discovery"');
    expect(orchestrator).toContain("realtimeSearchAnswer(question,");
    expect(orchestrator).toContain("allowBrowserFallback:false");
    expect(orchestrator).toContain("return candidates[0]??noCurrentPublisherNewsAnswer()");
  });

  it("offers publisher-observation-only responses without inventing signed or scored risk", () => {
    const orchestrator = read("src/lib/ask-answer.server.ts");
    const type = read("src/lib/hybrid-ask-intelligence.server.ts");
    const shared = read("src/lib/ask-shared-derived-journal.server.ts");
    const verifier = read("workers/control-plane/src/website-derived-intelligence.mjs");
    // Original-source fallback moved into the shared D1-first reader.
    expect(orchestrator).toContain("collectSharedOfficialNews(categories)");
    expect(shared).toContain("readStatelessWebsiteIntelligence(category)");
    expect(shared).toContain("fetchAllDerivedNews()");
    expect(shared).toContain("const CLOCK_24H=24*60*60_000");
    expect(shared).toContain("Promise.allSettled(");
    expect(shared).toContain("verifyDerivedStory(s,now)");
    expect(shared).toContain("s.sources_credited.length===0");
    expect(verifier).toContain('s.status==="official_release_observed_unscored"');
    expect(verifier).toContain('s.status==="official_feed_candidate_unscored"');
    expect(shared).toContain('s.status==="official_release_observed_unscored"');
    expect(verifier).toContain("s.same_event_corrob_verified!==false");
    expect(verifier).toContain("s.severity!==null");
    expect(orchestrator).toContain("selectOfficialNewsCategories(question)");
    expect(orchestrator).toContain("what (?:has )?changed today");
    expect(orchestrator).toContain("signals.map(signal => signal.category)");
    expect(orchestrator).toContain("latest_original_published_at: latestOriginal");
    expect(type).toContain("latest_original_published_at?: string");
    expect(orchestrator).toContain("rest.split(/\\s+/).some");
    expect(orchestrator).toContain("insufficient_evidence: false");
    expect(orchestrator).toContain("low_confidence: true");
    expect(orchestrator).toContain("mean_relevance: null");
    expect(orchestrator).toContain("gri: null");
    expect(orchestrator).toContain('intelligence_tier: "official_observation_unscored"');
    expect(orchestrator).toContain("signed_gro_generated: false");
    expect(orchestrator).toContain("independent_same_event_verification: false");
    expect(orchestrator).toContain("rest.split(/\\s+/).some");
    expect(orchestrator).not.toContain("signRiskObject");
    expect(orchestrator).not.toContain("settlePayment");
    expect(type).toContain('intelligence_tier?: "official_observation_unscored"');
    expect(orchestrator).toContain("live:official:");
    // Published Ask UI remains locked; the typed JSON response states the
    // observation is unscored and the rendered summary says so explicitly.
    expect(orchestrator).toContain("not a corroborated risk assessment");
  });

  it("keeps broad current-news fallback bounded and model-free when no official release qualifies", () => {
    const orchestrator = read("src/lib/ask-answer.server.ts");
    const search = read("src/lib/ask-realtime-search.server.ts");
    expect(orchestrator).toContain("if (selectOfficialNewsCategories(question).length > 0)");
    expect(orchestrator).toContain("noCurrentPublisherNewsAnswer()");
    expect(orchestrator).toContain("realtimeSearchAnswer(question,unavailable,");
    expect(orchestrator).toContain("allowBrowserFallback:false");
    expect(orchestrator).toContain("return unavailable;");
    expect(orchestrator).toContain("insufficient_evidence: true");
    expect(orchestrator).toContain("signed_gro_generated: false");
    expect(search).toContain("options: { deterministicOnly?: boolean; allowBrowserFallback?: boolean } = {}");
    expect(search).toContain("options.deterministicOnly");
    expect(search).toContain("? deterministicStructuredAnswer(hits)");
    expect(search).toContain(": await structureWithGroundedModel(question, hits)");
  });

  it("uses a bounded current-web path with broad three-domain coverage", () => {
    const fallback = read("src/lib/ask-realtime-search.server.ts");
    expect(fallback).toContain("api.gdeltproject.org/api/v2/doc/doc");
    expect(fallback).toContain("timespan,");
    expect(fallback).toContain('category: "GEOPOLITICS"');
    expect(fallback).toContain('category: "MACRO"');
    expect(fallback).toContain('category: "CRITICAL_MINERALS"');
    expect(fallback).toContain("Promise.allSettled");
    expect(fallback).toContain("SEARCH_TIMEOUT_MS = 7_000");
  });

  it("keeps realtime answers structured even when the optional grounded formatter is unavailable", () => {
    const fallback = read("src/lib/ask-realtime-search.server.ts");
    expect(fallback).toContain("groqClassifyJson");
    expect(fallback).toContain("deterministicStructuredAnswer");
    expect(fallback).toContain("recently indexed observations, latest");
    expect(fallback).toContain("using deterministic structure");
    // GDELT seendate is index observation time, NOT first-party publication.
    expect(fallback).toContain("indexedDate(article.seendate)");
    expect(fallback).toContain("indexed_at: hit.observedAt");
    expect(fallback).toContain('intelligence_tier: "index_observation_unverified"');
    expect(fallback).toContain("signed_gro_generated: false");
    expect(fallback).toContain("independent_same_event_verification: false");
    expect(fallback).toContain("const lowConfidence = true");
    expect(fallback).toContain("mean_relevance: null");
    expect(fallback).toContain("gri: null");
  });

  it("never exposes raw realtime URLs, headlines or provider identity in the public Ask evidence contract", () => {
    const fallback = read("src/lib/ask-realtime-search.server.ts");
    expect(fallback).toContain('source_identity_exposed: false');
    expect(fallback).toContain('durable_live_storage_write: false');
    expect(fallback).toContain('eventId: fallbackId');
    expect(fallback).toContain("publicEvidenceLabel");
    expect(fallback).toContain("do not reproduce source headlines verbatim");
    expect(fallback).not.toContain('sourceUrl:');
    expect(fallback).not.toContain('url: hits[index]');
    expect(fallback).not.toContain('title: hits[index].title');
  });

  it("routes both public Ask transports through the same realtime-aware answer orchestrator", () => {
    const core = read("src/lib/ask-geomacro-core.server.ts");
    const serverFn = read("src/lib/ask-geomacro.functions.ts");
    for (const source of [core, serverFn]) {
      expect(source).toContain('from "./ask-answer.server"');
      expect(source).toContain("answerAskQuestion(data.question)");
      expect(source).toContain("toCommercialAskBrief");
    }
  });
});
