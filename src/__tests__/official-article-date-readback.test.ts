import { describe, expect, it, vi } from "vitest";
import {
  verifiedPublisherPageDate,
  fetchVerifiedPublisherPageDate,
  ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN,
} from "../../scripts/lib/official-original-article-date.mjs";
import { fetchOriginalAlternate } from "../../scripts/lib/official-native-alternates.mjs";

const now = new Date("2026-10-09T13:30:00Z");
const official = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals-supply-chain.html";
const statcan = "https://www150.statcan.gc.ca/n1/daily-quotidien/261009/dq261009a-eng.htm";
const subject = "Natural Resources Canada invests in lithium critical minerals mining resilience";
const xml = (urls: string[]) => [
  '<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-10-09T13:29:00Z</updated>',
  ...urls.map((url) => '<entry><title>' + subject + '</title><link rel="alternate" href="' +
    url + '"/><updated>2026-10-09T13:29:00Z</updated></entry>'),
  '</feed>',
].join("");
const page = (date: string) => [
  '<html><head><meta property="article:published_time" content="' + date + '">',
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"NewsArticle","datePublished":"' + date + '"}</script>',
  '<meta property="article:modified_time" content="2026-10-09T13:29:00Z">',
  '</head><body>private original publisher page</body></html>',
].join("");

describe("bounded original-publisher article precise-date fallback", () => {
  it("requires explicit precise publication time, not merely date or update time", () => {
    expect(verifiedPublisherPageDate(page("2026-10-09T12:45:00Z"), now))
      .toBe("2026-10-09T12:45:00.000Z");
    expect(verifiedPublisherPageDate('<meta property="article:published_time" content="2026-10-09T12:45:00+00:00">', now))
      .toBe("2026-10-09T12:45:00.000Z");
    expect(verifiedPublisherPageDate('<meta property="article:modified_time" content="2026-10-09T12:00:00Z">', now)).toBeNull();
    expect(verifiedPublisherPageDate('<script type="application/ld+json">{"@type":"NewsArticle","dateModified":"2026-10-09T12:00:00Z"}</script>', now)).toBeNull();
    expect(verifiedPublisherPageDate(page("2026-10-09"), now)).toBeNull();
    expect(verifiedPublisherPageDate(page("2026-10-09T13:32:00Z"), now)).toBeNull();
    expect(verifiedPublisherPageDate(page("2026-10-07T12:45:00Z"), now)).toBeNull();
    expect(verifiedPublisherPageDate(
      '<meta property="article:published_time" content="2026-10-09T12:45:00Z">' +
      '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-09T13:00:00Z"}</script>', now))
      .toBeNull();
  });

  it("rejects unrelated URLs and never follows cross-origin redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(page("2026-10-09T12:45:00Z"), {
      headers: { "content-type": "text/html" },
    }));
    for (const url of [
      "http://www.canada.ca/en/natural-resources-canada/news/abc",
      "https://www.canada.ca.evil.example/en/natural-resources-canada/news/abc",
      "https://www.canada.ca/en/other-agency/news/abc",
      statcan,
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals.html?redirect=https://evil.test",
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/%2F%2Fevil.html",
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/fake.html#fragment",
      "https://www.canada.ca/en/natural-resources-canada/news/2026/10/../../../evil.html",
      "https://natural-resources.canada.ca/other/news/2026/example.html",
    ]) {
      expect(await fetchVerifiedPublisherPageDate(url, "rare_earth", { now, fetchImpl })).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await fetchVerifiedPublisherPageDate(statcan, "macro", { now, fetchImpl }))
      .toBe("2026-10-09T12:45:00.000Z");
    expect(fetchImpl.mock.calls[0][0]).toBe(statcan);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).redirect).toBe("error");
  });

  it("uses a maximum two original publisher pages; outputs only private derived evidence", async () => {
    const third = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/third-project.html";
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => new Response(xml([official, third, official + "?p=4"]), {
        headers: { "content-type": "application/atom+xml" },
      }))
      .mockImplementation(async () => new Response(page("2026-10-09T12:45:00Z"), {
        headers: { "content-type": "text/html" },
      }));
    const d: Record<string, number> = {};
    const rows = await fetchOriginalAlternate("rare_earth", { now, fetchImpl, diagnostics: d });
    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1 + ORIGINAL_ARTICLE_MAX_PROBES_PER_DOMAIN);
    expect(d.alternate_native_date_items).toBe(0);
    expect(d.alternate_atom_updated_only_items).toBe(3);
    expect(d.alternate_article_page_probes).toBe(2);
    expect(d.alternate_article_page_admitted).toBe(2);
    expect(rows[0]).toMatchObject({
      discoveryProvider: "official_native_rss",
      nativeTimeEvidence: "publisher_original_article_datePublished",
      nativePublishedAtVerified: true,
      privateOnly: true, rightsVerified: false, commercialEligible: false,
      publishedAt: "2026-10-09T12:45:00.000Z",
    });
    expect(rows[0]).not.toHaveProperty("severity");
    expect(JSON.stringify(d)).not.toContain("www.canada.ca");
    expect(JSON.stringify(d)).not.toContain(subject);
  });

  it("never admits a government article with only modified/update date", async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => new Response(xml([official]), {
        headers: { "content-type": "application/atom+xml" },
      }))
      .mockImplementationOnce(async () => new Response(
        '<html><meta property="article:modified_time" content="2026-10-09T13:20:00Z"></html>', {
          headers: { "content-type": "text/html" },
        }));
    const d: Record<string, number> = {};
    expect(await fetchOriginalAlternate("rare_earth", { now, fetchImpl, diagnostics: d }))
      .toEqual([]);
    expect(d.alternate_article_page_probes).toBe(1);
    expect(d.alternate_article_page_admitted).toBe(0);
  });
});
