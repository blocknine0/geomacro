import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync("src/components/home/live-intelligence-showcase.tsx", "utf8");
const home = readFileSync("src/components/home/commercial-home.tsx", "utf8");

describe("Geomacro Finds commercial homepage presentation", () => {
  it("shows material, original-dated official highlights with credits and short analysis",()=>{
    expect(card).toContain("selectDailyOfficialFinds");
    expect(card).toContain("fetchDailyOfficialFinds");
    expect(card).toContain("item.headline");
    expect(card).toContain("item.whatChanged");
    expect(card).toContain("item.whyItMatters");
    expect(card).toContain("dateTime={item.originalAt}");
    expect(card).toContain("signal.sources_credited.join");
    expect(card).toContain("stories.slice(0,observations.length?2:4).map((story,index)");
    expect(card).toContain("observations.map((story,index)");
    expect(card).toContain("isConcreteHomeFind");
    expect(card).not.toContain("<AccessOptions />");
    expect(card).not.toContain("useIntelligence(");
    expect(card).not.toContain("RiskBadge");
  });

  it("never presents OSINT as verified official news or relabels older releases today",()=>{
    expect(card).toContain("Latest source observations · Not independently verified");
    expect(card).toContain("Official original releases · original dates preserved");
    expect(card).toContain("Earlier official release");
    expect(card).toContain("OSINT observations are unverified and never count as independently verified releases");
    expect(card).toContain('signal.status==="osint_feed_observed_unverified"');
    expect(card).toContain("originalDate(item.originalAt,signal.date_precision)");
    expect(card).toContain("No headlines, source dates, outcomes or scores are invented");
    expect(card).not.toContain("event.severity");
    const reader=readFileSync("src/lib/home-daily-official-finds.ts","utf8");
    expect(reader).toContain('v.status!=="official_release_observed_unscored"');
    expect(reader).toContain("v.same_event_corrob_verified!==false");
  });

  it("keeps sales enquiries open without suggesting an active monthly checkout", () => {
    const guide = readFileSync("src/components/commercial-access-guide.tsx", "utf8");
    const shell = readFileSync("src/components/site-shell.tsx", "utf8");
    expect(shell).not.toContain("<CommercialAccessGuide />");
    expect(shell).toContain('label: "Store & API"');
    expect(guide).toContain("Exact USDC price by capability");
    expect(guide).toContain("Coming Soon · enquiries open");
    expect(guide).toContain("Request monthly access");
    expect(guide).toContain("mailto:contact@geomacro.live");
    expect(card).not.toContain("From 0.05 USDC");
  });

  it("has a balanced responsive hero and correct risk-indices route", () => {
    expect(home).toContain("lg:grid-cols-2");
    expect(home).toContain("text-[clamp(2.5rem,4.5vw,4rem)]");
    expect(home).not.toContain("<LiveIntelligenceShowcase");
    expect(home).not.toContain("home-finds-title");
    expect(home).not.toContain("Explore Geomacro Finds.");
    expect(home).toContain("Follow the risks that affect your work.");
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
