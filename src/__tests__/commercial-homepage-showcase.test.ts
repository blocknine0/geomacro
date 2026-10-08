import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync("src/components/home/live-intelligence-showcase.tsx", "utf8");
const home = readFileSync("src/components/home/commercial-home.tsx", "utf8");

describe("Geomacro Finds commercial homepage presentation", () => {
  it("retains one canonical derived winner with a truthful actual event date", () => {
    expect(card).toContain("selectHomepageShowcase(intelligence.data.all)");
    expect(card).toContain("useIntelligence(null, 5 * 60_000)");
    expect(card).toContain("publicHeadline(event.title)");
    expect(card).toContain("categoryLeads(intelligence.data.all)");
    expect(card).toContain("winner.observedAt");
    expect(card).toContain("dateTime={winner.observedAt}");
    expect(card).not.toContain("Top verified · Last 24h");
    expect(card).not.toContain("Latest verified historical");
    expect(card).not.toContain("Current as of today");
  });

  it("never invents detail, scores or predictions, and only renders verified canonical summary", () => {
    expect(card).toContain("selectHomepageShowcase(intelligence.data.all)");
    expect(card).toContain("event.summary");
    expect(card).toContain("event.severity !== null");
    expect(card).toContain('winner.isCurrent ? "Verified within 24h" : "Historical verified assessment"');
    expect(card).not.toContain("FOCUS[event");
    expect(card).not.toContain("Potential next impact");
    expect(card).not.toContain("Specific causal drivers have not");
  });

  it("keeps sales enquiries open without suggesting an active monthly checkout", () => {
    expect(card).toContain('to="/pricing"');
    expect(card).toContain("0.05 USDC");
    expect(card).toContain("Monthly intelligence · Coming Soon");
    expect(card).toContain("Request a tailored plan");
    expect(card).toContain("enterprise coverage? Talk to us");
    expect(card).toContain("contact@geomacro.live");
    expect(card).toContain("mailto:");
  });

  it("has a balanced responsive hero and correct risk-indices route", () => {
    expect(home).toContain("minmax(0,1.02fr)_minmax(0,.98fr)");
    expect(home).toContain("text-[clamp(2.6rem,4vw,4.6rem)]");
    expect(home).toContain("<LiveIntelligenceShowcase />");
    expect(home).toContain('to="/risk-indices"');
    expect(home).toContain("Clarity without the noise.");
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
