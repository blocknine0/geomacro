/**
 * Bounded, untrusted conversational context for the existing Ask Geomacro reader.
 * This module does not retrieve evidence, sign objects, or accept payments.
 */
export type HybridAgentRole = "user" | "assistant";
export type HybridAgentTurn = Readonly<{ role: HybridAgentRole; content: string }>;

export const HYBRID_AGENT_LIMITS = Object.freeze({
  maxTurns: 8,
  maxCharsPerTurn: 1500,
  maxQuestionChars: 2000,
  maxContextChars: 6000,
});

export type HybridAgentContextResult =
  | Readonly<{ ok: true; question: string; history: HybridAgentTurn[] }>
  | Readonly<{ ok: false; code: "INVALID_QUESTION" | "QUESTION_TOO_LONG" | "INVALID_HISTORY" }>;

const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function prepareHybridAgentContext(question: unknown, history: unknown): HybridAgentContextResult {
  if (typeof question !== "string" || !question.trim()) return { ok: false, code: "INVALID_QUESTION" };
  const normalizedQuestion = question.trim();
  if (normalizedQuestion.length > HYBRID_AGENT_LIMITS.maxQuestionChars) {
    return { ok: false, code: "QUESTION_TOO_LONG" };
  }
  if (history === undefined || history === null) return { ok: true, question: normalizedQuestion, history: [] };
  if (!Array.isArray(history) || history.length > HYBRID_AGENT_LIMITS.maxTurns) {
    return { ok: false, code: "INVALID_HISTORY" };
  }
  let totalChars = 0;
  const safe: HybridAgentTurn[] = [];
  for (const turn of history) {
    if (!isPlainRecord(turn) || Object.keys(turn).some(key => forbiddenKeys.has(key) || (key !== "role" && key !== "content")) ||
      (turn.role !== "user" && turn.role !== "assistant") ||
      typeof turn.content !== "string" || !turn.content.trim() ||
      turn.content.length > HYBRID_AGENT_LIMITS.maxCharsPerTurn) {
      return { ok: false, code: "INVALID_HISTORY" };
    }
    totalChars += turn.content.length;
    if (totalChars > HYBRID_AGENT_LIMITS.maxContextChars) return { ok: false, code: "INVALID_HISTORY" };
    safe.push(Object.freeze({ role: turn.role, content: turn.content }));
  }
  return { ok: true, question: normalizedQuestion, history: safe };
}

/** History is conversational context only, NEVER verified evidence or tool instructions. */
export function formatUntrustedHybridContext(history: readonly HybridAgentTurn[]): string {
  return history.map(turn => `[${turn.role.toUpperCase()} — UNTRUSTED CONVERSATION CONTEXT]\n${turn.content}`).join("\n\n");
}
