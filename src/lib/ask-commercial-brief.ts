import type { AskAnswer } from "./ask-intelligence.server";

export const ASK_COMMERCIAL_BRIEF_VERSION = "ask-commercial-brief-v1" as const;

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

/**
 * Presentation-only compaction for the public Ask Geomacro surface.
 *
 * This function never changes evidence, scores, relevance, confidence flags,
 * availability state or the canonical GRI. It only removes repetitive
 * implementation language and bounds prose length for a professional brief.
 */
export function toCommercialAskBrief(answer: AskAnswer): AskAnswer {
  return {
    ...answer,
    summary: concise(answer.summary, 2, 320),
    what_changed: concise(answer.what_changed, 3, 520),
    why_it_matters: concise(answer.why_it_matters, 2, 420),
    geomacro_view: concise(answer.geomacro_view, 2, 420),
  };
}
