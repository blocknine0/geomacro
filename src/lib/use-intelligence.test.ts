import { describe, expect, it } from "vitest";
import {
  applyIntelFilters,
  buildPublicIntelligence,
  latestOriginalEvidenceAt,
} from "./use-intelligence";
import {
  PUBLIC_INTELLIGENCE_CATEGORIES,
  type PublicIntelligenceRow,
} from "./public-intelligence.functions";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

function row(overrides: Partial<PublicIntelligenceRow> = {}): PublicIntelligenceRow {
  const merged: PublicIntelligenceRow = {
    id: "event",
    source_title: "Geomacro finds a material geopolitical risk event",
    summary: null,
    category: "geopolitics",
    severity: 50,
    delta: 5,
    created_at: "2026-09-22T11:00:00.000Z",
    published_at: "2026-09-22T11:00:00.000Z",
    ...overrides,
  };
  if (merged.source_title && !merged.source_title.startsWith("Geomacro finds ")) {
    merged.source_title = `Geomacro finds ${merged.source_title}`;
  }
  return merged;
}

describe("public intelligence recency contract", () => {
  it("keeps all three public intelligence categories available even when one is temporarily empty", () => {
    const result = buildPublicIntelligence([row({ category: "macro", source_title: "macro pressure rising" })], NOW);
    expect(result.categories).toEqual([...PUBLIC_INTELLIGENCE_CATEGORIES]);
    expect(result.categoryCounts.map((item) => item.category)).toEqual(["macro"]);
  });

  it("uses publication time instead of ingestion time for the current 24h window", () => {
    const historical = row({ id: "historical-import", source_title: "historical archive risk", severity: 99, created_at: "2026-09-22T10:00:00.000Z", published_at: "1991-12-26T00:00:00.000Z" });
    const current = row({ id: "current-event", source_title: "current material event", severity: 70, created_at: "2026-09-22T11:00:00.000Z", published_at: "2026-09-22T11:30:00.000Z" });
    const result = buildPublicIntelligence([historical, current], NOW);
    expect(result.today.map((event) => event.id)).toEqual(["current-event"]);
    expect(result.topRisks.map((event) => event.id)).toEqual(["current-event"]);
    expect(result.usedFallbackWindow).toBe(false);
    expect(applyIntelFilters(result.all, { category: "all", query: "", sort: "risk" }).map((event) => event.id)).toEqual(["current-event"]);
    expect(applyIntelFilters(result.all, { category: "all", query: "historical", sort: "risk" }).map((event) => event.id)).toEqual(["historical-import"]);
  });

  it("retains a single dated verified story for each stale domain when another domain is current", () => {
    const rows = [
      row({ id: "geo-current", category: "geopolitics", severity: 70, published_at: "2026-09-22T11:00:00.000Z" }),
      row({ id: "geo-old", category: "geopolitics", severity: 95, published_at: "2026-09-20T11:00:00.000Z" }),
      row({ id: "macro-old", category: "macro", severity: 66, published_at: "2026-09-19T11:00:00.000Z" }),
      row({ id: "macro-older", category: "macro", severity: 90, published_at: "2026-09-17T11:00:00.000Z" }),
      row({ id: "minerals-old", category: "rare_earth", severity: 88, published_at: "2026-09-18T11:00:00.000Z" }),
    ];
    const result = buildPublicIntelligence(rows, NOW);
    const displayed = applyIntelFilters(result.all, { category: "all", query: "", sort: "newest" });
    expect(displayed.map((event) => event.id)).toEqual(["geo-current", "macro-old", "minerals-old"]);
    expect(displayed.map((event) => [event.category, event.isCurrent])).toEqual([
      ["geopolitics", true], ["macro", false], ["rare_earth", false],
    ]);
    expect(displayed.every((event) => event.publicStatus === "verified_b2")).toBe(true);
    expect(displayed.every((event) => event.severity !== null)).toBe(true);
    expect(displayed.every((event) => !event.title.includes("synthetic"))).toBe(true);
    // Explicit category research still shows original history, not only the lead.
    expect(applyIntelFilters(result.all, { category: "macro", query: "", sort: "newest" })
      .map((event) => event.id)).toEqual(["macro-old", "macro-older"]);
  });

  it("reserves room for absent-domain verified context when one fresh domain has 50 stories", () => {
    const geo = Array.from({ length: 50 }, (_, n) => row({
      id: `geo-${n}`, category: "geopolitics",
      published_at: new Date(NOW - (n + 1) * 60_000).toISOString(),
    }));
    const result = buildPublicIntelligence([
      ...geo,
      row({ id: "macro-stale", category: "macro", published_at: "2026-09-15T00:00:00Z" }),
      row({ id: "minerals-stale", category: "rare_earth", published_at: "2026-09-16T00:00:00Z" }),
    ], NOW);
    const displayed = applyIntelFilters(result.all, { category: "all", query: "", sort: "newest" });
    expect(displayed).toHaveLength(24);
    expect(displayed.map((x) => x.id)).toContain("macro-stale");
    expect(displayed.map((x) => x.id)).toContain("minerals-stale");
    expect(displayed.find((x) => x.id === "macro-stale")?.isCurrent).toBe(false);
  });

  it("shows the newest verified records instead of an empty page when the 24h window is quiet", () => {
    const older = row({ id: "older", source_title: "older verified event", severity: 90, created_at: "2026-09-19T10:00:00.000Z", published_at: "2026-09-19T10:00:00.000Z" });
    const newer = row({ id: "newer", source_title: "newer verified event", severity: 40, created_at: "2026-09-21T10:00:00.000Z", published_at: "2026-09-21T10:00:00.000Z" });
    const result = buildPublicIntelligence([older, newer], NOW);
    expect(result.today).toHaveLength(0);
    expect(result.usedFallbackWindow).toBe(true);
    expect(applyIntelFilters(result.all, { category: "all", query: "", sort: "newest" }).map((event) => event.id)).toEqual(["newer", "older"]);
  });

  it("keeps historical records available for explicit research/search without treating them as current risk topics", () => {
    const historical = row({ id: "historical", source_title: "historical material risk", severity: 98, created_at: "2026-09-22T10:00:00.000Z", published_at: "1991-12-26T00:00:00.000Z" });
    const result = buildPublicIntelligence([historical], NOW);
    expect(result.today).toHaveLength(0);
    expect(result.topRisks).toHaveLength(0);
    expect(result.recent).toEqual([expect.objectContaining({ id: "historical" })]);
    expect(result.usedFallbackWindow).toBe(true);
    expect(result.all).toEqual([expect.objectContaining({ id: "historical" })]);
  });

  it("treats a valid current publication timestamp as authoritative when created_at is older", () => {
    const result = buildPublicIntelligence([row({ id: "republished", severity: 80, created_at: "2026-09-01T10:00:00.000Z", published_at: "2026-09-22T11:45:00.000Z" })], NOW);
    expect(result.today.map((event) => event.id)).toEqual(["republished"]);
    expect(result.topRisks.map((event) => event.id)).toEqual(["republished"]);
  });

  it("never promotes recently restored scored rows with missing original published_at", () => {
    const result = buildPublicIntelligence([
      row({
        id: "recorded-only",
        severity: 99,
        delta: 30,
        created_at: "2026-09-22T11:45:00.000Z",
        published_at: null,
      }),
    ], NOW);
    // Preserve context in the explicit archive; never make it today's risk,
    // emerging risk, fastest-moving risk, or a fresh monitoring/evidence time.
    expect(result.all).toEqual([expect.objectContaining({
      id: "recorded-only", isCurrent: false, publicStatus: "verified_b2",
    })]);
    expect(result.today).toHaveLength(0);
    expect(result.topRisks).toHaveLength(0);
    expect(result.fastestMoving).toBeNull();
    expect(result.emerging).toBeNull();
    expect(result.usedFallbackWindow).toBe(true);
    expect(result.verifiedRiskContext).toEqual([
      expect.objectContaining({ id: "recorded-only", isCurrent: false }),
    ]);
    expect(latestOriginalEvidenceAt(result.all)).toBeNull();
  });

  it("retains older original evidence time instead of the newest B2 restore time", () => {
    const result = buildPublicIntelligence([
      row({ id: "missing-original", category: "geopolitics",
        severity: 98, published_at: null, created_at: "2026-09-22T11:59:00Z" }),
      row({ id: "real-original", category: "macro",
        severity: 64, published_at: "2026-09-18T08:00:00Z",
        created_at: "2026-09-22T11:58:00Z" }),
    ], NOW);
    expect(result.all.every((event) => !event.isCurrent)).toBe(true);
    expect(result.today).toHaveLength(0);
    expect(result.topRisks).toHaveLength(0);
    expect(latestOriginalEvidenceAt(result.all)).toBe(
      Date.parse("2026-09-18T08:00:00Z"),
    );
  });
});
