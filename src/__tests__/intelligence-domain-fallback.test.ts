import { describe, expect, it } from "vitest";
import { buildPublicIntelligence } from "../lib/use-intelligence";
import type { PublicIntelligenceRow } from "../lib/public-intelligence.functions";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

function row(id: string, severity: number, publishedAt: string): PublicIntelligenceRow {
  return {
    id,
    source_title: id,
    summary: null,
    category: "geopolitics",
    severity,
    delta: null,
    created_at: publishedAt,
    published_at: publishedAt,
  };
}

describe("Intelligence fallback domain context", () => {
  it("shows evidence-driven domain counts for a latest-verified quiet-window fallback", () => {
    const result = buildPublicIntelligence(
      [
        row("older", 90, "2026-09-19T10:00:00.000Z"),
        row("newer", 40, "2026-09-21T10:00:00.000Z"),
      ],
      NOW,
    );

    expect(result.usedFallbackWindow).toBe(true);
    expect(result.today).toHaveLength(0);
    expect(result.topRisks).toHaveLength(0);
    expect(result.categoryCounts).toEqual([
      { category: "geopolitics", count: 2, avgSeverity: 65 },
    ]);
  });
});
