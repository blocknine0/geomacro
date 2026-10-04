import type { AskAnswer } from "./ask-intelligence.server";

export const ASK_COMMERCIAL_BRIEF_VERSION = "ask-commercial-brief-v2-direct" as const;

function normalize(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(
      /This is a deterministic summary of stored records, not an external model opinion\.?/gi,
      "",
    )
    .replace(
      /This interpretation comes from the published GRI attribution, not from a separate model-generated narrative\.?/gi,
      "Based on published GRI attribution.",
    )
    .replace(
      /The selected records should be read as supporting context, not as a separate index\.?/gi,
      "These records are supporting context, not a separate index.",
    )
    .replace(
      /The canonical GRI is currently unavailable, so Geomacro is limiting this answer to the stored matched evidence instead of producing a private fallback score\.?/gi,
      "Canonical GRI is unavailable; this answer is limited to stored matched evidence.",
    )
    .trim();
}

function sentenceParts(text: string): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [normalized];
}

function concise(text: string, maxSentences: number, maxChars: number): string {
  const parts = sentenceParts(text).slice(0, maxSentences);
  let result = parts.join(" ").trim();
  if (result.length <= maxChars) return result;

  const clipped = result.slice(0, Math.max(0, maxChars - 1));
  const lastSpace = clipped.lastIndexOf(" ");
  result = (lastSpace > maxChars * 0.7 ? clipped.slice(0, lastSpace) : clipped).trim();
  return `${result}…`;
}

function isBoilerplate(text: string): boolean {
  const value = normalize(text).toLowerCase();
  return (
    !value ||
    value.startsWith("geomacro found ") ||
    value.includes("verified b2 intelligence continuity layer") ||
    value.includes("cross-checked the live findings internally") ||
    value.includes("source identities remain private") ||
    value.includes("without a new external retrieval")
  );
}

function firstUseful(...values: string[]): string {
  return values.map(normalize).find((value) => value && !isBoilerplate(value))
    ?? values.map(normalize).find(Boolean)
    ?? "Geomacro does not have enough verified evidence to answer that directly.";
}

/**
 * Choose one direct public answer from the richer internal structured result.
 * The richer fields remain in the response contract for compatibility and
 * auditability, but the public conversational surface should not force every
 * question through the same report template.
 */
export function directAnswerForQuestion(answer: AskAnswer, question = ""): string {
  const q = question.toLowerCase();

  if (answer.insufficient_evidence) {
    return concise(firstUseful(answer.what_changed, answer.summary), 2, 420);
  }

  if (/\b(why|impact|implication|matter|matters)\b/i.test(q)) {
    return concise(firstUseful(answer.why_it_matters, answer.what_changed, answer.summary), 2, 420);
  }

  if (/\b(driv(?:e|es|ing|er|ers)|cause|causes|behind|because)\b/i.test(q)) {
    return concise(firstUseful(answer.what_changed, answer.why_it_matters, answer.summary), 2, 420);
  }

  if (/\b(outlook|view|interpret|interpretation|mean|meaning|expect|next)\b/i.test(q)) {
    return concise(firstUseful(answer.geomacro_view, answer.summary, answer.what_changed), 2, 420);
  }

  if (/\b(changed|change|latest|current|today|now|recent|recently|happening|happened|development|developments)\b/i.test(q)) {
    return concise(firstUseful(answer.what_changed, answer.summary, answer.why_it_matters), 2, 420);
  }

  return concise(firstUseful(answer.summary, answer.what_changed, answer.why_it_matters, answer.geomacro_view), 2, 420);
}

/**
 * Presentation-only compaction for the public Ask Geomacro surface.
 *
 * This function never changes evidence, scores, relevance, confidence flags,
 * availability state or the canonical GRI. It removes repetitive implementation
 * language, bounds prose length, and promotes one question-specific direct
 * answer into summary for the chatbot-style public surface.
 */
export function toCommercialAskBrief(answer: AskAnswer, question = ""): AskAnswer {
  const compacted: AskAnswer = {
    ...answer,
    summary: concise(answer.summary, 2, 320),
    what_changed: concise(answer.what_changed, 3, 520),
    why_it_matters: concise(answer.why_it_matters, 2, 420),
    geomacro_view: concise(answer.geomacro_view, 2, 420),
  };

  return {
    ...compacted,
    summary: directAnswerForQuestion(compacted, question),
  };
}
