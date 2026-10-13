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
async function officialUnscoredReleaseAnswer(
  question: string,
  insufficient: HybridAskAnswer,
): Promise<HybridAskAnswer | null> {
  const q = question.trim().toLowerCase();
  const broadReleaseQuestion = /\b(latest|recent|current|new|updates?|developments?|releases?|news)\b/i.test(q);
  const categoryPatterns = [
    { category: "geopolitics" as const, test: /\b(geopolitic(?:s|al)?|diplomac(?:y|ies)|foreign policy)\b/i },
    { category: "macro" as const, test: /\b(macro(?:economics?|economic)?|fx|foreign exchange)\b/i },
    { category: "rare_earth" as const, test: /\b(critical minerals?|rare earths?|rare-earths?)\b/i },
  ];
  const matches = categoryPatterns.filter(item => item.test.test(q));
  // Restrict to a pure category-level release request, not a tailored
  // country/corridor question for which these releases may be irrelevant.
  if (!broadReleaseQuestion || matches.length !== 1 ||
      /\b(in|for|about|between|versus|vs|affect|impact|why|forecast|predict|price|rate|score|index|indices|signed|verify|verified|corroborat|risk in)\b/i.test(q)) {
    return null;
  }
  const { readStatelessWebsiteIntelligence } = await import("./stateless-public-intelligence.server");
  const result = await readStatelessWebsiteIntelligence(matches[0].category);
  const now = Date.now();
  const recent = result.signals.filter(signal => {
    const issued = Date.parse(signal.published_at);
    return Number.isFinite(issued) && issued <= now - 15 * 60_000 &&
      now - issued <= 24 * 3_600_000;
  }).slice(0, 3);
  if (!recent.length) return null;
  const categoryLabel = matches[0].category === "rare_earth" ? "Critical Minerals"
    : matches[0].category === "macro" ? "Macro/FX" : "Geopolitics";
  return {
    ...insufficient,
    summary: `Geomacro observed ${recent.length} recent official ${categoryLabel} release${recent.length === 1 ? "" : "s"}; these are unscored observations, not independently corroborated risk assessments.`,
    what_changed: recent.map(signal => signal.what_changed).join(" "),
    why_it_matters: recent.map(signal => signal.why_it_matters).join(" "),
    geomacro_view: "First-party publication dates were checked. No independent same-event corroboration, risk score or signed GRO is claimed.",
    evidence: recent.map(signal => ({
      eventId: signal.id,
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
  };
}

export async function answerAskQuestion(question: string): Promise<HybridAskAnswer> {
  const primary = await answerHybridQuestion(question);
  if (!primary.insufficient_evidence) return primary;

  try {
    const realtime = await realtimeSearchAnswer(question, primary);
    if (realtime && !realtime.insufficient_evidence) return realtime;
    return (await officialUnscoredReleaseAnswer(question, realtime ?? primary)) ?? realtime ?? primary;
  } catch (error) {
    console.error(
      "[ask-answer] realtime fallback unavailable; preserving fail-closed answer",
      error instanceof Error ? error.message : "unknown error",
    );
    try {
      return (await officialUnscoredReleaseAnswer(question, primary)) ?? primary;
    } catch {
      return primary;
    }
  }
}
