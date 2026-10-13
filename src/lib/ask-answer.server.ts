import {
  answerQuestion as answerHybridQuestion,
  type HybridAskAnswer,
} from "./hybrid-ask-intelligence.server";
import { realtimeSearchAnswer } from "./ask-realtime-search.server";

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
  const categoryLabel = categories.length === 3 ? "across Geopolitics, Macro/FX and Critical Minerals"
    : categories[0] === "rare_earth" ? "in Critical Minerals"
    : categories[0] === "macro" ? "in Macro/FX" : "in Geopolitics";
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

export async function answerAskQuestion(question: string): Promise<HybridAskAnswer> {
  // Route release-only questions directly; unrelated questions keep their
  // proven B2/live/scored path and existing fail-closed payment boundaries.
  try {
    const official = await officialUnscoredReleaseAnswer(question);
    if (official) return official;
  } catch (error) {
    console.error(
      "[ask-answer] official releases unavailable; preserving canonical Ask",
      error instanceof Error ? error.message : "unknown error",
    );
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
