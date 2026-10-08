import type { IntelEvent } from "./use-intelligence";

/**
 * Homepage showcase consumes ONLY the already sanitized, classifier-derived
 * public Intelligence projection. Never accept a raw news payload here.
 */
export type HomepageShowcaseWinner = {
  event: IntelEvent;
  isCurrent: boolean;
  observedAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ALLOWED = new Set(["geopolitics", "macro", "rare_earth"]);
const DERIVED_TITLE = /^Geomacro finds\s+\S/u;

function timestamp(event: IntelEvent): number {
  const published = event.publishedAt ? Date.parse(event.publishedAt) : NaN;
  return Number.isFinite(published) ? published : Date.parse(event.createdAt);
}

export function isHomepageShowcaseEligible(event: IntelEvent, now: number): boolean {
  const observedAt = timestamp(event);
  return (
    event.publicStatus === "verified_b2" &&
    ALLOWED.has(String(event.category ?? "").toLowerCase()) &&
    DERIVED_TITLE.test(event.title) &&
    event.title.length <= 280 &&
    (event.summary === null || event.summary.length <= 1_000) &&
    typeof event.severity === "number" &&
    Number.isFinite(event.severity) &&
    event.severity >= 0 && event.severity <= 100 &&
    Number.isFinite(observedAt) &&
    observedAt <= now + 5 * 60_000 &&
    observedAt >= 0
  );
}

/**
 * Rank comparable derived risk context across all three domains.
 * A score is an ordering signal only, NOT calibrated probability,
 * future impact, confidence, or a new severity methodology.
 */
function rank(event: IntelEvent, anchor: number): number {
  const ageHours = Math.max(0, (anchor - timestamp(event)) / 3_600_000);
  const movement = event.delta !== null && Number.isFinite(event.delta)
    ? Math.min(100, Math.abs(event.delta) * 3)
    : 0;
  return (event.severity ?? 0) * 0.65 + movement * 0.25 +
    Math.max(0, 1 - ageHours / 24) * 10;
}

function best(events: IntelEvent[], anchor: number): IntelEvent | null {
  return [...events].sort((a, b) =>
    rank(b, anchor) - rank(a, anchor) ||
    timestamp(b) - timestamp(a) ||
    a.id.localeCompare(b.id),
  )[0] ?? null;
}

/**
 * If nothing new qualifies, select from the LAST 24h window with a verified
 * story in the retained canonical public package. This keeps a truthful
 * historical showcase after a quiet day without presenting it as current.
 * Persistence beyond the B2 package retention requires a durable publisher.
 */
export function selectHomepageShowcase(
  events: IntelEvent[],
  now = Date.now(),
): HomepageShowcaseWinner | null {
  const eligible = events.filter((event) => isHomepageShowcaseEligible(event, now));
  if (!eligible.length) return null;
  const current = eligible.filter((event) => timestamp(event) >= now - DAY_MS);
  const latest = Math.max(...eligible.map(timestamp));
  const anchor = current.length ? now : latest;
  const candidates = current.length
    ? current
    : eligible.filter((event) => timestamp(event) >= latest - DAY_MS);
  const event = best(candidates, anchor);
  if (!event) return null;
  return {
    event,
    isCurrent: Boolean(current.length),
    observedAt: new Date(timestamp(event)).toISOString(),
  };
}
