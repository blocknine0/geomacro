import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseOfficialNativeRss, fetchOfficialNativeArticles, OFFICIAL_NATIVE_FEEDS }
  from "../../scripts/lib/official-native-rss.mjs";
import { probeOfficialThreeDomains }
  from "../../scripts/ops/probe-official-native-rss-three-domains.mjs";

const now = new Date("2026-10-09T12:00:00.000Z");
const fixtures = [
  ["geopolitics", "news.un.org", "Security Council demands ceasefire after renewed border conflict"],
  ["macro", "www.federalreserve.gov", "Federal Reserve FOMC announces monetary policy interest rate decision"],
  ["rare_earth", "www.usgs.gov", "USGS finds newly surveyed lithium and critical minerals deposits"],
] as const;

function rss(title: string, link: string, pubDate = "Fri, 09 Oct 2026 11:30:00 GMT") {
  return `<?xml version="1.0" ?><rss version="2.0"><channel><title>Official</title>
    <lastBuildDate>Fri, 09 Oct 2026 11:59:00 GMT</lastBuildDate>
    <item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${pubDate}</pubDate></item>
  </channel></rss>`;
}

describe("three official publishers' original-event RSS discovery", () => {
  for (const [category, host, title] of fixtures) {
    it(`accepts ONLY independently source-native, private ${category} articles`, async () => {
      const xml = rss(title, `https://${host}/news/verified-original-report`);
      const rows = parseOfficialNativeRss(xml, category, now);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        publishedAt: "2026-10-09T11:30:00.000Z",
        discoveryProvider: "official_native_rss",
        nativePublishedAtVerified: true,
        nativeTimeEvidence: "publisher_rss_item_pubDate",
        privateOnly: true, rightsVerified: false, commercialEligible: false,
      });
      expect(rows[0]).not.toHaveProperty("severity");
      const fetchImpl = vi.fn(async () => new Response(xml, {
        headers: { "content-type": "application/rss+xml; charset=utf-8" },
      }));
      expect(await fetchOfficialNativeArticles(category, { now, fetchImpl })).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledWith(OFFICIAL_NATIVE_FEEDS[category].url,
        expect.objectContaining({ redirect: "error" }));
    });
  }

  it("does not turn RSS feed refresh, discovery timestamps, or missing pubDate into news", () => {
    const xml = rss(fixtures[1][2], "https://www.federalreserve.gov/news/report", "");
    const rows = parseOfficialNativeRss(xml, "macro", now);
    expect(rows).toEqual([]);
    expect(parseOfficialNativeRss(rss(fixtures[1][2],
      "https://www.federalreserve.gov/news/report", "Wed, 07 Oct 2026 11:30:00 GMT"),
      "macro", now)).toEqual([]);
  });

  it("rejects unrelated hosts, HTTP, redirected provenance, and misleading future pubDate", () => {
    for (const uri of [
      "http://www.usgs.gov/news/report",
      "https://www.usgs.gov.evil.example/news/report",
      "https://evil.example/news/report",
    ]) {
      expect(parseOfficialNativeRss(rss(fixtures[2][2], uri), "rare_earth", now)).toEqual([]);
    }
    expect(parseOfficialNativeRss(rss(fixtures[2][2],
      "https://www.usgs.gov/news/report", "Sat, 10 Oct 2026 11:30:00 GMT"),
      "rare_earth", now)).toEqual([]);
  });

  it("rejects generic unrelated headlines, huge feeds, DTD and malformed categories", () => {
    expect(parseOfficialNativeRss(rss("Survey of nearby trees and flowers",
      "https://www.usgs.gov/news/report"), "rare_earth", now)).toEqual([]);
    expect(() => parseOfficialNativeRss("<!DOCTYPE foo><rss/>", "macro", now))
      .toThrow("OFFICIAL_NATIVE_RSS_DOCUMENT_INVALID");
    expect(() => parseOfficialNativeRss("x".repeat(385 * 1024), "macro", now))
      .toThrow("OFFICIAL_NATIVE_RSS_DOCUMENT_INVALID");
    expect(() => parseOfficialNativeRss(rss(fixtures[1][2],
      "https://www.federalreserve.gov/news/report"), "unknown", now))
      .toThrow("OFFICIAL_NATIVE_RSS_DOCUMENT_INVALID");
  });

  it("never leaks article titles, URLs or raw upstream in the aggregate D1 scheduler receipt", async () => {
    const fetchArticles = vi.fn(async (category: string) => {
      const [c, host, title] = fixtures.find(([c]) => c === category)!;
      return parseOfficialNativeRss(rss(title, `https://${host}/news/private-evidence`), c, now);
    });
    const proof = await probeOfficialThreeDomains({ fetchArticles, now });
    expect(proof.current_private_original_event_domains).toBe(3);
    expect(proof.all_three_feeds_reached).toBe(true);
    expect(proof.proves_public_scored_intelligence).toBe(false);
    expect(proof.supabase_writes).toBe(0);
    expect(proof.b2_requests).toBe(0);
    expect(JSON.stringify(proof)).not.toContain("private-evidence");
    expect(JSON.stringify(proof)).not.toContain(fixtures[0][2]);
  });

  it("wires hourly restricted-mode discovery, but not public/paid source certification", () => {
    const orchestration = readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
    const workflow = readFileSync(".github/workflows/intelligence-orchestrator.yml", "utf8");
    const privateIngest = readFileSync("scripts/ingest-news.js", "utf8");
    expect(orchestration).toContain('key: "official_native_rss"');
    expect(orchestration).toContain('cadenceSeconds: 3600');
    expect(orchestration).toContain('restrictedDirectPostgresSafe: true');
    expect(orchestration).toContain("scripts/ops/probe-official-native-rss-three-domains.mjs");
    expect(workflow).toContain("artifacts/official-native-rss/**");
    expect(privateIngest).toContain("await fetchOfficialNativeArticles(category.name");
    expect(privateIngest).toContain("GDELT indexed-seen timestamps are not original publisher dates");
    expect(privateIngest).toContain("makePrivateStageRecord({");
    expect(privateIngest).toContain("if (PRIVATE_B2_STAGE)");
  });
});
