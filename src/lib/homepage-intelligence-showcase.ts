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
const OBSERVED_TITLE = /^Geomacro observes\s+\S/u;

function timestamp(event: IntelEvent): number {
  const published = event.publishedAt ? Date.parse(event.publishedAt) : NaN;
  return Number.isFinite(published) ? published : Date.parse(event.createdAt);
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
      typeof event.severity === "number" &&
      Number.isFinite(event.severity) &&
      event.severity >= 0 && event.severity <= 100;
  }
  // Only the canonical, explicitly unscored geopolitical discovery layer
  // may be considered, and only for a genuinely fresh event. This path
  // cannot produce a score, delta, inferred cause, or forecast.
  return event.publicStatus === "live_observed" &&
    event.category === "geopolitics" &&
    OBSERVED_TITLE.test(event.title) &&
    event.severity === null &&
    event.delta === null &&
    observedAt >= now - DAY_MS;
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
 *   (2) otherwise the newest verified current observation, explicitly
 *       unscored (no invented cross-domain severity ranking);
 *   (3) otherwise the latest available historical scored winner, keeping
 *       its real date rather than inventing a "today" publication.
 *
 * Only the verified D1/edge public projection can supply current
 * observations. A partial or stale source never becomes a synthetic score.
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

  const currentObserved = eligible
    .filter((event) => event.publicStatus === "live_observed")
    .sort((a, b) => timestamp(b) - timestamp(a) || a.id.localeCompare(b.id));
  if (currentObserved.length) {
    const event = currentObserved[0];
    return { event, isCurrent: true, observedAt: new Date(timestamp(event)).toISOString(), kind: "observed" };
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
