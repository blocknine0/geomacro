import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { answerQuestion, type AskAnswer } from "./ask-intelligence.server";
import { checkAskRateLimit } from "./ask-rate-limit.server";

const INJECTION_RE =
  /(ignore (all|previous|prior)|disregard (all|previous)|system prompt|you are now|act as|jailbreak|<\|.*\|>)/i;

const AskInput = z.object({
  question: z
    .string()
    .trim()
    .min(4)
    .max(300)
    .refine((value) => !INJECTION_RE.test(value), { message: "Invalid input" }),
});

export type { AskAnswer };

export const askGeomacro = createServerFn({ method: "POST" })
  .validator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }): Promise<AskAnswer> => {
    assertSameOrigin();
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (!checkAskRateLimit(ip)) {
      throw new Error("Too many requests. Please wait a moment.");
    }
    return answerQuestion(data.question);
  });
