import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { IntelEvent } from "@/lib/use-intelligence";
import { currentVerifiedDeskEvents } from "@/lib/intelligence-current-desk";
import { categoryLeads } from "@/lib/intelligence-editorial";

const NOW = Date.parse("2026-10-10T14:40:00.000Z");
function row(id: string, publishedAt: string|null, createdAt: string, category = "geopolitics"): IntelEvent {
  return {
    id, title: "Geomacro finds independently corroborated material risk change",
    summary: "Derived and verified risk context", category,
    severity: 68, delta: null, sourceName: null, createdAt, publishedAt,
    isCurrent: true, publicStatus: "verified_b2",
  };
}
describe("#1827 public Intelligence current desk never replays archive data", () => {
  it("accepts independently scored real last-24h publisher publication times only", () => {
    const live=row("current","2026-10-10T13:35:00.000Z","2026-10-10T14:36:00.000Z");
    const historic=row("historical","2026-10-01T14:00:00.000Z","2026-10-10T14:39:00.000Z");
    const missing=row("missing",null,"2026-10-10T14:39:00.000Z");
    const future=row("future","2026-10-11T12:00:00.000Z","2026-10-10T14:39:00.000Z");
    const justOutside=row("outside","2026-10-09T14:39:59.000Z","2026-10-10T14:39:00.000Z");
    expect(currentVerifiedDeskEvents([live,historic,missing,future,justOutside],NOW))
      .toEqual([live]);
    const leads=categoryLeads(currentVerifiedDeskEvents([historic,missing,future],NOW),NOW);
    expect(leads).toHaveLength(3);
    expect(leads.every(x => x.event===null && x.isCurrent===false)).toBe(true);
  });
  it("rejects unscored observations, non-finite severity and missing evidence timestamps",()=>{
    const fresh=row("recent","2026-10-10T13:35:00.000Z","2026-10-10T14:36:00.000Z");
    const observed={...fresh,publicStatus:"live_observed" as const,severity:null,delta:null};
    const forged={...fresh,severity:NaN};
    expect(currentVerifiedDeskEvents([observed,forged],NOW)).toEqual([]);
    expect(currentVerifiedDeskEvents([fresh],NaN)).toEqual([]);
  });
  it("renders current-first landing, hidden dated archive and explicit no-current state",()=>{
    const route=readFileSync("src/routes/intelligence.tsx","utf8");
    expect(route).toContain("currentVerifiedDeskEvents(pool)");
    expect(route).toContain("categoryLeads(currentDesk)");
    expect(route).toContain("visibleFiltered = showHistoricalArchive ? filtered : currentVerifiedDeskEvents(filtered)");
    expect(route).toContain("Verified news developments");
    expect(route).toContain("No current verified risk assessment is available");
    expect(route).toContain("Live Intelligence refresh unavailable");
    expect(route).toContain("Retry live verification");
    expect(route).toContain("View historical archive");
    expect(route).toContain("Hide historical archive");
    expect(route).toContain("Historical verified assessment");
    expect(route).not.toContain("Leading verified developments");
    expect(route).not.toContain("Latest verified assessments");
    expect(route).not.toContain("previous.map(");
  });
});
