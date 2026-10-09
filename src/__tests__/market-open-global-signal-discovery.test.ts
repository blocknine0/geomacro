import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  DISCOVERY_CATEGORIES,
  DISCOVERY_QUERIES,
  DISCOVERY_POLL_MINUTES,
  MARKET_SIGNAL_SCHEMA,
  gdeltSeenAt,
  summarizeOpenDiscovery,
  unavailableOpenDiscovery,
  pollOpenDiscovery,
  probeOpenDiscoveryMesh,
} from "../../scripts/lib/market-signal-discovery.mjs";

const now = new Date("2026-10-09T14:00:00.000Z");
const candidate = (url: string, seen = "20261009T135000Z") => ({
  url, domain: new URL(url).hostname, seendate: seen,
  sourcecountry: "United States", title: "Unverified private signal, not original news",
});
const good = [
  candidate("https://news.example.org/conflict-1"),
  candidate("https://other.example.net/conflict-1"),
];

describe("#1827 market-style three-category open-discovery receipts", () => {
  it("keeps GDELT first-seen clock separate from publisher original time", () => {
    expect(gdeltSeenAt("20261009T135000Z")).toBe("2026-10-09T13:50:00.000Z");
    expect(gdeltSeenAt("2026-10-09T13:50:00Z")).toBe("2026-10-09T13:50:00.000Z");
    expect(gdeltSeenAt("20261009T260000Z")).toBeNull();
    expect(gdeltSeenAt("20261009T140000")).toBeNull();
    expect(gdeltSeenAt("today")).toBeNull();
  });

  it("counts distinct observed news outlets without falsely corroborating the same event", () => {
    const row = summarizeOpenDiscovery("geopolitics", { articles: [...good,
      candidate("https://other.example.net/different-article")] }, { now });
    expect(row).toMatchObject({
      state: "MULTI_OUTLET_DISCOVERY_ONLY",
      source_transport_ok: true,
      gdelt_articles_sampled: 3,
      freshly_indexed_articles: 3,
      distinct_outlet_domains: 2,
      observed_not_original_published: true,
      original_article_publication_verified: false,
      same_event_independently_corroborated: false,
      commercial_rights_verified: false, publicly_scored: false, chargeable: false,
    });
    expect(JSON.stringify(row)).not.toContain("Unverified private signal");
    expect(JSON.stringify(row)).not.toContain("news.example.org");
    expect(JSON.stringify(row)).not.toContain("United States");
  });

  it("rejects future first-seen stamps, old articles, fake declared domains and non-HTTPS origins", () => {
    const rows = [candidate("https://first.example.org/safe"),
      candidate("https://fresh.example.com/future", "20261009T140200Z"),
      candidate("https://stale.example.com/old", "20261009T080000Z"),
      { ...candidate("https://evil.example.com/one"), domain: "trusted.gov" },
      candidate("http://insecure.example.org/test"),
    ];
    const result = summarizeOpenDiscovery("rare_earth", { articles: rows }, { now });
    expect(result).toMatchObject({
      state: "SINGLE_OUTLET_DISCOVERY_ONLY",
      freshly_indexed_articles: 1,
      future_index_timestamps_rejected: 1,
      old_or_missing_index_timestamps: 1,
      distinct_outlet_domains: 1,
      publicly_scored: false,
    });
    expect(result.latest_index_seen_at).toBe("2026-10-09T13:50:00.000Z");
  });

  it("reports source heartbeat as distinct from new verified news (even with zero articles)", async () => {
    expect(summarizeOpenDiscovery("macro", { articles: [] }, { now }))
      .toMatchObject({ source_transport_ok: true, state: "NO_RECENT_OPEN_DISCOVERY",
        freshly_indexed_articles: 0, publicly_scored: false });
    expect(unavailableOpenDiscovery("macro")).toMatchObject({
      source_transport_ok: false, state: "SOURCE_UNAVAILABLE",
      chargeable: false,
    });
    const receipt = await probeOpenDiscoveryMesh({
      now, fetchCategory: vi.fn(async (category: string) =>
        summarizeOpenDiscovery(category, { articles: good }, { now })),
    });
    expect(receipt).toMatchObject({
      schema: MARKET_SIGNAL_SCHEMA,
      poll_minutes: DISCOVERY_POLL_MINUTES,
      source_reachability: "ALL_POLL_OK",
      source_heartbeat_is_event_freshness: false,
      three_category_current_scored_ready: false,
      supabase_reads: 0, supabase_writes: 0, b2_requests: 0, chargeable: false,
    });
    expect(receipt.categories.map((x: { category: string }) => x.category))
      .toEqual(DISCOVERY_CATEGORIES);
  });

  it("keeps upstream loss localized rather than fabricating availability or falling back to stale", async () => {
    const receipt = await probeOpenDiscoveryMesh({
      now,
      fetchCategory: async (category: string) => {
        if (category === "macro") throw new Error("remote error secret must not log");
        return summarizeOpenDiscovery(category, { articles: [] }, { now });
      },
    });
    expect(receipt.source_reachability).toBe("DEGRADED");
    expect(receipt.categories[1]).toMatchObject({
      category: "macro", state: "SOURCE_UNAVAILABLE",
      source_transport_ok: false, chargeable: false,
    });
    expect(JSON.stringify(receipt)).not.toContain("remote error");
  });

  it("polls three fixed bounded topic queries, no remote source URL from input", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ articles: good }), { headers: { "content-type": "application/json" } },
    ));
    for (const category of DISCOVERY_CATEGORIES) {
      const row = await pollOpenDiscovery(category, { now, fetchImpl });
      expect(row.freshly_indexed_articles).toBe(2);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      const link = new URL(fetchImpl.mock.calls[i][0]);
      expect(link.origin).toBe("https://api.gdeltproject.org");
      expect(link.searchParams.get("query")).toBe(DISCOVERY_QUERIES[DISCOVERY_CATEGORIES[i]]);
      expect(link.searchParams.get("timespan")).toBe("2h");
      expect(Number(link.searchParams.get("maxrecords"))).toBeLessThanOrEqual(75);
      expect((fetchImpl.mock.calls[i][1] as RequestInit).redirect).toBe("error");
    }
  });

  it("rejects very large response and unknown categories with no funds or database access", async () => {
    const bad = vi.fn(async () => new Response("x", {
      headers: { "content-type": "application/json", "content-length": "999999" },
    }));
    expect((await pollOpenDiscovery("geopolitics", { now, fetchImpl: bad })).state)
      .toBe("SOURCE_UNAVAILABLE");
    await expect(pollOpenDiscovery("anything", { now, fetchImpl: bad }))
      .rejects.toThrow("MARKET_DISCOVERY_CATEGORY_INVALID");
    expect(() => summarizeOpenDiscovery("geopolitics", { articles: null }, { now }))
      .toThrow("MARKET_DISCOVERY_PAYLOAD_INVALID");
  });

  it("registers a dedicated recurring no-secrets low-cost monitoring lane", () => {
    const job = readFileSync(".github/workflows/global-open-signal-monitor.yml", "utf8");
    expect(job).toContain("17,47 * * * *");
    expect(job).toContain("scripts/ops/probe-market-signal-discovery.mjs");
    expect(job).toContain("contents: read");
    expect(job).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(job).not.toContain("B2_APPLICATION_KEY");
    expect(job).not.toContain("CLOUDFLARE_API_TOKEN");
    expect(job).not.toContain("payment_signature");
  });
});
