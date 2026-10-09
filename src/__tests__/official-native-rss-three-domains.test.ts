import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseOfficialNativeRss, fetchOfficialNativeArticles, OFFICIAL_NATIVE_FEEDS }
  from "../../scripts/lib/official-native-rss.mjs";
import { probeOfficialThreeDomains, classifyNativeFeedGap }
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
  it("does not claim there is no global news when three sampled feeds have no qualified item", async () => {
    const fetchArticles = vi.fn(async (_category: string, { diagnostics }: {
      diagnostics: Record<string, number>;
    }) => {
      Object.assign(diagnostics, {
        item_count: 15,
        item_native_pubdate_count: 15,
        item_native_date_in_window_count: 0,
        domain_topic_title_count: 7,
        alternate_feed_items_seen: 60,
        alternate_original_pubdate_items: 0,
        alternate_native_current_items: 0,
        alternate_atom_updated_only_items: 60,
        alternate_topic_match_items: 51,
      });
      return [];
    });
    const audit = await probeOfficialThreeDomains({ fetchArticles, now });
    expect(audit.current_private_original_event_domains).toBe(0);
    expect(audit.implies_no_global_news).toBe(false);
    expect(audit.measured_source_scope).toBe("THREE_DOMAINS_UP_TO_THREE_FIXED_OFFICIAL_PUBLISHERS_EACH");
    for (const row of audit.categories) {
      expect(row.current_native_source_state).toBe("NO_ELIGIBLE_PRIVATE_CANDIDATE");
      expect(row.bounded_feed_gap_reason).toBe("PUBLISHER_ARTICLE_DATE_UNVERIFIED");
      expect(row.global_news_absence_proven).toBe(false);
    }
    expect(JSON.stringify(audit)).not.toContain("https://");
    expect(audit.proves_public_scored_intelligence).toBe(false);
  });

  it("hourly probe requests all three fixed publisher families only through conditional cold fallback", async () => {
    const requested: Array<{category:string; includeSecondPublisher?:boolean; includeThirdPublisher?:boolean}> = [];
    const fetchArticles = vi.fn(async (category: string, options: {
      diagnostics: Record<string, number | boolean>;
      includeSecondPublisher?: boolean;
      includeThirdPublisher?: boolean;
    }) => {
      requested.push({category,includeSecondPublisher: options.includeSecondPublisher,
        includeThirdPublisher: options.includeThirdPublisher});
      Object.assign(options.diagnostics, {
        item_count: 4,
        item_native_pubdate_count: 3,
        item_native_date_in_window_count: 0,
        alternate_feed_items_seen: 2,
        alternate_native_date_items: 2,
        alternate_native_current_items: 0,
        alternate_feed_attempted: true,
        alternate_feed_ok: true,
        third_feed_attempted: true,
        third_feed_ok: true,
        third_items_seen: 3,
        third_native_pubdate_seen: 3,
        third_original_current_count: 1,
        third_exact_host_count: 3,
        third_topic_match_count: 0,
        third_private_eligible_count: 0,
      });
      return [];
    });
    const audit = await probeOfficialThreeDomains({fetchArticles,now});
    expect(requested).toEqual([
      {category:"geopolitics",includeSecondPublisher:true,includeThirdPublisher:true},
      {category:"macro",includeSecondPublisher:true,includeThirdPublisher:true},
      {category:"rare_earth",includeSecondPublisher:true,includeThirdPublisher:true},
    ]);
    expect(audit.measured_source_scope).toBe("THREE_DOMAINS_UP_TO_THREE_FIXED_OFFICIAL_PUBLISHERS_EACH");
    expect(audit.current_private_original_event_domains).toBe(0);
    expect(audit.implies_no_global_news).toBe(false);
    for (const row of audit.categories) {
      expect(row.bounded_feed_gap_reason).toBe("RECENT_NATIVE_EVENT_REJECTED_BY_TOPIC_OR_PROVENANCE");
      expect(row.third_feed_attempted).toBe(true);
      expect(row.third_feed_ok).toBe(true);
      expect(row.third_items_seen).toBe(3);
      expect(row.third_native_pubdate_items).toBe(3);
      expect(row.third_private_candidates).toBe(0);
      expect(row.commerce_eligible).toBe(false);
      expect(row.public_scored_verified).toBe(false);
    }
    expect(audit.b2_requests).toBe(0);
    expect(audit.supabase_writes).toBe(0);
    expect(audit.funds_touched).toBe(false);
    expect(JSON.stringify(audit)).not.toContain("https://");
  });

  it("counts actual alternate-native published tags, not the stale diagnostic alias", () => {
    const classify = (extra: Record<string,number>) =>
      classifyNativeFeedGap({articlesCount:0,diagnostics:{
        item_count:1,item_native_pubdate_count:0,
        alternate_feed_items_seen:2,
        alternate_native_date_items:2,
        alternate_native_current_items:0,
        alternate_topic_match_items:1,
        third_items_seen:0,
        ...extra,
      }});
    expect(classify({})).toBe("SAMPLED_FEED_HAS_ONLY_STALE_OR_INELIGIBLE_EVENTS");
    expect(classify({alternate_atom_updated_only_items:2})).toBe("SAMPLED_FEED_HAS_ONLY_STALE_OR_INELIGIBLE_EVENTS");
    expect(classify({alternate_topic_match_items:0})).toBe("SAMPLED_FEED_NO_RELEVANT_TOPIC_MATCH");
    expect(classifyNativeFeedGap({articlesCount:0,diagnostics:{
      item_count:0,alternate_feed_items_seen:0,
      third_items_seen:2,third_native_pubdate_seen:2,
      third_original_current_count:0,third_topic_match_count:1,
    }})).toBe("SAMPLED_FEED_HAS_ONLY_STALE_OR_INELIGIBLE_EVENTS");
  });

  it("distinguishes off-topic recent native events, empty feeds, and old publications", () => {
    const reason = (diagnostics: Record<string, number>) =>
      classifyNativeFeedGap({ articlesCount: 0, diagnostics });
    expect(reason({ item_count: 30, item_native_pubdate_count: 30,
      item_native_date_in_window_count: 0, alternate_native_current_items: 1,
      domain_topic_title_count: 4 })).toBe("RECENT_NATIVE_EVENT_REJECTED_BY_TOPIC_OR_PROVENANCE");
    expect(reason({ item_count: 0, alternate_feed_items_seen: 0 }))
      .toBe("SAMPLED_FEED_NO_ITEMS");
    expect(reason({ item_count: 30, item_native_pubdate_count: 30,
      item_native_date_in_window_count: 0, domain_topic_title_count: 4 }))
      .toBe("SAMPLED_FEED_HAS_ONLY_STALE_OR_INELIGIBLE_EVENTS");
    expect(reason({ item_count: 10, item_native_pubdate_count: 0,
      alternate_feed_items_seen: 0 }))
      .toBe("SAMPLED_FEED_MISSING_NATIVE_PUBLISH_DATES");
    expect(classifyNativeFeedGap({ articlesCount: 1, diagnostics: {} }))
      .toBe("ORIGINAL_NATIVE_EVENTS_PRIVATE_ONLY");
  });

  for (const [category, host, title] of fixtures) {
    it(`accepts ONLY independently source-native, private ${category} articles`, async () => {
      const xml = rss(title, `https://${host}/news/verified-original-report`);
      const diagnostics: Record<string, number> = {};
      const rows = parseOfficialNativeRss(xml, category, now,
        24 * 60 * 60 * 1000, diagnostics);
      expect(diagnostics).toEqual({
        item_count: 1, item_native_pubdate_count: 1,
        item_native_date_in_window_count: 1,
        exact_publisher_host_count: 1, domain_topic_title_count: 1,
        admitted_private_count: 1,
      });
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

  it("rejects even two-minute future native publication dates without a grace period", () => {
    const url = "https://news.un.org/en/story/2026/10/conflict";
    const headline = fixtures[0][2];
    const diagnostic: Record<string, number> = {};
    const future = rss(headline, url, "Fri, 09 Oct 2026 12:02:00 GMT");
    expect(parseOfficialNativeRss(future, "geopolitics", now,
      24 * 60 * 60 * 1000, diagnostic)).toEqual([]);
    expect(diagnostic.item_native_pubdate_count).toBe(1);
    expect(diagnostic.item_native_date_in_window_count).toBe(0);
    expect(diagnostic.admitted_private_count).toBe(0);
    expect(parseOfficialNativeRss(rss(headline, url, "Fri, 09 Oct 2026 12:00:00 GMT"),
      "geopolitics", now)).toHaveLength(1);
  });

  it("identifies native-time failure separately from transport and title filtering", () => {
    const diagnostic: Record<string, number> = {};
    const xml = rss(fixtures[0][2], "https://news.un.org/en/story/2026/10/conflict", "");
    const rows = parseOfficialNativeRss(xml, "geopolitics", now,
      24 * 60 * 60 * 1000, diagnostic);
    expect(rows).toHaveLength(0);
    expect(diagnostic.item_count).toBe(1);
    expect(diagnostic.item_native_pubdate_count).toBe(0);
    expect(diagnostic.domain_topic_title_count).toBe(1);
    expect(diagnostic.admitted_private_count).toBe(0);
    expect(JSON.stringify(diagnostic)).not.toContain("news.un.org");
  });

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
