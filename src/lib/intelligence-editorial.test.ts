import { describe, expect, it } from "vitest";
import { categoryLeads, publicHeadline, scoredNews } from "./intelligence-editorial";
import type { IntelEvent } from "./use-intelligence";

const NOW = Date.parse("2026-10-08T10:00:00Z");
const story = (overrides: Partial<IntelEvent> = {}): IntelEvent => ({
  id: "geo-1",
  title: "Geomacro finds India imposes new mineral-export restrictions",
  summary: "Approved derived intelligence with time-stamped risk classification.",
  category: "geopolitics",
  severity: 75,
  delta: 4,
  publicStatus: "verified_b2",
  sourceName: null,
  createdAt: "2026-10-08T08:00:00Z",
  publishedAt: "2026-10-08T08:00:00Z",
  isCurrent: true,
  ...overrides,
});

describe("commercial Intelligence news desk", () => {
  it("preserves real underlying story text, not generic class or duplicated location", () => {
    expect(publicHeadline("Geomacro observes assault activity in Delhi, Delhi, India"))
      .toBe("assault activity in Delhi, India");
    expect(publicHeadline("Geomacro observes fighting in Gaza, Israel (general), Israel"))
      .toBe("fighting in Gaza, Israel");
    expect(publicHeadline("Geomacro finds India announces new export restrictions"))
      .toBe("India announces new export restrictions");
    expect(publicHeadline("Geomacro finds a rise in oil prices amid new sanctions"))
      .toBe("a rise in oil prices amid new sanctions");
  });

  it("never lists unscored event-export data or fabricated severity", () => {
    const generic = story({
      id: "generic", title: "Geomacro observes assault activity in Delhi, Delhi, India",
      publicStatus: "live_observed", severity: null, delta: null,
    });
    const vague = story({
      id: "vague", title: "Geomacro finds threat activity in Iran", severity: 90,
    });
    const invalid = story({ id: "invalid", severity: 110 });
    expect(scoredNews([generic, vague, invalid, story()], NOW).map((event) => event.id)).toEqual(["geo-1"]);
    expect(categoryLeads([generic], NOW).every((domain) => domain.event === null)).toBe(true);
  });

  it("returns the best eligible scored report in each of exactly three launch domains", () => {
    const oldMacro = story({
      id: "old-macro", category: "macro", severity: 90,
      title: "Geomacro finds ECB raises borrowing costs amid inflation pressure",
      publishedAt: "2026-10-02T07:00:00Z",
      createdAt: "2026-10-02T07:00:00Z",
      isCurrent: false,
    });
    const minerals = story({
      id: "minerals", category: "rare_earth", severity: 65,
      title: "Geomacro finds Indonesia revises nickel-export licensing requirements",
    });
    const leads = categoryLeads([oldMacro, minerals, story()], NOW);
    expect(leads.map((lead) => lead.key)).toEqual(["geopolitics", "macro", "rare_earth"]);
    expect(leads.map((lead) => lead.event?.id)).toEqual(["geo-1", "old-macro", "minerals"]);
    expect(leads.map((lead) => lead.isCurrent)).toEqual([true, false, true]);
  });

  it("ranks severity only among timely scored stories, retaining original publication dates", () => {
    const recentLow = story({ id: "newer", severity: 55, publishedAt: "2026-10-08T09:00:00Z" });
    const recentHigh = story({ id: "older", severity: 85, publishedAt: "2026-10-08T04:00:00Z" });
    const pastHigh = story({
      id: "past", severity: 95, publishedAt: "2026-10-03T08:00:00Z",
    });
    expect(categoryLeads([pastHigh, recentLow, recentHigh], NOW)[0].event?.id).toBe("older");
  });
});
