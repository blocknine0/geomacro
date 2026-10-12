import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseFirstPartyFeed, deriveStatelessSignals, originalPublicationMs,
  STATELESS_WEBSITE_DELAY_MS, conservativeDayReleaseMs, type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";
import { WEBSITE_RELEASE_DELAY_MS } from "@/lib/website-publication-delay";
import { euCommissionTopOriginalCandidates } from "@/lib/stateless-eu-original-index.server";

const NOW = Date.parse("2026-10-12T16:00:00.000Z");
const fed: StatelessSourceSpec = {
  id: "fed_press", category: "macro", media: "rss",
  url: "https://www.federalreserve.gov/feeds/press_all.xml",
  allowedHosts: ["www.federalreserve.gov"], credit: "Federal Reserve Board",
};
const gov: StatelessSourceSpec = {
  id: "uk_fcdo", category: "geopolitics", media: "atom",
  url: "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
  allowedHosts: ["www.gov.uk"], credit: "Contains public sector information licensed under the Open Government Licence v3.0.",
  govContentApi: true,
};
const mineral: StatelessSourceSpec = {
  id: "usgs_minerals", category: "rare_earth", media: "rss",
  url: "https://www.usgs.gov/news/minerals/feed",
  allowedHosts: ["www.usgs.gov"], credit: "U.S. Geological Survey",
};

