import type { IntelEvent } from "./use-intelligence";

const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Current Intelligence desk requires the ORIGINAL event publication time.
 * A database createdAt, latest fetch, B2 restore or website deploy is not
 * evidence of a new risk event.
 *
 * Historical scored assessments remain accessible in an explicitly selected
 * archive, never as the default live feed or lead story.
 */
export function currentVerifiedDeskEvents(
  rows: readonly IntelEvent[],
  now = Date.now(),
): IntelEvent[] {
  if (!Number.isFinite(now)) return [];
  return rows.filter((event) => {
    if (event.publicStatus !== "verified_b2" ||
        event.severity === null ||
        !Number.isFinite(event.severity) ||
        typeof event.publishedAt !== "string" ||
        !event.publishedAt.trim()) return false;
    const published = Date.parse(event.publishedAt);
    return Number.isFinite(published) &&
      published >= now - DAY_MS &&
      published <= now + FUTURE_SKEW_MS;
  });
}
