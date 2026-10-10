import type { IntelEvent } from "./use-intelligence";

/**
 * Public homepage data must already pass the canonical derived-only serving
 * boundary. Unscored observations can signal newly verified developments but
 * must never be promoted into scored risk, impact, or calibrated confidence.
 */
export type HomepageShowcaseWinner = {
  event: IntelEvent;
  isCurrent: boolean;
  observedAt: string;
  kind: "scored" | "observed";
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED = new Set(["geopolitics", "macro", "rare_earth"]);
const SCORED_TITLE = /^Geomacro finds\s+\S/u;
// A classifier class or vague risk label is not an exact news development.
// Only publish a feature when the already-approved derived text identifies
// a specific action, actor or policy rather than just a time/place bucket.
const UNSPECIFIC_STORY = [
  /\b(?:threat|protest|force-posture|relationship deterioration|coercive|assault|fighting|mass-violence)\s+activity\s+in\b/iu,
  /\bcurrent conflict-related media coverage from\b/iu,
  /^(?:a|an|the)?\s*(?:(?:verified|monitored|current|reported|recent)\s+)*(?:geopolitical|macroeconomic|macro|critical[- ]minerals?|cross[- ]border|global)\s+(?:development|event|signal|activity|change|update|risk)\b/iu,
  /\b(?:developments?|events?|signals?)\s+(?:detected|observed|reported)\s+in\b/iu,
];
export function isStorySpecificHeadline(title: string): boolean {
  const text = title.replace(/^Geomacro (?:finds|observes)\s+/iu, "").trim();
  return text.length >= 12 && !UNSPECIFIC_STORY.some((pattern) => pattern.test(text));
}

function timestamp(event: IntelEvent): number {
  const published = event.publishedAt ? Date.parse(event.publishedAt) : NaN;
  // Missing original article publication time is NOT a current event.
  // Historical storage/ingestion createdAt cannot be used as a news clock.
  return Number.isFinite(published) ? published : NaN;
}

export function isHomepageShowcaseEligible(event: IntelEvent, now: number): boolean {
  const observedAt = timestamp(event);
  const common =
    ALLOWED.has(String(event.category ?? "").toLowerCase()) &&
    event.title.length <= 280 &&
    (event.summary === null || event.summary.length <= 1_000) &&
    Number.isFinite(observedAt) &&
    observedAt <= now + 5 * 60_000 &&
    observedAt >= 0;

  if (!common) return false;
  if (event.publicStatus === "verified_b2") {
    return SCORED_TITLE.test(event.title) &&
      isStorySpecificHeadline(event.title) &&
      typeof event.severity === "number" &&
      Number.isFinite(event.severity) &&
      event.severity >= 0 && event.severity <= 100;
  }
  // GDELT event-export observations currently carry a classification, place
  // and timestamp but no independently verified article-level facts. Even
  // though they are valid for /intelligence monitoring, they are NOT an
  // evidence-bound news story fit for the homepage spotlight. Fail closed.
  return false;
}

/**
 * Severity and movement rank already-verified scored records only.
 * They must never be applied to discovery-only live observations.
 */
function scoredRank(event: IntelEvent, anchor: number): number {
  const ageHours = Math.max(0, (anchor - timestamp(event)) / 3_600_000);
  const movement = event.delta !== null && Number.isFinite(event.delta)
    ? Math.min(100, Math.abs(event.delta) * 3)
    : 0;
  return (event.severity ?? 0) * 0.65 + movement * 0.25 +
    Math.max(0, 1 - ageHours / 24) * 10;
}

function bestScored(events: IntelEvent[], anchor: number): IntelEvent | null {
  return [...events].sort((a, b) =>
    scoredRank(b, anchor) - scoredRank(a, anchor) ||
    timestamp(b) - timestamp(a) ||
    a.id.localeCompare(b.id),
  )[0] ?? null;
}

/**
 * One free story across all three domains:
 *   (1) best eligible verified scored event from the last 24 hours;
 *   (2) otherwise the latest available historical scored winner, keeping
 *       its real date rather than inventing a "today" publication.
 *
 * Bare live classifier observations remain in /intelligence but cannot
 * masquerade as exact headline news. A partial or stale source never becomes
 * a synthetic score or a fabricated story.
 */
export function selectHomepageShowcase(
  events: IntelEvent[],
  now = Date.now(),
): HomepageShowcaseWinner | null {
  const eligible = events.filter((event) => isHomepageShowcaseEligible(event, now));
  const scored = eligible.filter((event) => event.publicStatus === "verified_b2");
  const currentScored = scored.filter((event) => timestamp(event) >= now - DAY_MS);

  if (currentScored.length) {
    const event = bestScored(currentScored, now);
    if (!event) return null;
    return { event, isCurrent: true, observedAt: new Date(timestamp(event)).toISOString(), kind: "scored" };
  }

  if (!scored.length) return null;
  const latest = Math.max(...scored.map(timestamp));
  const event = bestScored(
    scored.filter((row) => timestamp(row) >= latest - DAY_MS),
    latest,
  );
  if (!event) return null;
  return { event, isCurrent: false, observedAt: new Date(timestamp(event)).toISOString(), kind: "scored" };
}
