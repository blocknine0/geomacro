import {
  ASK_GEOMACRO_MAX_LENGTH,
  executeAskGeomacro,
  parseAskGeomacroInput,
  type AskAnswer,
} from "./ask-geomacro-core.server";
import { prepareHybridAgentContext } from "./hybrid-agent-context";

type HybridChatMode = "grounded_ask" | "bounded_follow_up";

/**
 * Only a narrow, deterministic risk-by-location follow-up is inferred.
 * A prior conversation message is NEVER evidence, a system instruction,
 * a score, or a source. Unclear follow-ups must be rewritten by the user.
 */
export function resolveGroundedFollowUp(
  question: string,
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
): { question: string; mode: HybridChatMode } {
  const match = /^(?:(?:and|but)\s+)?(?:what about|how about|and for)\s+([a-z][a-z .'-]{1,65})\s*\??$/i.exec(question);
  if (!match) return { question, mode: "grounded_ask" };

  const previous = [...history].reverse().find(turn => turn.role === "user")?.content ?? "";
  const topic = [
    /geopolitic(?:al|s)?/i.test(previous) && /\brisk\b/i.test(previous) ? "geopolitical" : null,
    /(?:macroeconomic|macro\/fx|macro|currency|foreign exchange)/i.test(previous) && /\brisk\b/i.test(previous) ? "macroeconomic" : null,
    /(?:critical mineral|rare earth|mineral supply)/i.test(previous) && /\brisk\b/i.test(previous) ? "critical mineral supply" : null,
  ].filter((part): part is string => part !== null);

  const target = match[1].trim();
  if (topic.length !== 1 || /^(?:it|this|that|there|here|those|them|same|more|today|yesterday)$/i.test(target)) {
    throw new Error("AMBIGUOUS_FOLLOW_UP");
  }
  const resolved = `What is the current ${topic[0]} risk in ${target}?`;
  // The canonical Ask validator applies to both raw and rewritten questions.
  parseAskGeomacroInput({ question: resolved });
  return { question: resolved, mode: "bounded_follow_up" };
}

/**
 * Conversational adapter on the EXISTING governed Ask execution path.
 * All retrieval, verification, public shaping and per-client rate limits
 * stay in executeAskGeomacro; this module never signs or settles payment.
 */
export async function executeHybridChatTurn(
  input: { question: unknown; history?: unknown },
  clientKey: string,
): Promise<{
  answer: AskAnswer;
  context_turns: number;
  mode: HybridChatMode;
  resolved_question: string;
}> {
  const parsed = prepareHybridAgentContext(input.question, input.history);
  if (!parsed.ok) throw new Error(parsed.code);
  if (parsed.question.length > ASK_GEOMACRO_MAX_LENGTH) {
    throw new Error("QUESTION_TOO_LONG");
  }
  // Validate the user's original text before any deterministic rewrite.
  const rawQuestion = parseAskGeomacroInput({ question: parsed.question }).question;
  const resolved = resolveGroundedFollowUp(rawQuestion, parsed.history);
  const answer = await executeAskGeomacro({ question: resolved.question }, clientKey);
  return {
    answer,
    context_turns: parsed.history.length,
    mode: resolved.mode,
    resolved_question: resolved.question,
  };
}
