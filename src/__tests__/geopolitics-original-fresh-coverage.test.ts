import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  acceptedOriginalArticleLink, deriveStatelessSignals, parseFirstPartyFeed,
  selectOfficialTopic, type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const now = Date.parse("2026-10-13T19:00:00.000Z");
const canonical = "https://news.un.org/en/story/2026/10/1199001";
const feedLink = "https://news.un.org/feed/view/en/story/2026/10/1199001";
const makeUn = (id: string): StatelessSourceSpec => ({
  id, category: "geopolitics", media: "rss",
  url: "https://news.un.org/feed/subscribe/en/news/region/africa/feed/rss.xml",
  allowedHosts: ["news.un.org"], credit: null,
});
const item = (title: string, pubdate = "Tue, 13 Oct 2026 16:00:00 GMT",
              link=feedLink, guid=canonical) =>
  `<item><title>${title}</title><link>${link}</link><guid isPermaLink="true">${guid}</guid><pubDate>${pubdate}</pubDate></item>`;
const xml = (parts: string) => `<rss version="2.0"><channel>${parts}</channel></rss>`;

describe("geopolitics 24-hour original-source recovery", () => {
  it("adds separate official UK sanctions and UN subject/region feeds without modifying macro/mineral lanes", () => {
    const server = readFileSync("src/lib/stateless-public-intelligence.server.ts", "utf8");
    for (const source of [
      "uk_ofsi_sanctions", "uk_otsi_trade_sanctions", "un_news_security", "un_news_africa",
    ]) expect(server).toContain(`id: "${source}", category: "geopolitics"`);
    expect(server).toContain("office-of-financial-sanctions-implementation.atom");
    expect(server).toContain("office-of-trade-sanctions-implementation.atom");
    expect(server).toContain("news/topic/peace-and-security/feed/rss.xml");
    expect(server).toContain("news/region/africa/feed/rss.xml");
  });

  it("admits literal armed attacks and displacement wording but not unrelated headlines", () => {
    for (const title of [
      "Deadly Myanmar airstrikes prompt UN security warning",
      "Refugees displaced after hostilities in Sudan",
      "Gaza and West Bank humanitarian update",
      "Eritrea warns of escalation near Ethiopia",
      "Security Council renews sanctions on armed militias",
    ]) expect(selectOfficialTopic(title,"geopolitics")).not.toBeNull();
    for (const title of ["Hospital launches new dentistry programme",
      "Sporting team wins regional awards", "Parliamentary stationery procurement"])
      expect(selectOfficialTopic(title,"geopolitics")).toBeNull();
  });

  it("requires correct same-article first-party UN GUID, not a redirect or spoof", () => {
    const source = makeUn("un_news_africa");
    expect(acceptedOriginalArticleLink(canonical, source)).toBe(canonical);
    const parsed = parseFirstPartyFeed(xml(item("UN reports refugees displaced in Sudan")),source,now);
    expect(parsed.dated).toHaveLength(1);
    expect(parsed.dated[0].articleUrl).toBe(canonical);
    expect(parseFirstPartyFeed(xml(item("UN reports refugees displaced in Sudan",
      "Tue, 13 Oct 2026 16:00:00 GMT", feedLink,
      "https://news.un.org/en/story/2026/10/1199002")),source,now).dated).toHaveLength(0);
  });

  it("dedupes one UN original appearing in multiple UN feeds, not independent corroboration", () => {
    const rows = ["un_news","un_news_africa","un_news_security"].flatMap(id =>
      parseFirstPartyFeed(xml(item("UN reports refugees displaced in Sudan")),makeUn(id),now).dated
    );
    expect(rows).toHaveLength(3);
    const derived = deriveStatelessSignals(rows,now);
    expect(derived).toHaveLength(1);
    expect(derived[0]).toMatchObject({
      status: "official_release_observed_unscored",
      severity: null,
      same_event_corrob_verified: false,
    });
    expect(JSON.stringify(derived)).not.toContain(canonical);
  });

  it("rejects future or undated UN timestamps instead of using feed scan time", () => {
    const source = makeUn("un_news_security");
    for (const clock of ["Wed, 14 Oct 2026 19:10:00 GMT","", "2026-10-13"]) {
      expect(parseFirstPartyFeed(xml(item("Security Council sanctions update",clock)),source,now).dated)
        .toHaveLength(0);
    }
    const original = parseFirstPartyFeed(xml(item("Security Council sanctions update")),
      source,now).dated;
    expect(deriveStatelessSignals(original,Date.parse("2026-10-13T15:59:59.999Z")))
      .toHaveLength(0);
  });
});
