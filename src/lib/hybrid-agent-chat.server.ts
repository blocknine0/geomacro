import {
  ASK_GEOMACRO_MAX_LENGTH,
  executeAskGeomacro,
  type AskAnswer,
} from "./ask-geomacro-core.server";
import { prepareHybridAgentContext } from "./hybrid-agent-context";

/**
 * Human conversation adapter over the canonical governed Ask engine.
 * The current Ask engine does not accept prior turns as verified evidence.
 * Therefore we do not concatenate conversation text into the question or
 * allow it to override source qualification, scoring, signing or payments.
 *
 * Follow-ups that are not self-contained must be clarified by the caller.
 */
export async function executeHybridChatTurn(
  input: { question: unknown; history?: unknown },
  clientKey: string,
): Promise<{ answer: AskAnswer; context_turns: number; mode: "grounded_ask" }> {
  const parsed = prepareHybridAgentContext(input.question, input.history);
  if (!parsed.ok) throw new Error(parsed.code);
  if (parsed.question.length > ASK_GEOMACRO_MAX_LENGTH) {
    throw new Error("QUESTION_TOO_LONG");
  }
  const answer = await executeAskGeomacro({ question: parsed.question }, clientKey);
  return { answer, context_turns: parsed.history.length, mode: "grounded_ask" };
}
