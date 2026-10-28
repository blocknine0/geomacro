import { withPublicRuntimeTimeout } from "./public-runtime-timeout";
import { z } from "zod";

import { answerAskQuestion } from "./ask-answer.server";
import { toCommercialAskBrief } from "./ask-commercial-brief";
import { checkAskRateLimit, checkAskOriginalBudget } from "./ask-rate-limit.server";
import { planAskOriginalQuestion } from "./ask-on-demand-original.server";
import type { HybridAskAnswer } from "./hybrid-ask-intelligence.server";

export const ASK_GEOMACRO_MAX_LENGTH = 1200;

const INJECTION_RE =
  /(ignore (all|previous|prior)|disregard (all|previous)|system prompt|you are now|act as|jailbreak|<\|.*\|>)/i;

const AskInput = z.object({
  question: z
    .string()
    .trim()
    .min(2)
    .max(ASK_GEOMACRO_MAX_LENGTH)
    .refine((value) => !INJECTION_RE.test(value), { message: "Invalid input" }),
});

export class AskGeomacroRateLimitError extends Error {
  constructor() {
    super("Too many requests. Please wait a moment.");
    this.name = "AskGeomacroRateLimitError";
  }
}

export type AskAnswer = HybridAskAnswer;

export function parseAskGeomacroInput(input: unknown) {
  return AskInput.parse(input);
}

/**
 * Shared public Ask execution core.
 *
 * Transport security is enforced by the HTTP/server-function boundary. This
 * core owns the product-level input validation, prompt-injection rejection,
 * best-effort warm-runtime rate limiting and commercial response shaping so
 * every transport preserves the same behavior.
 */
export async function executeAskGeomacro(
  input: unknown,
  clientKey: string,
): Promise<AskAnswer> {
  const data = parseAskGeomacroInput(input);

  if (!checkAskRateLimit(clientKey) ||
      (planAskOriginalQuestion(data.question) && !checkAskOriginalBudget(clientKey))) {
    throw new AskGeomacroRateLimitError();
  }

  try {
    return await withPublicRuntimeTimeout(
      (async () => toCommercialAskBrief(await answerAskQuestion(data.question), data.question) as AskAnswer)(),
      14_000,
      "ASK_RESEARCH_DEADLINE",
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "ASK_RESEARCH_DEADLINE") throw error;
    return {
      summary: "The evidence check took too long to complete. Please retry or narrow the question to a topic and country.",
      what_changed: "", why_it_matters: "", geomacro_view: "",
      evidence: [], insufficient_evidence: true, mean_relevance: null,
      low_confidence: true, gri: null, generatedAt: new Date().toISOString(),
      data_mode: "ephemeral_live", cache_status: "miss", source_identity_exposed: false,
      durable_live_storage_write: false,
    };
  }
}
