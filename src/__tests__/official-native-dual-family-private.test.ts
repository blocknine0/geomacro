import { describe, expect, it, vi } from "vitest";
import { fetchOfficialNativeArticles, OFFICIAL_NATIVE_FEEDS } from "../../scripts/lib/official-native-rss.mjs";
import { ORIGINAL_PUBLISHER_ALTERNATES } from "../../scripts/lib/official-native-alternates.mjs";
import { selectPrivatePublisherDiverseCandidates, allocatePrivateScoringSlots } from "../../scripts/lib/private-publisher-diverse-candidates.mjs";

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

  it("reserves the one-slot private classifier for a real source-native original, never GDELT index",()=>{
    const original={
      discoveryProvider:"official_native_rss",
      nativePublishedAtVerified:true,privateOnly:true,rightsVerified:false,
      commercialEligible:false,
      sourceDomain:"news.un.org",
      url:"https://news.un.org/en/story/2026/10/1234",
      publishedAt:"2026-10-09T14:00:00Z",
    };
    const gdelt={discoveryProvider:"gdelt",url:"https://example.org/index",
      publishedAt:"2026-10-09T14:55:00Z"};
    const picked=allocatePrivateScoringSlots({
      guardianCandidates:[],otherCandidates:[original],
      gdeltCandidates:[gdelt],limit:1,
    });
    expect(picked.primary).toEqual([original]);
    expect(picked.gdelt).toEqual([]);
    expect(picked.native_original_singleton_prioritized).toBe(true);
    expect(picked.primary[0].commercialEligible).toBe(false);
    // A GDELT index article can still be classified if there are no
    // qualified original publisher source-native candidates.
    const fallback=allocatePrivateScoringSlots({
      otherCandidates:[],gdeltCandidates:[gdelt],limit:1,
    });
    expect(fallback.primary).toEqual([]);
    expect(fallback.gdelt).toEqual([gdelt]);
  });

  it("does not let a forged, stale-unknown or rights-promoted source acquire singleton priority",()=>{
    const base={
      discoveryProvider:"official_native_rss",privateOnly:true,
      rightsVerified:false,commercialEligible:false,
      nativePublishedAtVerified:true,sourceDomain:"www.usgs.gov",
      url:"https://www.usgs.gov/news/critical-minerals",
      publishedAt:"2026-10-09T14:00:00Z",
    };
    const gdelt={discoveryProvider:"gdelt",publishedAt:"2026-10-09T14:55:00Z"};
    for(const bad of [
      {...base,url:"https://www.usgs.gov.evil.test/news"},
      {...base,url:"http://www.usgs.gov/news/critical-minerals"},
      {...base,nativePublishedAtVerified:false},
      {...base,privateOnly:false},
      {...base,rightsVerified:true},
      {...base,commercialEligible:true},
      {...base,publishedAt:"not a native date"},
    ]){
      const decision=allocatePrivateScoringSlots({
        otherCandidates:[bad],gdeltCandidates:[gdelt],limit:1,
      });
      expect(decision.native_original_singleton_prioritized).toBe(false);
      expect(decision.gdelt).toEqual([gdelt]);
    }
  });

  it("preserves existing multi-slot allocation and exact cap without rights promotion",()=>{
    const original={
      discoveryProvider:"official_native_rss",nativePublishedAtVerified:true,
      privateOnly:true,rightsVerified:false,commercialEligible:false,
      sourceDomain:"www.federalreserve.gov",
      url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261009a.htm",
      publishedAt:"2026-10-09T14:00:00Z",
    };
    const gdelt={discoveryProvider:"gdelt",publishedAt:"2026-10-09T14:50:00Z"};
    const choice=allocatePrivateScoringSlots({
      otherCandidates:[original],gdeltCandidates:[gdelt],limit:2,
    });
    expect(choice.primary).toEqual([original]);
    expect(choice.gdelt).toEqual([gdelt]);
    expect(choice.native_original_singleton_prioritized).toBe(false);
    expect(choice.primary.length+choice.gdelt.length).toBeLessThanOrEqual(2);
    for(const badLimit of [0,-1,101,1.1,NaN]){
      expect(()=>allocatePrivateScoringSlots({limit:badLimit})).toThrow();
    }
  });
});
