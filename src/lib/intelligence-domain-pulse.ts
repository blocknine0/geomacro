import type { IntelEvent } from "./use-intelligence";
import { COMMERCIAL_DOMAINS } from "./intelligence-editorial";

export type IntelligenceDomainPulse = {
  key: "geopolitics" | "macro" | "rare_earth";
  label: string;
  state: "current_scored" | "current_observed" | "historical_verified" | "unavailable";
  lastScored: IntelEvent | null;
  newestObserved: IntelEvent | null;
  currentScoredCount: number;
  currentObservedCount: number;
  lastEvidenceAt: string | null;
};

const DAY = 24 * 60 * 60 * 1000;
function evidenceTime(value: IntelEvent): number {
  const published = Date.parse(value.publishedAt ?? "");
  return Number.isFinite(published) ? published : Date.parse(value.createdAt);
}

/**
 * Preserve original publisher/evidence time and scored-vs-unscored distinction.
 * A current observation NEVER becomes scored risk, and a historical score NEVER
 * advances to current merely because the monitoring feed refreshed.
 */
export function intelligenceDomainPulse(
  rows: IntelEvent[],
  now = Date.now(),
): IntelligenceDomainPulse[] {
  return COMMERCIAL_DOMAINS.map(({ key, label }) => {
    const safe = rows
      .filter((row) => row.category === key)
      .filter((row) => {
        const ms = evidenceTime(row);
        return Number.isFinite(ms) && ms <= now + 5 * 60_000;
      })
      .sort((a, b) => evidenceTime(b) - evidenceTime(a));
    const scored = safe.filter((row) =>
      row.publicStatus === "verified_b2" &&
      typeof row.severity === "number" &&
      Number.isFinite(row.severity));
    const observations = safe.filter((row) =>
      row.publicStatus === "live_observed" &&
      row.severity === null && row.delta === null);
    const current = (row: IntelEvent) =>
      evidenceTime(row) >= now - DAY && evidenceTime(row) <= now + 5 * 60_000;
    const currentScoredCount = scored.filter(current).length;
    const currentObservedCount = observations.filter(current).length;
    const state =
      currentScoredCount > 0 ? "current_scored" as const :
      currentObservedCount > 0 ? "current_observed" as const :
      scored.length > 0 ? "historical_verified" as const : "unavailable" as const;
    const newest = safe[0] ?? null;
    return {
      key, label, state,
      lastScored: scored[0] ?? null,
      newestObserved: observations.find(current) ?? null,
      currentScoredCount,
      currentObservedCount,
      lastEvidenceAt: newest ? new Date(evidenceTime(newest)).toISOString() : null,
    };
  });
}
