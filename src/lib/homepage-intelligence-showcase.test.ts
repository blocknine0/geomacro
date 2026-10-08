import { describe, expect, it } from "vitest";
import { isHomepageShowcaseEligible, selectHomepageShowcase } from "./homepage-intelligence-showcase";
import type { IntelEvent } from "./use-intelligence";

const NOW = Date.parse("2026-10-08T10:00:00Z");
function scored(overrides: Partial<IntelEvent> = {}): IntelEvent {
  return {
    id: "base",
    title: "Geomacro finds a verified geopolitical development",
    summary: "Classifier-derived public intelligence.",
    category: "geopolitics",
    severity: 65,
    delta: 5,
    sourceName: null,
    createdAt: "2026-10-08T08:00:00Z",
    publishedAt: "2026-10-08T08:00:00Z",
    publicStatus: "verified_b2",
    isCurrent: true,
    ...overrides,
  };
}
function observed(overrides: Partial<IntelEvent> = {}): IntelEvent {
  return scored({
    id: "observed-current",
    title: "Geomacro observes a monitored cross-border development",
    summary: null,
    severity: null,
    delta: null,
    createdAt: "2026-10-08T09:00:00Z",
    publishedAt: "2026-10-08T09:00:00Z",
    publicStatus: "live_observed",
    ...overrides,
  });
}

describe("one Geomacro Finds verified showcase per 24-hour window", () => {
  it("ranks verified scored candidates across all three commercial categories", () => {
    const rows = [
      scored({ id: "geo" }),
      scored({ id: "macro", category: "macro", severity: 98 }),
      scored({ id: "minerals", category: "rare_earth", severity: 75 }),
    ];
    expect(selectHomepageShowcase(rows, NOW)).toMatchObject({ event: { id: "macro" }, kind: "scored", isCurrent: true });
  });

  it("shows current certified discovery rather than Oct 5 history when scoring is behind", () => {
    const old = scored({
      id: "oct-5",
      createdAt: "2026-10-05T19:47:00Z",
      publishedAt: "2026-10-05T19:47:00Z",
    });
    const result = selectHomepageShowcase([old, observed()], NOW);
    expect(result?.event.id).toBe("observed-current");
    expect(result?.event.title).toMatch(/^Geomacro observes /u);
    expect(result?.kind).toBe("observed");
    expect(result?.event.severity).toBeNull();
    expect(result?.event.delta).toBeNull();
    expect(result?.observedAt).toBe("2026-10-08T09:00:00.000Z");
  });

  it("shows the newest fresh observation, not an artificial high-severity ranking", () => {
    const rows = [
      observed({ id: "earlier", createdAt: "2026-10-08T07:00:00Z", publishedAt: "2026-10-08T07:00:00Z" }),
      observed({ id: "later", createdAt: "2026-10-08T09:00:00Z", publishedAt: "2026-10-08T09:00:00Z" }),
    ];
    const winner = selectHomepageShowcase(rows, NOW);
    expect(winner?.event.id).toBe("later");
    expect(winner?.kind).toBe("observed");
  });

  it("prefers a verified scored current development over unscored discovery", () => {
    const row = scored({ id: "scored-earlier", category: "macro", severity: 40 });
    expect(selectHomepageShowcase([row, observed()], NOW)).toMatchObject({
      event: { id: "scored-earlier" }, kind: "scored", isCurrent: true,
    });
  });

  it("retains original published historical date when no fresh qualified development exists", () => {
    const old = scored({
      id: "oct-5",
      createdAt: "2026-10-05T19:47:00Z",
      publishedAt: "2026-10-05T19:47:00Z",
    });
    const staleDiscovery = observed({
      id: "stale",
      createdAt: "2026-10-05T08:00:00Z",
      publishedAt: "2026-10-05T08:00:00Z",
    });
    const result = selectHomepageShowcase([old, staleDiscovery], NOW);
    expect(result?.event.id).toBe("oct-5");
    expect(result?.kind).toBe("scored");
    expect(result?.isCurrent).toBe(false);
    expect(result?.observedAt).toBe("2026-10-05T19:47:00.000Z");
  });

  it("rejects unverifiable and raw-looking text, future dates, and invalid scores", () => {
    const rows = [
      scored({ title: "Publisher: direct original headline", id: "raw" }),
      scored({ title: "Geomacro finds a verification error", id: "future", publishedAt: "2026-10-09T08:00:00Z" }),
      scored({ id: "invalid", severity: 102 }),
      observed({ id: "fake-score", severity: 80 }),
      observed({ id: "unknown-domain", category: "macro" }),
      observed({ id: "unsafe", title: "Publisher: verbatim upstream content" }),
    ];
    expect(rows.every((row) => !isHomepageShowcaseEligible(row, NOW))).toBe(true);
    expect(selectHomepageShowcase(rows, NOW)).toBeNull();
  });

  it("refreshing a stored ingest timestamp never relabels an old report as current", () => {
    const stale = scored({
      id: "older-report",
      publishedAt: "2026-10-05T08:00:00Z",
      createdAt: "2026-10-08T09:00:00Z",
    });
    expect(selectHomepageShowcase([stale], NOW)).toMatchObject({ kind: "scored", isCurrent: false });
  });

  it("automatically replaces yesterday's fallback when a safe fresh observation arrives", () => {
    const old = scored({ id: "previous", createdAt: "2026-10-05T19:00:00Z", publishedAt: "2026-10-05T19:00:00Z" });
    const fresh = observed({ id: "new" });
    expect(selectHomepageShowcase([old], NOW)?.event.id).toBe("previous");
    expect(selectHomepageShowcase([old, fresh], NOW)?.event.id).toBe("new");
  });
});
