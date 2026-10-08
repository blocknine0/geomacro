import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyIntelFilters,
  buildPublicIntelligence,
} from "@/lib/use-intelligence";
import type { PublicIntelligenceRow } from "@/lib/public-intelligence.functions";

const route = readFileSync("src/routes/intelligence.tsx", "utf8");
const NOW = Date.parse("2026-10-04T20:40:00.000Z");

function scored(overrides: Partial<PublicIntelligenceRow>): PublicIntelligenceRow {
  return {
    id: "row",
    source_title: "Geomacro finds verified risk evidence",
    summary: null,
    category: "macro",
    severity: 50,
    delta: null,
    created_at: "2026-10-04T20:00:00.000Z",
    published_at: "2026-10-04T20:00:00.000Z",
    public_status: "verified_b2",
    ...overrides,
  } as PublicIntelligenceRow;
}

describe("#1414 Intelligence latest-score display truth", () => {
  it("defaults the workspace to newest rather than letting an older higher score look current", () => {
    expect(route).toContain('useState<IntelSort>("newest")');
    expect(route).toContain('available.includes(sort) ? sort : "newest"');
    expect(route.indexOf('<option value="newest">Newest</option>')).toBeLessThan(
      route.indexOf('<option value="risk">Highest risk</option>'),
    );

    const model = buildPublicIntelligence([
      scored({
        id: "macro-oct-1",
        severity: 70,
        published_at: "2026-10-01T05:15:00.000Z",
        created_at: "2026-10-01T08:19:50.000Z",
      }),
      scored({
        id: "macro-oct-4",
        severity: 65,
        published_at: "2026-10-04T18:14:40.000Z",
        created_at: "2026-10-04T20:04:36.000Z",
      }),
    ], NOW);

    expect(applyIntelFilters(model.all, {
      category: "macro",
      query: "",
      sort: "newest",
    }).map((row) => row.id)).toEqual(["macro-oct-4", "macro-oct-1"]);

    expect(applyIntelFilters(model.all, {
      category: "macro",
      query: "",
      sort: "risk",
    }).map((row) => row.id)).toEqual(["macro-oct-1", "macro-oct-4"]);
  });

  it("separates feed refresh from the original score evidence timestamp", () => {
    expect(route).toContain('latest.isCurrent ? "Latest verified score" : "Last verified score"');
    expect(route).toContain('event.isCurrent ? "Current verified assessment" : "Historical verified assessment"');
    expect(route).toContain("Monitoring updated");
    expect(route).toContain("Earlier assessments retain their original dates.");
  });

  it("keeps a quiet rare-earth score historical instead of manufacturing freshness", () => {
    const model = buildPublicIntelligence([
      scored({
        id: "rare-oct-1",
        category: "rare_earth",
        severity: 70,
        published_at: "2026-10-01T16:00:00.000Z",
        created_at: "2026-10-01T16:29:47.000Z",
      }),
    ], NOW);

    expect(model.all).toEqual([
      expect.objectContaining({
        id: "rare-oct-1",
        publicStatus: "verified_b2",
        severity: 70,
        isCurrent: false,
      }),
    ]);
    expect(model.today).toHaveLength(0);
  });
});
