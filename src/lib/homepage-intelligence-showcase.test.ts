import { describe, expect, it } from "vitest";
import {
  isHomepageShowcaseEligible,
  isStorySpecificHeadline,
  selectHomepageShowcase,
} from "./homepage-intelligence-showcase";
import type { IntelEvent } from "./use-intelligence";

const NOW = Date.parse("2026-10-08T10:00:00Z");
function scored(overrides: Partial<IntelEvent> = {}): IntelEvent {
  return {
    id: "base",
    title: "Geomacro finds India introduces new export licensing for strategic minerals",
    summary: "Approved derived classification summary.",
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
    title: "Geomacro observes assault activity in Delhi, Delhi, India",
    summary: null,
    severity: null,
    delta: null,
    createdAt: "2026-10-08T09:00:00Z",
    publishedAt: "2026-10-08T09:00:00Z",
    publicStatus: "live_observed",
    ...overrides,
  });
}

describe("one evidence-specific Geomacro Finds homepage story", () => {
  it("ranks specific verified scored candidates across all three domains", () => {
    const rows = [
      scored({ id: "geo" }),
      scored({ id: "macro", category: "macro", severity: 98,
        title: "Geomacro finds central bank increases benchmark interest rate" }),
      scored({ id: "minerals", category: "rare_earth", severity: 75,
        title: "Geomacro finds a new licensing requirement for lithium exports" }),
    ];
    expect(selectHomepageShowcase(rows, NOW)).toMatchObject({
      event: { id: "macro" }, kind: "scored", isCurrent: true,
    });
  });

  it("never publishes a bare GDELT classifier as an exact-news headline", () => {
    const old = scored({
      id: "previous-story",
      createdAt: "2026-10-05T19:47:00Z",
      publishedAt: "2026-10-05T19:47:00Z",
    });
    expect(isHomepageShowcaseEligible(observed(), NOW)).toBe(false);
    expect(selectHomepageShowcase([observed(), old], NOW)).toMatchObject({
      event: { id: "previous-story" }, isCurrent: false, kind: "scored",
    });
    expect(selectHomepageShowcase([observed()], NOW)).toBeNull();
  });

  it("filters vague scored claims, not just vague observations", () => {
    for (const title of [
      "Geomacro finds assault activity in Delhi, Delhi, India",
      "Geomacro finds current conflict-related media coverage from India",
      "Geomacro finds a verified geopolitical development",
      "Geomacro finds threat activity in United States",
      "Geomacro finds recent macro development",
    ]) {
      expect(isStorySpecificHeadline(title)).toBe(false);
      expect(isHomepageShowcaseEligible(scored({ title }), NOW)).toBe(false);
    }
  });

  it("uses a specific new verified record instead of a newer generic one", () => {
    const generic = scored({
      id: "generic", severity: 99,
      title: "Geomacro finds protest activity in Delhi, Delhi, India",
      createdAt: "2026-10-08T09:00:00Z",
      publishedAt: "2026-10-08T09:00:00Z",
    });
    expect(selectHomepageShowcase([generic, scored()], NOW)?.event.id).toBe("base");
  });

  it("keeps the original date and clearly marks historical winner", () => {
    const old = scored({
      id: "old",
      createdAt: "2026-10-05T19:47:00Z",
      publishedAt: "2026-10-05T19:47:00Z",
    });
    expect(selectHomepageShowcase([old], NOW)).toMatchObject({
      kind: "scored", isCurrent: false,
      observedAt: "2026-10-05T19:47:00.000Z",
    });
  });

  it("rejects unverifiable raw-looking text, future dates, and invalid scores", () => {
    const rows = [
      scored({ title: "Publisher: direct original headline", id: "raw" }),
      scored({ id: "future", publishedAt: "2026-10-09T08:00:00Z" }),
      scored({ id: "invalid", severity: 102 }),
      observed({ id: "fake-score", severity: 80 }),
      observed({ id: "unknown-domain", category: "macro" }),
      observed({ id: "unsafe", title: "Publisher: verbatim upstream content" }),
    ];
    expect(rows.every((row) => !isHomepageShowcaseEligible(row, NOW))).toBe(true);
    expect(selectHomepageShowcase(rows, NOW)).toBeNull();
  });

  it("does not re-date older original reports from their ingest timestamp", () => {
    const stale = scored({
      id: "older-report",
      publishedAt: "2026-10-05T08:00:00Z",
      createdAt: "2026-10-08T09:00:00Z",
    });
    expect(selectHomepageShowcase([stale], NOW)).toMatchObject({
      kind: "scored", isCurrent: false,
    });
  });

  it("automatically replaces a historical story when a specific verified story arrives", () => {
    const old = scored({
      id: "previous",
      createdAt: "2026-10-05T19:00:00Z",
      publishedAt: "2026-10-05T19:00:00Z",
    });
    const fresh = scored({
      id: "new",
      title: "Geomacro finds parliament approves new capital restrictions",
    });
    expect(selectHomepageShowcase([old], NOW)?.event.id).toBe("previous");
    expect(selectHomepageShowcase([old, fresh], NOW)?.event.id).toBe("new");
  });
});
