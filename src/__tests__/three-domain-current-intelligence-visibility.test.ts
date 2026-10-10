import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { intelligenceDomainPulse } from "@/lib/intelligence-domain-pulse";
import { buildPublicIntelligence } from "@/lib/use-intelligence";
import type { PublicIntelligenceRow } from "@/lib/public-intelligence.functions";

const now = Date.parse("2026-10-09T12:00:00.000Z");
const past = "2026-10-05T19:00:00.000Z";
const fresh = "2026-10-09T11:00:00.000Z";
const fixtures: PublicIntelligenceRow[] = [
  ...(["geopolitics", "macro", "rare_earth"] as const).map((category, i) => ({
    id: `verified-${category}`,
    source_title: `Geomacro finds verified ${category} dated risk assessment`,
    summary: "Evidence from the original verified assessment",
    category,
    severity: [67, 58, 71][i],
    delta: null,
    created_at: past,
    published_at: past,
    public_status: "verified_b2" as const,
  })),
  {
    id:"fresh-geo-observed",category:"geopolitics",
    source_title:"Geomacro observes a verified global conflict-monitoring signal",
    summary:"Derived monitored evidence, not a canonical risk score",
    severity:null,delta:null,created_at:fresh,published_at:fresh,
    public_status:"live_observed",
  },
];
describe("#1827 website Intelligence freshness visibility without invented three-domain scores", () => {
  it("keeps historical scores but does not display uncorroborated current observation", () => {
    const model = buildPublicIntelligence(fixtures, now);
    const pulse = intelligenceDomainPulse(model.all, now);
    expect(pulse.map(x => x.key)).toEqual(["geopolitics","macro","rare_earth"]);
    expect(pulse.map(x => x.state)).toEqual(["historical_verified","historical_verified","historical_verified"]);
    expect(pulse.map(x => x.currentScoredCount)).toEqual([0,0,0]);
    expect(pulse.map(x => x.currentObservedCount)).toEqual([0,0,0]);
    expect(pulse.map(x => x.lastScored?.severity)).toEqual([67,58,71]);
    expect(pulse.map(x => x.lastScored?.publishedAt)).toEqual([past,past,past]);
    expect(pulse[0].newestObserved).toBeNull();
    expect(pulse[1].newestObserved).toBeNull();
    expect(pulse[2].newestObserved).toBeNull();
  });
  it("never marks stale or future observations current and cannot manufacture absent scores", () => {
    const model = buildPublicIntelligence([
      fixtures[3],
      {
        ...fixtures[3],id:"future-invalid", published_at:"2026-10-09T13:00:00.000Z",
        created_at:"2026-10-09T13:00:00.000Z",
      },
      {
        ...fixtures[3],id:"too-old", category:"geopolitics",
        published_at:"2026-10-02T10:00:00.000Z", created_at:"2026-10-02T10:00:00.000Z",
      },
    ], now);
    const pulse = intelligenceDomainPulse(model.all,now);
    expect(pulse.map(x=>x.state)).toEqual(["unavailable","unavailable","unavailable"]);
    expect(pulse[0].currentObservedCount).toBe(0);
    expect(pulse[0].currentScoredCount).toBe(0);
    expect(pulse[0].lastScored).toBeNull();
  });
  it("shows an actual current scored reading only if signed public scores existed", () => {
    const model = buildPublicIntelligence([...fixtures, {
      ...fixtures[0],id:"real-current-macro",category:"macro",
      severity:61,published_at:fresh,created_at:fresh,
    }],now);
    const pulse = intelligenceDomainPulse(model.all,now);
    expect(pulse[1].state).toBe("current_scored");
    expect(pulse[1].lastScored?.severity).toBe(61);
    expect(pulse[1].currentScoredCount).toBe(1);
  });
  it("retains historical score cards and shows admitted current unscored monitoring separately on Intelligence page", () => {
    const source = readFileSync("src/routes/intelligence.tsx","utf8");
    expect(source).toContain("intelligenceDomainPulse(intel.data?.all ?? [])");
    expect(source).toContain('event.publicStatus === "live_observed" && event.isCurrent');
    expect(source).toContain("No severity assigned");
    expect(source).toContain("New developments observed · not risk-scored");
    expect(source).toContain("Last verified historical score");
    expect(source).toContain("No current independently eligible monitoring signal in this domain.");
    expect(source).toContain("categoryLeads(pool)");
    expect(source).toContain("scoredNews(intel.data?.all ?? [])");
    expect(source).not.toContain("severity: 50");
  });
  it("homepage retains one canonical verified headline, but truthfully exposes per-domain monitoring status", () => {
    const source = readFileSync("src/components/home/live-intelligence-showcase.tsx","utf8");
    expect(source).toContain("selectHomepageShowcase(intelligence.data.all)");
    expect(source).toContain("intelligenceDomainPulse(intelligence.data?.all ?? [])");
    expect(source).toContain("Evidence freshness · three global domains");
    expect(source).toContain("Historical verified");
    expect(source).toContain("Fresh signal · unscored");
    expect(source).toContain("Awaiting verification");
  });
});
