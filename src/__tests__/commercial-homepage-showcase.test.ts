import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync("src/components/home/live-intelligence-showcase.tsx", "utf8");
const home = readFileSync("src/components/home/commercial-home.tsx", "utf8");

describe("Geomacro Finds commercial homepage presentation", () => {
  it("shows exactly one public original-dated free Find with a truthful evidence clock",()=>{
    expect(card).toContain("selectHomepageFreeFind(visibleCards)");
    expect(card).toContain("findCardFromObservedRelease(s,now)");
    expect(card).toContain("winner.originalAt");
    expect(card).toContain("dateTime={winner.originalAt}");
    expect(card).toContain("display?.headline");
    expect(card).toContain("publicHomeFindCopy(card)");
    expect(card).toContain("display?.what_changed");
    expect(card).toContain("card.why_it_matters");
    expect(card).not.toContain("categoryLeads(intelligence.data.all)");
    expect(card).not.toContain("categoryHighlights");
    expect(card).not.toContain("<AccessOptions />");
    expect(card).not.toContain("Release observed · specific details pending");
    expect(card).toContain("relatedDomains.map(domain=>");
    expect(card).toContain("isConcreteHomeFind");
  });

  it("does not promote a free D1 release to paid GRO/score or fresh commercial review",()=>{
    expect(card).toContain("homeFindsPulse(visibleCards)");
    expect(card).toContain('fetch("/api/v1/finds"');
    expect(card).toContain("Original release within 24h");
    expect(card).toContain("Earlier original release · not current");
    expect(card).not.toContain("independent same-event review not established");
    expect(card).not.toContain("No eligible concrete news");
    expect(card).not.toContain("useIntelligence(");
    expect(card).not.toContain("RiskBadge");
    expect(card).not.toContain("event.severity");
  });

  it("keeps sales enquiries open without suggesting an active monthly checkout", () => {
    const guide = readFileSync("src/components/commercial-access-guide.tsx", "utf8");
    const shell = readFileSync("src/components/site-shell.tsx", "utf8");
    expect(shell).not.toContain("<CommercialAccessGuide />");
    expect(shell).toContain('label: "Store"');
    expect(guide).toContain("Exact USDC price by capability");
    expect(guide).toContain("Coming Soon · enquiries open");
    expect(guide).toContain("Request monthly access");
    expect(guide).toContain("mailto:contact@geomacro.live");
    expect(card).not.toContain("From 0.05 USDC");
  });

  it("has a balanced responsive hero and correct risk-indices route", () => {
    expect(home).toContain("lg:grid-cols-2");
    expect(home).toContain("text-[clamp(2.5rem,4.5vw,4rem)]");
    expect(home).toContain("<LiveIntelligenceShowcase initialFindCards={initialFindCards} />");
    expect(home).toContain('to="/risk-indices"');
    expect(home).toContain("Follow the risks that affect your work.");
    expect(home).not.toContain("Not another raw-data feed.");
  });

  it("avoids customer-facing internal runtime vocabulary in showcase markup", () => {
    for (const phrase of [
      "Verified event",
      "public event projection",
      "runtime",
      "schema",
      "raw source",
      "baseline",
      "fail-closed",
    ]) {
      // Source comments may document safety, but rendered JSX must not.
      const afterReturn = card.slice(card.indexOf("  return (", card.indexOf("export function LiveIntelligenceShowcase")));
      expect(afterReturn.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });
});
