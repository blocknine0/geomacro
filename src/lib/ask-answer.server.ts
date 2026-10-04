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
export async function answerAskQuestion(question: string): Promise<HybridAskAnswer> {
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
