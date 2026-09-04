import { describe, expect, it } from "vitest";
import {
  GRI_METHOD_VERSION,
  attributeGriChange,
  calculateGri,
  type GriInputRow,
} from "@/lib/gri-engine-v10.js";

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);

function row(
  id: string,
  category: string,
  severity: number,
  confidence: number,
  ageHours: number,
  source = id,
): GriInputRow {
  return {
    id,
    category,
    severity,
    confidence,
    source_name: source,
    source_url: `https://${source}.example/${id}`,
    created_at: new Date(NOW - ageHours * HOUR).toISOString(),
    published_at: new Date(NOW - ageHours * HOUR).toISOString(),
  };
}

describe("GRI v1 canonical engine", () => {
  it("is explicitly versioned and never returns a synthetic zero", () => {
    const empty = calculateGri([], NOW);
    expect(empty.methodologyVersion).toBe(GRI_METHOD_VERSION);
    expect(empty.rawScore).toBeNull();
    expect(empty.displayScore).toBeNull();
    expect(empty.coverage).toBe(0);
  });

  it("uses severity as the signal and confidence/recency only as weights", () => {
    const result = calculateGri(
      [
        row("fresh", "geopolitics", 80, 100, 0, "a"),
        row("old", "geopolitics", 40, 100, 24, "b"),
      ],
      NOW,
    );
    // weights are 1 and 0.5 => (80 + 20) / 1.5 = 66.666...
    expect(result.rawScore).toBeCloseTo(66.6666667, 5);
    expect(result.displayScore).toBe(67);
  });

  it("caps source volume so duplicate publication volume cannot dominate", () => {
    const oneHigh = row("high", "macro", 90, 100, 0, "wire-a");
    const oneLow = row("low", "macro", 10, 100, 0, "wire-b");
    const baseline = calculateGri([oneHigh, oneLow], NOW);
    const duplicates = Array.from({ length: 20 }, (_, i) =>
      row(`dup-${i}`, "macro", 90, 100, 0, "wire-a"),
    );
    const flooded = calculateGri([oneLow, ...duplicates], NOW);
    expect(baseline.rawScore).toBeCloseTo(50, 8);
    expect(flooded.rawScore).toBeCloseTo(50, 8);
  });

  it("renormalizes only active domains and exposes missing domains as coverage", () => {
    const result = calculateGri(
      [row("g", "geopolitics", 80, 100, 0), row("m", "macro", 40, 100, 0)],
      NOW,
    );
    expect(result.coverage).toBe(0.5);
    expect(result.rawScore).toBeCloseTo(60, 8);
    expect(result.activeCategories).toEqual(["geopolitics", "macro"]);
  });

  it("uses created_at as observation time and excludes evidence older than 72h", () => {
    const result = calculateGri(
      [row("inside", "crypto", 55, 100, 72), row("outside", "crypto", 100, 100, 72.01)],
      NOW,
    );
    expect(result.eventCount).toBe(1);
    expect(result.displayScore).toBe(55);
  });

  it("event contribution points sum exactly to the raw score", () => {
    const result = calculateGri(
      [
        row("g", "geopolitics", 80, 90, 1, "a"),
        row("m", "macro", 50, 80, 3, "b"),
        row("r", "rare_earth", 65, 70, 8, "c"),
        row("c", "crypto", 40, 60, 12, "d"),
      ],
      NOW,
    );
    const sum = result.contributions.reduce((acc, e) => acc + e.contributionPoints, 0);
    expect(sum).toBeCloseTo(result.rawScore as number, 10);
  });

  it("decomposes a 24h score move with effectively zero residual", () => {
    // These older events existed at both comparison endpoints.
    const stable = [
      row("g-old", "geopolitics", 80, 90, 30, "a"),
      row("m-old", "macro", 70, 90, 30, "b"),
    ];
    // This low-risk event exists only at the current endpoint.
    const newLow = row("g-new", "geopolitics", 20, 100, 2, "c");
    const previous = calculateGri(stable, NOW - 24 * HOUR);
    const current = calculateGri([...stable, newLow], NOW);
    const change = attributeGriChange(previous, current);
    expect(change).not.toBeNull();
    expect(change?.rawDelta).toBeLessThan(0);
    expect(change?.eventChanges.some((e) => e.kind === "added" && e.eventId === "g-new")).toBe(true);
    expect(Math.abs(change?.residual ?? 1)).toBeLessThan(1e-10);
  });
});
