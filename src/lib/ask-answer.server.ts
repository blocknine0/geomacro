import {
  answerQuestion as answerHybridQuestion,
  type HybridAskAnswer,
} from "./hybrid-ask-intelligence.server";
import { realtimeSearchAnswer } from "./ask-realtime-search.server";
import { answerFromCurrentOriginals } from "./ask-on-demand-original.server";
import { answerOfficialNumeric, planAskOfficialNumeric } from "./ask-official-numeric.server";

/**
 * Canonical Ask Geomacro answer orchestration.
 *
 * 1. Prefer Geomacro's verified permanent/B2 intelligence when it is sufficient.
 * 2. Let the existing bounded live adapters answer when they can.
 * 3. If both paths remain insufficient, run a bounded current-public-evidence
 *    search and return a structured direct answer without exposing raw URLs,
 *    publisher/provider identity or internal retrieval payloads.
 *
 * A total search outage remains fail-closed: the original insufficient answer
 * is returned rather than manufacturing unsupported content.
 */

/**
 * Narrow, source-private first-party release fallback for broad category-news
 * requests. This is NOT independent event verification, risk scoring, signed
 * GRO delivery, or payment acceptance. Specific country, asset, numeric-risk,
 * causal, directional and investment questions remain on the governed path.
 */
type OfficialNewsCategory = "geopolitics" | "macro" | "rare_earth";