describe("no-storage public Intelligence original-release reader", () => {
  it("enforces 15m public Intelligence delay independently of the frozen 60m Global Risk embargo", () => {
    expect(STATELESS_WEBSITE_DELAY_MS).toBe(900_000);
    expect(WEBSITE_RELEASE_DELAY_MS).toBe(3_600_000);
    expect(originalPublicationMs("2026-10-12T14:00:00.000Z", NOW))
      .toBe(Date.parse("2026-10-12T14:00:00Z"));
    expect(originalPublicationMs("2026-10-13T14:00:00Z", NOW)).toBeNull();
    expect(originalPublicationMs("2026-10-12", NOW)).toBeNull();
  });

  it("never treats Atom updated as an original publication and only recovers fixed first-party pages", () => {
    const xml = '<feed><entry><title>Official sanctions and foreign policy briefing</title>' +
      '<updated>2026-10-12T15:59:00Z</updated>' +
      '<link rel="alternate" href="https://www.gov.uk/government/news/official-sanctions-briefing"/></entry>' +
      '<entry><title>Official sanctions investigation</title>' +
      '<link href="https://attacker.example.com/government/news/other"/></entry></feed>';
    const parsed = parseFirstPartyFeed(xml, gov, NOW);
    expect(parsed.dated).toEqual([]);
    expect(parsed.undatedGov).toEqual([{
      title: "Official sanctions and foreign policy briefing",
      articleUrl: "https://www.gov.uk/government/news/official-sanctions-briefing",
    }]);
  });

  it("admits native-dated first-party observations but never republishes source titles, links, or scores", () => {
    const xml = '<rss><channel><item>' +
      '<title>Federal Reserve releases monetary policy statement</title>' +
      '<link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20261012a.htm</link>' +
      '<pubDate>Mon, 12 Oct 2026 14:00:00 GMT</pubDate>' +
      '</item></channel></rss>';
    const parsed = parseFirstPartyFeed(xml, fed, NOW);
    expect(parsed.dated).toHaveLength(1);
    const signals = deriveStatelessSignals(parsed.dated, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0].title).toMatch(/^Geomacro finds /);
    expect(signals[0]).toMatchObject({
      category: "macro", topic: "monetary policy", severity: null,
      same_event_corrob_verified: false, status: "official_release_observed_unscored",
      sources_credited: ["Federal Reserve Board"],
    });
    expect(JSON.stringify(signals)).not.toContain("Federal Reserve releases");
    expect(JSON.stringify(signals)).not.toContain("federalreserve.gov/");
    const early = parseFirstPartyFeed(xml.replace("14:00:00", "15:45:01"), fed, NOW);
    expect(deriveStatelessSignals(early.dated, NOW)).toHaveLength(0);
  });

  it("separates domains and deduplicates only exact original URLs, not distinct same-topic releases", () => {
    const xml = '<rss><channel><item>' +
      '<title>USGS analysis of lithium and critical mineral supply</title>' +
      '<link>https://www.usgs.gov/news/minerals/lithium-supply</link>' +
      '<pubDate>Mon, 12 Oct 2026 13:30:00 GMT</pubDate></item></channel></rss>';
    const parsed = parseFirstPartyFeed(xml, mineral, NOW);
    const result = deriveStatelessSignals([...parsed.dated, ...parsed.dated], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].observed_release_count).toBe(1);
    expect(result[0].category).toBe("rare_earth");
    expect(result[0].sources_credited).toEqual(["U.S. Geological Survey"]);
    const second = { ...parsed.dated[0], articleUrl: "https://www.usgs.gov/news/minerals/lithium-supply-update" };
    const separate = deriveStatelessSignals([...parsed.dated, second], NOW);
    expect(separate).toHaveLength(2);
    expect(new Set(separate.map(row => row.id)).size).toBe(2);
    expect(separate.every(row => row.title.startsWith("Geomacro finds "))).toBe(true);
    expect(deriveStatelessSignals([], NOW)).toEqual([]);
  });

  it("safely promotes an original EU publication day without inventing source hour", () => {
    const html = '<div>Press release 9 October 2026 ' +
      '<a href="https://ec.europa.eu/commission/presscorner/detail/en/ip_26_2113">' +
      'Commission selects new projects to bolster critical raw materials supply</a></div>';
    const now = Date.parse("2026-10-12T16:00:00Z");
    const verified = euCommissionTopOriginalCandidates(html, now);
    expect(verified.candidates).toHaveLength(1);
    expect(verified.candidates[0].publishedAt).toBe("2026-10-09");
    expect(verified.candidates[0].datePrecision).toBe("day");
    expect(conservativeDayReleaseMs("2026-10-09")).toBe(Date.parse("2026-10-10T12:15:00Z"));
    expect(conservativeDayReleaseMs("2026-02-30")).toBeNull();
    expect(deriveStatelessSignals(verified.candidates, Date.parse("2026-10-10T12:14:59Z"))).toEqual([]);
    const finds = deriveStatelessSignals(verified.candidates, now);
    expect(finds).toHaveLength(1);
    expect(finds[0].date_precision).toBe("day");
    expect(finds[0].published_at).toBe("2026-10-09");
    expect(finds[0].severity).toBeNull();
    expect(finds[0].title).toMatch(/^Geomacro finds /);
    expect(JSON.stringify(finds)).not.toContain("Commission selects new projects");
    // One decoding pass only: a double-encoded "&amp;quot;" must stay
    // inert, not become a quote through successive replacement rounds.
    const encoded = html.replace("Commission selects new projects", "Commission &amp;quot;selects new projects");
    const decodedOnce = euCommissionTopOriginalCandidates(encoded, now);
    expect(decodedOnce.candidates).toHaveLength(1);
    expect(decodedOnce.candidates[0].title).toContain("&quot;");
    expect(decodedOnce.candidates[0].title).not.toContain('"selects');
  });

  it("makes the website active route stateless, while leaving paid endpoints independent", () => {
    const page = readFileSync("src/routes/intelligence.tsx", "utf8");
    const active = page.slice(page.indexOf("export const Route"), page.indexOf("  head: () =>"));
    const source = readFileSync("src/lib/stateless-public-intelligence.server.ts", "utf8");
    const endpoint = readFileSync("src/lib/stateless-intelligence.functions.ts", "utf8");
    const desk = readFileSync("src/components/intelligence/stateless-live-desk.tsx", "utf8");
    expect(active).toContain('getStatelessIntelligence({ data: { category: "geopolitics" } })');
    expect(active).not.toContain("getPublicIntelligenceSeo(");
    expect(page).toContain("component: StatelessWebsiteIntelligencePage");
    expect(desk).toContain("getStatelessIntelligence({ data: { category } })");
    expect(desk).toContain("setInterval(");
    expect(desk).toContain("Latest Geomacro finds");
    // The main desk must show all three categories automatically, not
    // require the visitor to click each category before a source check.
    expect(desk).toContain('useState<View>("all")');
    expect(desk).toContain("All latest</button>");
    expect(desk).toContain('["macro", "rare_earth"]');
    expect(desk).toContain('["geopolitics", "macro", "rare_earth"]');
    expect(desk).toContain('document.visibilityState === "visible"');
    expect(desk).toContain('window.addEventListener("focus", onReturn)');
    expect(desk).toContain('manualRefresh.current()');
    expect(desk).toContain('setFeeds(previous => ({ ...previous, ...nextFeeds }))');
    expect(desk).toContain('Previously received in-tab findings may be out of date');
    expect(desk).toContain('New in the last 24 hours');
    expect(desk).toContain('Earlier original releases · Last 30 days');

    expect(desk).toContain("15-minute delayed");
    expect(desk).not.toContain("RiskBadge");
    expect(desk).not.toContain("RiskTrend");
    expect(desk).not.toContain("Score evidence");
    expect(desk).not.toContain("observed_release_count");
    expect(endpoint).toContain('createServerFn({ method: "GET" })');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('redirect: "error"');
    for (const token of ["writeFileSync(", ".put(", ".insert(", ".upsert(", ".from(", "localStorage", "sessionStorage", "B2_KEY_ID", "SUPABASE_DB_URL"]) {
      expect(source).not.toContain(token);
      expect(desk).not.toContain(token);
    }
    expect(source).toContain("first_published_at");
    expect(source).not.toContain("public_updated_at");
    expect(source).toContain("persistent_storage: false");
    expect(source).toContain("now - STATELESS_WEBSITE_DELAY_MS");
    expect(desk).toContain("No database, B2, D1");
  });
});
