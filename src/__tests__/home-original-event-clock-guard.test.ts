import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { selectHomepageShowcase } from "@/lib/homepage-intelligence-showcase";
import { intelligenceDomainPulse } from "@/lib/intelligence-domain-pulse";
import { currentVerifiedDeskEvents } from "@/lib/intelligence-current-desk";
import type { IntelEvent } from "@/lib/use-intelligence";

const NOW=Date.parse("2026-10-10T16:00:00.000Z");
function row(id:string,category:"geopolitics"|"macro"|"rare_earth",
  original:string|null,stored="2026-10-10T15:59:00.000Z"):IntelEvent{
  return {
    id,title:"Geomacro finds central bank changes policy affecting cross-border financing",
    summary:"A derived and reviewed policy risk explanation.",
    category,sourceName:null,severity:67,delta:2,
    createdAt:stored,publishedAt:original,
    publicStatus:"verified_b2",isCurrent:true,
  };
}
describe("#1827 never make an older risk event new by restoring it",()=>{
  it("rejects missing original publication despite a brand-new ingest, B2 or website clock",()=>{
    const undated=row("undated","macro",null);
    expect(selectHomepageShowcase([undated],NOW)).toBeNull();
    expect(currentVerifiedDeskEvents([undated],NOW)).toEqual([]);
    expect(intelligenceDomainPulse([undated],NOW).map(x=>x.state))
      .toEqual(["unavailable","unavailable","unavailable"]);
  });
  it("keeps genuine historical originals historical even after today's re-upload",()=>{
    const stale=row("stale","macro","2026-10-07T09:00:00.000Z");
    const homepage=selectHomepageShowcase([stale],NOW);
    expect(homepage?.event.id).toBe("stale");
    expect(homepage?.isCurrent).toBe(false);
    expect(homepage?.observedAt).toBe("2026-10-07T09:00:00.000Z");
    expect(currentVerifiedDeskEvents([stale],NOW)).toEqual([]);
    const pulse=intelligenceDomainPulse([stale],NOW);
    expect(pulse.map(x=>x.state)).toEqual([
      "unavailable","historical_verified","unavailable",
    ]);
    expect(pulse[1].lastEvidenceAt).toBe("2026-10-07T09:00:00.000Z");
  });
  it("permits only genuinely published recent verified scores, without inventing data",()=>{
    const real=row("current","rare_earth","2026-10-10T15:10:00.000Z");
    expect(selectHomepageShowcase([real],NOW)?.isCurrent).toBe(true);
    expect(currentVerifiedDeskEvents([real],NOW).map(x=>x.id)).toEqual(["current"]);
    const pulse=intelligenceDomainPulse([real],NOW);
    expect(pulse[2].state).toBe("current_scored");
    expect(pulse[2].currentScoredCount).toBe(1);
  });
  it("excludes old/undated topRisks from a current homepage before rendering",()=>{
    const component=readFileSync("src/components/home/hot-topics-live.tsx","utf8");
    expect(component).toContain("currentVerifiedDeskEvents(intelligence.data?.all ?? [])");
    expect(component).not.toContain("intelligence.data?.topRisks.slice");
    expect(component).toContain("observedLabel(event.publishedAt)");
    expect(component).not.toContain("observedLabel(event.publishedAt ?? event.createdAt)");
    expect(component).toContain("Historical risk assessments remain in the dated Intelligence archive");
    const source=readFileSync("src/lib/homepage-intelligence-showcase.ts","utf8");
    const domain=readFileSync("src/lib/intelligence-domain-pulse.ts","utf8");
    expect(source).not.toContain("Date.parse(event.createdAt)");
    expect(domain).not.toContain("Date.parse(value.createdAt)");
  });
});
