import { describe, expect, it } from "vitest";
import {
  applyIntelFilters,
  buildPublicIntelligence,
} from "./use-intelligence";
import {
  PUBLIC_INTELLIGENCE_CATEGORIES,
  type PublicIntelligenceRow,
} from "./public-intelligence.functions";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

function row(overrides: Partial<PublicIntelligenceRow> = {}): PublicIntelligenceRow {
  return {
    id: "event",
    source_title: "Event",
    summary: null,
    category: "geopolitics",
    severity: 50,
    delta: 5,
    created_at: "2026-09-22T11:00:00.000Z",
    published_at: "2026-09-22T11:00:00.000Z",
    ...overrides,
  };
}

describe("public intelligence recency contract", () => {
  it("keeps all three public intelligence categories available even when one is temporarily empty", () => {
    const result = buildPublicIntelligence(
      [
        row({
          category: "macro",
          source_title: "Macro event",
        }),
      ],
      NOW,
    );

    expect(result.categories).toEqual([...PUBLIC_INTELLIGENCE_CATEGORIES]);
    expect(result.categoryCounts.map((item) => item.category)).toEqual(["macro"]);
  });
  it("uses publication time instead of ingestion time for the current 24h window", () => {
    const historical = row({
      id: "historical-import",
      source_title: "1991 historical archive",
      severity: 99,
      created_at: "2026-09-22T10:00:00.000Z",
      published_at: "1991-12-26T00:00:00.000Z",
    });
    const current = row({
      id: "current-event",
      source_title: "Current event",
      severity: 70,
      created_at: "2026-09-22T11:00:00.000Z",
      published_at: "2026-09-22T11:30:00.000Z",
    });

    const result = buildPublicIntelligence([historical, current], NOW);

    expect(result.today.map((event) => event.id)).toEqual(["current-event"]);
    expect(result.topRisks.map((event) => event.id)).toEqual(["current-event"]);
    expect(result.usedFallbackWindow).toBe(false);

    const defaultView = applyIntelFilters(result.all, {
      category: "all",
      query: "",
      sort: "risk",
    });
    expect(defaultView.map((event) => event.id)).toEqual(["current-event"]);

    const explicitResearch = applyIntelFilters(result.all, {
      category: "all",
      query: "historical",
      sort: "risk",
    });
    expect(explicitResearch.map((event) => event.id)).toEqual(["historical-import"]);
  });

  it("keeps historical records available for explicit research/search without treating them as current risk topics", () => {
    const historical = row({
      id: "historical",
      source_title: "Historical archive",
      severity: 98,
      created_at: "2026-09-22T10:00:00.000Z",
      published_at: "1991-12-26T00:00:00.000Z",
    });

    const result = buildPublicIntelligence([historical], NOW);

    expect(result.today).toHaveLength(0);
    expect(result.topRisks).toHaveLength(0);
    expect(result.recent).toEqual([expect.objectContaining({ id: "historical" })]);
    expect(result.usedFallbackWindow).toBe(true);
    expect(result.all).toEqual([expect.objectContaining({ id: "historical" })]);
  });

  it("treats a valid current publication timestamp as authoritative when created_at is older", () => {
    const republished = row({
      id: "republished",
      severity: 80,
      created_at: "2026-09-01T10:00:00.000Z",
      published_at: "2026-09-22T11:45:00.000Z",
    });

    const result = buildPublicIntelligence([republished], NOW);

    expect(result.today.map((event) => event.id)).toEqual(["republished"]);
    expect(result.topRisks.map((event) => event.id)).toEqual(["republished"]);
  });

  it("falls back to created_at when publication time is absent", () => {
    const recordedOnly = row({
      id: "recorded-only",
      created_at: "2026-09-22T11:45:00.000Z",
      published_at: null,
    });

    const result = buildPublicIntelligence([recordedOnly], NOW);

    expect(result.today.map((event) => event.id)).toEqual(["recorded-only"]);
    expect(result.topRisks.map((event) => event.id)).toEqual(["recorded-only"]);
  });
});
