import { describe, expect, it, vi } from "vitest";
import { OFFICIAL_NATIVE_FEEDS, fetchOfficialNativeArticles } from "../../scripts/lib/official-native-rss.mjs";
import { ORIGINAL_PUBLISHER_ALTERNATES, parseOfficialAlternate, fetchOriginalAlternate }
  from "../../scripts/lib/official-native-alternates.mjs";

const now = new Date("2026-10-09T13:30:00.000Z");
const atom = (title: string, url: string, date: string) =>
  `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
     <updated>2026-10-09T13:29:00Z</updated>
     <entry><title>${title}</title><link rel="alternate" href="${url}"/>
     <published>${date}</published></entry></feed>`;

const title = "Canada announces funding for critical minerals lithium refining and rare earth processing";
const uri = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals.html";

describe("original publisher alternate feed with source-native Atom dates", () => {
  it("admits Canadian mineral-news ORIGINAL Atom published time only as private", () => {
    const stats: Record<string, number> = {};
    const result = parseOfficialAlternate(atom(title, uri, "2026-10-09T12:15:00Z"),
      "rare_earth", now, stats);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      url: uri, sourceDomain: "www.canada.ca",
      publishedAt: "2026-10-09T12:15:00.000Z",
      nativeTimeEvidence: "publisher_atom_entry_published",
      rightsVerified: false, commercialEligible: false,
      privateOnly: true, nativePublishedAtVerified: true,
    });
    expect(result[0]).not.toHaveProperty("severity");
    expect(stats.alternate_admitted_private_count).toBe(1);
    expect(stats.alternate_native_current_items).toBe(1);
    expect(stats.alternate_atom_published_elements).toBe(1);
    expect(stats.alternate_atom_updated_elements).toBe(0);
    expect(stats.alternate_original_date_topic_and_host_items).toBe(1);
  });
  it("rejects updated-only entries, old, future, cross-host, and unrelated news", () => {
    const emptyDate = atom(title, uri, "").replace("<published></published>", "");
    const diagnostics: Record<string, number> = {};
    expect(parseOfficialAlternate(emptyDate, "rare_earth", now, diagnostics)).toEqual([]);
    expect(diagnostics.alternate_atom_published_elements).toBe(0);
    expect(diagnostics.alternate_atom_updated_elements).toBe(0);
    expect(diagnostics.alternate_native_current_items).toBe(0);
    expect(diagnostics.alternate_admitted_private_count).toBe(0);
    expect(parseOfficialAlternate(atom(title, uri, "2026-10-05T12:15:00Z"),
      "rare_earth", now)).toEqual([]);
    expect(parseOfficialAlternate(atom(title, uri, "2026-10-10T12:15:00Z"),
      "rare_earth", now)).toEqual([]);
    expect(parseOfficialAlternate(atom(title, "https://canada.ca.evil.test/uri",
      "2026-10-09T12:15:00Z"), "rare_earth", now)).toEqual([]);
    expect(parseOfficialAlternate(atom("Local school vegetable garden wins prize", uri,
      "2026-10-09T12:15:00Z"), "rare_earth", now)).toEqual([]);
  });
  it("diagnoses updated-only Atom without turning update time into publisher publication", () => {
    const uri = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals.html";
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>Critical minerals lithium processing and mining strategy announced</title>
      <link href="${uri}" rel="alternate"/>
      <updated>2026-10-09T13:29:00Z</updated>
      <dc:date>2026-10-09T12:15:00Z</dc:date>
      <publishedDate>2026-10-09T12:15:00Z</publishedDate>
      </entry></feed>`;
    const stats: Record<string, number> = {};
    const rows = parseOfficialAlternate(xml, "rare_earth", now, stats);
    expect(rows).toEqual([]);
    expect(stats).toMatchObject({
      alternate_feed_items_seen: 1,
      alternate_atom_published_elements: 0,
      alternate_atom_updated_elements: 1,
      alternate_atom_dc_date_elements: 1,
      alternate_atom_publishedDate_elements: 1,
      alternate_original_date_topic_and_host_items: 0,
      alternate_admitted_private_count: 0,
    });
    expect(JSON.stringify(stats)).not.toContain("lithium");
    expect(JSON.stringify(stats)).not.toContain("canada.ca");
  });

  it("probes and admits only fixed government source URL without redirects", async () => {
    const xml = atom(title, uri, "2026-10-09T12:15:00Z");
    const fetchImpl = vi.fn(async () => Response.json({}, { status: 404 }));
    fetchImpl.mockImplementationOnce(async () => new Response("<rss><channel></channel></rss>",
      { headers: { "content-type": "application/rss+xml" } }));
    fetchImpl.mockImplementationOnce(async () => new Response(xml,
      { headers: { "content-type": "application/atom+xml" } }));
    const diagnostics: Record<string, unknown> = {};
    const result = await fetchOfficialNativeArticles("rare_earth", {
      now, fetchImpl, diagnostics,
    });
    expect(result).toHaveLength(1);
    expect(diagnostics.primary_feed_ok).toBe(true);
    expect(diagnostics.alternate_feed_ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(OFFICIAL_NATIVE_FEEDS.rare_earth.url);
    expect(fetchImpl.mock.calls[1][0]).toBe(ORIGINAL_PUBLISHER_ALTERNATES.rare_earth.url);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).redirect).toBe("error");
  });
  it("UN global and StatCan original entries have correct independent fixed host", () => {
    const unXml = `<rss version="2.0"><channel><item><title>
       UN Security Council responds to new border conflict with calls for ceasefire
       </title><link>https://news.un.org/en/story/2026/10/1111</link>
       <pubDate>Fri, 09 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseOfficialAlternate(unXml, "geopolitics", now)).toHaveLength(1);
    const ca = atom("Consumer price inflation accelerates in September in Canada",
      "https://www150.statcan.gc.ca/n1/daily-quotidien/261009/abc-eng.htm",
      "2026-10-09T12:15:00Z");
    expect(parseOfficialAlternate(ca, "macro", now)).toHaveLength(1);
  });
  it("not even successful alternate discovery grants public or paid source rights", async () => {
    const doc = atom(title, uri, "2026-10-09T12:15:00Z");
    const rows = await fetchOriginalAlternate("rare_earth", {
      now, fetchImpl: async () => new Response(doc, {
        headers: { "content-type": "application/atom+xml" },
      }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].commercialEligible).toBe(false);
    expect(rows[0].rightsVerified).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("payment_signature");
  });
});
