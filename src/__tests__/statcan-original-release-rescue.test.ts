import { describe, expect, it } from "vitest";
import {
  acceptedOriginalArticleLink,
  conservativeDayReleaseMs,
  deriveStatelessSignals,
  parseFirstPartyFeed,
  type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";
import { verifiedStatcanOriginalReleaseDay } from "@/lib/stateless-statcan-original.server";

const url = "https://www150.statcan.gc.ca/n1/daily-quotidien/261013/dq261013a-eng.htm";
const now = Date.parse("2026-10-15T16:00:00Z");
const source: StatelessSourceSpec = {
  id: "statcan_prices", category: "macro", media: "atom",
  url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom",
  allowedHosts: ["www150.statcan.gc.ca"],
  credit: "Statistics Canada",
  statcanOriginalPage: true,
};
const title = "Consumer Price Index, September 2026";
const html = (date: string, heading = title) =>
  `<!doctype html><html><body><main><h1>${heading}</h1><p>Released: ${date}</p>
  <p>Date modified: 2026-10-15</p></main></body></html>`;
const feed = (articleUrl = url) =>
  `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <title>${title}</title><link rel="alternate" href="${articleUrl}"/>
    <updated>2026-10-15T15:00:00Z</updated></entry></feed>`;

describe("Statistics Canada source-native Daily publication rescue", () => {
  it("never treats Atom updated as an original release timestamp", () => {
    const parsed = parseFirstPartyFeed(feed(), source, now);
    expect(parsed.metrics.seen).toBe(1);
    expect(parsed.metrics.original_link_valid).toBe(1);
    expect(parsed.metrics.native_clock_valid).toBe(0);
    expect(parsed.dated).toEqual([]);
    expect(parsed.undatedGov).toEqual([{ title, articleUrl: url }]);
  });
  it("normalizes issuer-owned HTML title markup and accepts only its pinned alias path", () => {
    const alias = "https://www.statcan.gc.ca/daily-quotidien/261013/dq261013a-eng.htm";
    const trusted = { ...source, allowedHosts: ["www150.statcan.gc.ca", "www.statcan.gc.ca"] };
    const originalAtom = `<feed><entry><title type="html">&lt;span&gt;${title}&lt;/span&gt;</title>
      <link rel="alternate" href="${alias}"/><updated>2026-10-15T12:00:00Z</updated></entry></feed>`;
    const result = parseFirstPartyFeed(originalAtom, trusted, now);
    expect(result.metrics.relevant).toBe(1);
    expect(result.metrics.original_link_valid).toBe(1);
    expect(result.dated).toEqual([]);
    expect(result.undatedGov).toEqual([{ title, articleUrl: alias }]);
    expect(acceptedOriginalArticleLink(alias, trusted)).toBe(alias);
    expect(acceptedOriginalArticleLink(alias.replace("www.statcan.gc.ca","attacker.example"), trusted))
      .toBeNull();
  });
  it("verifies exact first-party article path, native Released day and headline", () => {
    expect(verifiedStatcanOriginalReleaseDay(html("2026-10-13"),url,title,now))
      .toBe("2026-10-13");
    expect(verifiedStatcanOriginalReleaseDay(html("2026-10-14"),url,title,now))
      .toBeNull();
    expect(verifiedStatcanOriginalReleaseDay(
      html("2026-10-13","Employment and payroll survey"),url,title,now))
      .toBeNull();
  });
  it("denies off-host, mismatched article date, future, stale and modification-only clock", () => {
    const attacks = [
      url.replace("www150.statcan.gc.ca","attacker.example"),
      url.replace("261013a","261012a"),
      url.replace("/261013/","/261012/"),
      url.replace("dq261013a","dq261013x").replace("/261013/","/261014/"),
    ];
    for (const article of attacks) {
      expect(verifiedStatcanOriginalReleaseDay(html("2026-10-13"),article,title,now)).toBeNull();
    }
    expect(verifiedStatcanOriginalReleaseDay(html("2026-10-13"),url,title,
      Date.parse("2026-10-12T12:00:00Z"))).toBeNull();
    expect(verifiedStatcanOriginalReleaseDay(html("2026-10-13"),url,title,
      Date.parse("2026-11-20T12:00:00Z"))).toBeNull();
    expect(verifiedStatcanOriginalReleaseDay(
      '<h1>Consumer Price Index, September 2026</h1><p>Date modified: 2026-10-13</p>',
      url,title,now)).toBeNull();
    expect(acceptedOriginalArticleLink(
      "https://other.example.org/n1/daily-quotidien/261013/dq261013a-eng.htm",source))
      .toBeNull();
  });
  it("issues only a delayed and explicitly unscored derived observation", () => {
    const reviewed = {
      title, articleUrl: url, publishedAt: "2026-10-13",
      datePrecision: "day" as const, sourceId: "statcan_prices",
      category: "macro" as const, credit: source.credit,
    };
    expect(conservativeDayReleaseMs("2026-10-13")).toBe(
      Date.parse("2026-10-14T12:15:00Z"));
    expect(deriveStatelessSignals([reviewed],Date.parse("2026-10-14T12:14:59Z")))
      .toEqual([]);
    const signals = deriveStatelessSignals([reviewed],now);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      category: "macro", date_precision: "day", published_at: "2026-10-13",
      severity: null, same_event_corrob_verified: false,
      status: "official_release_observed_unscored",
    });
    expect(JSON.stringify(signals)).not.toContain(url);
    expect(JSON.stringify(signals)).not.toContain(title);
  });
});
