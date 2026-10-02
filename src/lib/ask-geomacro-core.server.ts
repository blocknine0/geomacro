import { z } from "zod";

import { toCommercialAskBrief } from "./ask-commercial-brief";
import { checkAskRateLimit } from "./ask-rate-limit.server";
import {
  answerQuestion,
  type HybridAskAnswer,
} from "./hybrid-ask-intelligence.server";

export const ASK_GEOMACRO_MAX_LENGTH = 300;

const INJECTION_RE =
  /(ignore (all|previous|prior)|disregard (all|previous)|system prompt|you are now|act as|jailbreak|<\|.*\|>)/i;

const AskInput = z.object({
  question: z
    .string()
    .trim()
    .min(4)
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

  if (!checkAskRateLimit(clientKey)) {
    throw new AskGeomacroRateLimitError();
  }

  return toCommercialAskBrief(await answerQuestion(data.question)) as AskAnswer;
}