function selectOfficialNewsCategories(question: string): OfficialNewsCategory[] {
  const q = question.trim().toLowerCase();
  const patterns: readonly { category: OfficialNewsCategory; test: RegExp }[] = [
    { category: "geopolitics", test: /\b(geopolitic(?:s|al)?|diplomac(?:y|ies)|foreign policy)\b/i },
    { category: "macro", test: /\b(macro(?:economics?|economic)?|fx|foreign exchange)\b/i },
    { category: "rare_earth", test: /\b(critical minerals?|rare earths?|rare-earths?)\b/i },
  ];
  const matches = patterns.filter(item => item.test.test(q));
  const genericNews = /^(?:what (?:has )?changed today|what is new today|latest news|latest developments)\??$/i.test(q);
  const looksLikeNews = /\b(latest|recent|current|new|updates?|developments?|releases?|news|changed|changing)\b/i.test(q);
  if (!looksLikeNews || matches.length > 1 || (matches.length === 0 && !genericNews))
    return [];
  const rest = q
    .replace(/\b(?:geopolitics?|geopolitical|diplomacy|foreign policy|macro\/fx|macroeconomics?|macroeconomic|macro|fx|foreign exchange|critical minerals?|rare[- ]earths?)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const allowed = new Set([
    "what", "whats", "s", "is", "are", "has", "the", "latest", "recent",
    "current", "new", "news", "update", "updates", "development",
    "developments", "release", "releases", "changed", "changing",
    "show", "me", "give", "tell", "about", "in", "on", "for", "any",
    "from", "today", "now", "please", "us", "there", "have", "been",
    "globally", "global", "world",
  ]);
  if (rest.split(/\s+/).some(token => token && !allowed.has(token))) return [];
  return matches.length === 1
    ? [matches[0].category]
    : ["geopolitics", "macro", "rare_earth"];
}

/**
 * News-only observations must never be mistaken for a signed GRO or a
 * payment-eligible country/commodity/corridor risk assessment.
 */
async function officialUnscoredReleaseAnswer(question: string): Promise<HybridAskAnswer | null> {
  const categories = selectOfficialNewsCategories(question);
  if (!categories.length) return null;
  const { readStatelessWebsiteIntelligence } = await import("./stateless-public-intelligence.server");
  const results = await Promise.allSettled(
    categories.map(category => readStatelessWebsiteIntelligence(category))
  );
  const now = Date.now();
  const signals = results.flatMap(result => {
    if (result.status !== "fulfilled") return [];
    const recent = result.value.signals.filter(signal => {
      const issued = Date.parse(signal.published_at);
      return Number.isFinite(issued) && issued <= now - 15 * 60_000 &&
        now - issued <= 24 * 3_600_000 &&
        signal.status === "official_release_observed_unscored" &&
        signal.same_event_corrob_verified === false && signal.severity === null;
    });
    return recent.slice(0, categories.length === 1 ? 3 : 1);
  });
  if (!signals.length) return null;
  // Report only categories that ACTUALLY yielded native-dated releases.
  // A healthy request for three categories is not evidence that all three
  // produced eligible stories today.
  const observed = Array.from(new Set(signals.map(signal => signal.category)));
  const categoryLabel = "in " + observed.map(category =>
    category === "rare_earth" ? "Critical Minerals"
      : category === "macro" ? "Macro/FX" : "Geopolitics"
  ).join(", ");
  const latestOriginal = signals.map(signal => signal.published_at).sort().at(-1)!;
  return {
    summary: "Geomacro observed " + signals.length + " recent official release" +
      (signals.length === 1 ? "" : "s") + " " + categoryLabel +
      "; these are unscored observations, not independently corroborated risk assessments.",
    what_changed: signals.map(signal => signal.what_changed).join(" "),
    why_it_matters: signals.map(signal => signal.why_it_matters).join(" "),
    geomacro_view: "First-party publication dates were checked. No independent same-event corroboration, risk score or signed GRO is claimed.",
    evidence: signals.map(signal => ({
      eventId: "live:official:" + signal.id,
      title: signal.title,
      relevance: 100,
    })),
    insufficient_evidence: false,
    mean_relevance: null,
    low_confidence: true,
    gri: null,
    generatedAt: new Date().toISOString(),
    latest_original_published_at: latestOriginal,
    data_mode: "ephemeral_live",
    cache_status: "bypassed",
    source_identity_exposed: false,
    durable_live_storage_write: false,
    real_time_message: "Unscored first-party release observations only.",
    intelligence_tier: "official_observation_unscored",
    signed_gro_generated: false,
    independent_same_event_verification: false,
  };
}

function noCurrentPublisherNewsAnswer(): HybridAskAnswer {
  return {
    summary: "Geomacro cannot confirm a new original-dated official release from the checked feeds in the past 24 hours.",
    what_changed: "No qualifying fresh original release was verified from the bounded first-party sources checked for this request.",
    why_it_matters: "This does not mean no developments occurred globally. Unavailable, delayed or out-of-scope publications may exist.",
    geomacro_view: "Geomacro will not substitute stale historical scores or manufacture a fresh signed intelligence claim.",
    evidence: [], insufficient_evidence: true, mean_relevance: null,
    low_confidence: true, gri: null, generatedAt: new Date().toISOString(),
    data_mode: "ephemeral_live", cache_status: "bypassed",
    source_identity_exposed: false, durable_live_storage_write: false,
    real_time_message: "First-party source freshness unconfirmed; no scored or signed result.",
    signed_gro_generated: false, independent_same_event_verification: false,
  };
}

export async function answerAskQuestion(question: string): Promise<HybridAskAnswer> {
  // For explicit precise official measurements, either answer with a verified
  // source period or fail closed: an indexed headline is never a numeric value.
  if (planAskOfficialNumeric(question)) {
    let safeFailureCode = "ASK_OFFICIAL_NUMERIC_SOURCE_NO_VERIFIED_DATA";
    const official = await answerOfficialNumeric(question, {
      onFailure: code => { safeFailureCode = code; },
    });
    if (official) return official;
    return {
      summary: "The requested exact official observation could not be verified from the live source.",
      what_changed: "No matching original numerical series was safely retrieved for this request.",
      why_it_matters: "A missing release or API timeout does not establish a zero value or an unchanged rate.",
      geomacro_view: "Geomacro will not invent numerical data or substitute news-index timestamps for a statistical reporting period.",
      evidence: [], insufficient_evidence: true, mean_relevance: null,
      low_confidence: true, gri: null, generatedAt: new Date().toISOString(),
      data_mode: "ephemeral_live", cache_status: "bypassed",
      source_identity_exposed: false, durable_live_storage_write: false,
      real_time_message: "Official numeric retrieval status: " + safeFailureCode,
      signed_gro_generated: false, independent_same_event_verification: false,
    };
  }
  // Narrow first-party source reads are separate from signed/payable intelligence.
  try {
    const original = await answerFromCurrentOriginals(question);
    if (original) return original;
  } catch (error) {
    console.error("[ask-answer] original retrieval unavailable",
      error instanceof Error ? error.message : "unknown error");
  }
  // Broad free-news requests use original releases and bounded index discovery.
  // Country, corridor and scored questions keep the governed path below.
  if (selectOfficialNewsCategories(question).length > 0) {
    try {
      const official = await officialUnscoredReleaseAnswer(question);
      if (official) return official;
    } catch (error) {
      console.error("[ask-answer] official release lookup unavailable",
        error instanceof Error ? error.message : "unknown error");
    }
    const unavailable = noCurrentPublisherNewsAnswer();
    try {
      return (await realtimeSearchAnswer(question, unavailable, { deterministicOnly: true }))
        ?? unavailable;
    } catch {
      return unavailable;
    }
  }
  const primary = await answerHybridQuestion(question);
  if (!primary.insufficient_evidence) return primary;
  try {
    const realtime = await realtimeSearchAnswer(question, primary);
    return realtime ?? primary;
  } catch (error) {
    console.error(
      "[ask-answer] realtime fallback unavailable; preserving fail-closed answer",
      error instanceof Error ? error.message : "unknown error",
    );
    return primary;
  }
}
