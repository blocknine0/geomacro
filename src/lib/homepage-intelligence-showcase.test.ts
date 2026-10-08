import { describe, expect, it } from "vitest";
import { selectHomepageShowcase } from "./homepage-intelligence-showcase";
import type { IntelEvent } from "./use-intelligence";

const NOW = Date.parse("2026-10-08T10:00:00Z");
function event(overrides: Partial<IntelEvent> = {}): IntelEvent {
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

describe("homepage showcase public-only selection", () => {
  it("selects exactly one verified winner across all three categories", () => {
    const rows = [
      event({ id: "geo" }),
      event({ id: "macro", category: "macro", severity: 98 }),
      event({ id: "mineral", category: "rare_earth", severity: 75 }),
    ];
    expect(selectHomepageShowcase(rows, NOW)?.event.id).toBe("macro");
  });

  it("retains a historical verified story when no last-24h signal qualifies", () => {
    const older = event({ id: "old", createdAt: "2026-10-04T08:00:00Z", publishedAt: "2026-10-04T08:00:00Z" });
    const result = selectHomepageShowcase([older], NOW);
    expect(result?.event.id).toBe("old");
    expect(result?.isCurrent).toBe(false);
    expect(result?.observedAt).toBe("2026-10-04T08:00:00.000Z");
  });

  it("excludes raw-looking and unscored/uncertified observation records", () => {
    const unscored = event({ publicStatus: "live_observed", severity: null, title: "Geomacro observes possible change" });
    const raw = event({ title: "Associated Press: raw upstream headline", id: "raw" });
    expect(selectHomepageShowcase([unscored, raw], NOW)).toBeNull();
  });

  it("does not relabel an old article with a fresh ingestion timestamp", () => {
    const historical = event({ id: "historical", publishedAt: "2021-10-08T08:00:00Z" });
    expect(selectHomepageShowcase([historical], NOW)?.isCurrent).toBe(false);
  });

  it("excludes future-dated, category-unknown and invalid score records", () => {
    expect(selectHomepageShowcase([
      event({ id: "future", publishedAt: "2026-10-09T08:00:00Z" }),
      event({ id: "unknown", category: "crypto" }),
      event({ id: "fake", severity: 102 }),
    ], NOW)).toBeNull();
  });

  it("automatically changes winner when new higher-ranked qualified evidence arrives", () => {
    const previous = event({ id: "previous" });
    const incoming = event({ id: "new", category: "rare_earth", severity: 95, createdAt: "2026-10-08T09:00:00Z", publishedAt: "2026-10-08T09:00:00Z" });
    expect(selectHomepageShowcase([previous], NOW)?.event.id).toBe("previous");
    expect(selectHomepageShowcase([previous, incoming], NOW)?.event.id).toBe("new");
  });
});
