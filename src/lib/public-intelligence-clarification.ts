/**
 * A concise explanation for a vague, already-approved Geomacro development
 * headline. This is display-only; it never infers terrorism, cyber incidents,
 * violence or military action from a generic "threat activity" label.
 *
 * The public intelligence boundary must sanitize title/summary first.
 */
type PublicHeadline = {
  title: string;
  category: string | null;
  summary: string | null;
};

const GENERIC_THREAT = /^threat activity (?:in|across) [a-z][a-z\s.,'’-]{2,100}$/iu;
const SAFE_CONTEXT = "Security concerns are flagged, but the specific type of threat is not identified.";

export function publicIntelligenceClarification(event: PublicHeadline): string | null {
  if (event.category !== "geopolitics") return null;

  const gist = event.title
    .replace(/^Geomacro (?:finds|observes)\s+/iu, "")
    .trim();
  if (!GENERIC_THREAT.test(gist)) return null;

  // A scored record can already carry a separately approved derived summary.
  // Current unscored observations have no summary. Do not add unsupported
  // details to the fallback when the actual type is not identified.
  const summary = event.summary?.replace(/\s+/gu, " ").trim() ?? "";
  if (
    summary.length >= 24 &&
    summary.length <= 160 &&
    summary.toLowerCase() !== gist.toLowerCase() &&
    !/\b(?:article|source|publisher|raw payload)\b/iu.test(summary) &&
    !/(?:https?:\/\/|www\.|<[^>]+>)/iu.test(summary)
  ) return summary;

  return SAFE_CONTEXT;
}
