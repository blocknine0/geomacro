import { describe, expect, it, vi } from "vitest";
import { fetchOfficialNativeArticles, OFFICIAL_NATIVE_FEEDS } from "../../scripts/lib/official-native-rss.mjs";
import { ORIGINAL_PUBLISHER_ALTERNATES } from "../../scripts/lib/official-native-alternates.mjs";
import { selectPrivatePublisherDiverseCandidates } from "../../scripts/lib/private-publisher-diverse-candidates.mjs";

const now = new Date("2026-10-09T15:00:00Z");
const primary = (name: string, timestamp: string) =>
  '<rss version="2.0"><channel><item><title>Federal Reserve FOMC monetary policy interest rate decision ' +
    name + '</title><link>https://www.federalreserve.gov/newsevents/pressreleases/' + name +
    '.htm</link><pubDate>' + timestamp + '</pubDate></item></channel></rss>';
const alt = '<feed xmlns="http://www.w3.org/2005/Atom"><entry>' +
  '<title>Canada consumer prices inflation rises in September</title>' +
  '<link rel="alternate" href="https://www150.statcan.gc.ca/n1/daily-quotidien/261009/dq261009a-eng.htm"/>' +
  '<published>2026-10-09T13:30:00Z</published></entry></feed>';
const response = (body: string, type: string) =>
  new Response(body, { headers: { "content-type": type } });

describe("#1827 private original-publisher dual-family queue", () => {
  const primaryXml = '<rss version="2.0"><channel>' +
    primary("a", "Fri, 09 Oct 2026 14:30:00 GMT").replace(/^.*?<channel>/, "").replace(/<\/channel><\/rss>$/, "") +
    primary("b", "Fri, 09 Oct 2026 14:20:00 GMT").replace(/^.*?<channel>/, "").replace(/<\/channel><\/rss>$/, "") +
    '</channel></rss>';

  it("defaults to one transport if primary already has original events", async () => {
    const fetchImpl = vi.fn(async () => response(primaryXml, "application/rss+xml"));
    const rows = await fetchOfficialNativeArticles("macro", { now, fetchImpl });
    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explicit private dual family mode fetches the fixed second publisher and prioritizes both", async () => {
    const fetchImpl = vi.fn(async (uri: string) => {
      if (uri === OFFICIAL_NATIVE_FEEDS.macro.url) return response(primaryXml, "application/rss+xml");
      if (uri === ORIGINAL_PUBLISHER_ALTERNATES.macro.url) return response(alt, "application/atom+xml");
      throw Error("unexpected network target");
    });
    const diagnostics: Record<string, unknown> = {};
    const rows = await fetchOfficialNativeArticles("macro", {
      now, fetchImpl, diagnostics, includeSecondPublisher: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(3);
    expect(diagnostics).toMatchObject({
      primary_feed_ok: true, alternate_feed_attempted: true, alternate_feed_ok: true,
    });
    const selected = selectPrivatePublisherDiverseCandidates(rows, 2);
    expect(selected.map((row: { sourceDomain: string }) => row.sourceDomain))
      .toEqual(["www.federalreserve.gov", "www150.statcan.gc.ca"]);
    expect(selected.every((row: { privateOnly: boolean; rightsVerified: boolean; commercialEligible: boolean }) =>
      row.privateOnly && !row.rightsVerified && !row.commercialEligible)).toBe(true);
    expect(selected.every((row: { nativePublishedAtVerified: boolean }) =>
      row.nativePublishedAtVerified)).toBe(true);
  });

  it("retains primary-only genuine evidence when second publisher is unavailable", async () => {
    const fetchImpl = vi.fn(async (uri: string) =>
      uri === OFFICIAL_NATIVE_FEEDS.macro.url
        ? response(primaryXml, "application/rss+xml")
        : new Response("unavailable", { status: 503 }));
    const diagnostics: Record<string, unknown> = {};
    const rows = await fetchOfficialNativeArticles("macro", {
      now, fetchImpl, diagnostics, includeSecondPublisher: true,
    });
    expect(rows).toHaveLength(2);
    expect(diagnostics).toMatchObject({
      primary_feed_ok: true, alternate_feed_attempted: true, alternate_feed_ok: false,
    });
    expect(rows.every((row: { commercialEligible: boolean }) => !row.commercialEligible)).toBe(true);
  });

  it("does not infer a second family from repeated same-host articles or unknown provenance", () => {
    const row = { sourceDomain: "www.news.un.org", discoveryProvider: "official_native_rss",
      nativePublishedAtVerified: true, privateOnly: true, rightsVerified: false,
      commercialEligible: false };
    const same = [
      { ...row, publishedAt: "2026-10-09T14:50:00Z", id: 1 },
      { ...row, sourceDomain: "news.un.org", publishedAt: "2026-10-09T14:40:00Z", id: 2 },
      { ...row, sourceDomain: "www.federalreserve.gov", publishedAt: "2026-10-09T14:30:00Z", id: 3 },
    ];
    expect(selectPrivatePublisherDiverseCandidates(same, 2).map((item: { id: number }) => item.id))
      .toEqual([1, 3]);
    expect(() => selectPrivatePublisherDiverseCandidates(same, -1)).toThrow();
  });
});
