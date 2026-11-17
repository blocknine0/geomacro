import { withPublicRuntimeTimeout } from "./public-runtime-timeout";
import { z } from "zod";

import { answerAskQuestion } from "./ask-answer.server";
import { toCommercialAskBrief } from "./ask-commercial-brief";
import { publicAskResearchProjection } from "./ask-public-research-projection";
import { cachedCanonicalAsk } from "./ask-shared-answer-cache.server";
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

/** Honest, complete public fallback after the bounded evidence deadline. */
function askScopeLabel(question:string):string {
  return /\bgeopolitical\s+risk\s+index\b/iu.test(question)?"Geopolitical risk":
    /\bmacroeconomic\s+risk\s+index\b/iu.test(question)?"Macro/FX":
    /\bcritical\s+minerals?\s+risk\s+index\b/iu.test(question)?"Critical Minerals":
    /\b(?:geopolitic|sanction|conflict|diplomac|security)\w*/iu.test(question)?"Geopolitics":
    /\b(?:macro|inflation|gdp|currency|forex|fx|interest rate)\w*/iu.test(question)?"Macro/FX":
    /\b(?:critical mineral|rare earth|lithium|cobalt|nickel|graphite|copper)\w*/iu.test(question)?"Critical Minerals":
    "GeoMacro";
}

/** Complete, plain-language fallback when evidence retrieval hits its deadline. */
export function timedOutAskAnswer(question:string):AskAnswer {
  const scope=askScopeLabel(question);
  return {
    summary:"I couldn't finish checking "+scope+" in time.",
    what_changed:"The live checks did not finish, so I can't confirm a current development or value.",
    why_it_matters:"A delayed check doesn't show that conditions are unchanged.",
    geomacro_view:"Try again in a moment, or narrow the question to one country, indicator or mineral.",
    evidence:[],insufficient_evidence:true,mean_relevance:null,low_confidence:true,
    gri:null,generatedAt:new Date().toISOString(),data_mode:"ephemeral_live",
    cache_status:"miss",source_identity_exposed:false,durable_live_storage_write:false,
  };
}

/** Keep the public route available when an unexpected reader rejects. */
function unavailableAskAnswer(question:string):AskAnswer {
  const scope=askScopeLabel(question);
  return {
    summary:"I couldn't complete a verified "+scope+" answer just now.",
    what_changed:"The available checks did not return a result I can safely confirm.",
    why_it_matters:"That leaves the current picture uncertain; it does not establish that nothing changed.",
    geomacro_view:"Try again, or ask about a specific country, FX indicator or critical mineral.",
    evidence:[],insufficient_evidence:true,mean_relevance:null,low_confidence:true,
    gri:null,generatedAt:new Date().toISOString(),data_mode:"ephemeral_live",
    cache_status:"miss",source_identity_exposed:false,durable_live_storage_write:false,
  };
}

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

  // Every request still pays the abuse-rate budget, including cache hits.
  if (!checkAskRateLimit(clientKey)) throw new AskGeomacroRateLimitError();

  try {
    return await withPublicRuntimeTimeout(
      cachedCanonicalAsk(data.question, async () => {
        // Expensive publisher discovery is charged once per cache MISS and
        // only once per same-question in-flight computation.
        if (planAskOriginalQuestion(data.question) && !checkAskOriginalBudget(clientKey))
          throw new AskGeomacroRateLimitError();
        return publicAskResearchProjection(
          toCommercialAskBrief(await answerAskQuestion(data.question), data.question)
        ) as AskAnswer;
      }),
      14_000,
      "ASK_RESEARCH_DEADLINE",
    );
  } catch (error) {
    if (error instanceof Error && error.message === "ASK_RESEARCH_DEADLINE")
      return timedOutAskAnswer(data.question);
    // Retrieval and optional presentation are best-effort behind the stable
    // public contract. Never turn an upstream exception into an HTTP 500 or
    // echo an internal error into the conversation.
    return unavailableAskAnswer(data.question);
  }
}
