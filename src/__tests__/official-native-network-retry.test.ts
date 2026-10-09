import { describe, expect, it, vi } from "vitest";
import { fetchOriginalPublisherWithRecovery } from "../../scripts/lib/official-native-network-retry.mjs";
import { fetchOfficialNativeArticles, OFFICIAL_NATIVE_FEEDS }
  from "../../scripts/lib/official-native-rss.mjs";
import { fetchOriginalAlternate, ORIGINAL_PUBLISHER_ALTERNATES }
  from "../../scripts/lib/official-native-alternates.mjs";
import { readFileSync } from "node:fs";

const now = new Date("2026-10-09T12:00:00Z");
const fresh = "Fri, 09 Oct 2026 11:38:00 GMT";
const geoRss = `<rss version="2.0"><channel><item><title>Security Council confirms renewed ceasefire arrangement after conflict</title><link>https://news.un.org/en/story/2026/10/example-original</link><pubDate>${fresh}</pubDate></item></channel></rss>`;
const xml = (body: string) => new Response(body, {
  headers: { "content-type": "application/rss+xml; charset=utf-8" },
});

describe("official publisher transient recovery is bounded and fail-closed", () => {
  it("recovers 503 once using a NEW deadline without changing publisher-native evidence", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(xml(geoRss));
    const result = await fetchOfficialNativeArticles("geopolitics", { fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(OFFICIAL_NATIVE_FEEDS.geopolitics.url);
    expect(fetchImpl.mock.calls[1][0]).toBe(OFFICIAL_NATIVE_FEEDS.geopolitics.url);
    const a = fetchImpl.mock.calls[0][1];
    const b = fetchImpl.mock.calls[1][1];
    expect(a.redirect).toBe("error");
    expect(b.redirect).toBe("error");
    expect(a.signal).not.toBe(b.signal);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      publishedAt: "2026-10-09T11:38:00.000Z",
      privateOnly: true, commercialEligible: false, rightsVerified: false,
    });
    expect(result[0]).not.toHaveProperty("severity");
  });

  it("recovers a network error once, but never retries permanent 403 or 404", async () => {
    const pause = vi.fn(async () => {});
    const transient = vi.fn()
      .mockRejectedValueOnce(new Error("network disrupted"))
      .mockResolvedValueOnce(xml("<rss/>"));
    const result = await fetchOriginalPublisherWithRecovery(
      OFFICIAL_NATIVE_FEEDS.geopolitics.url, { fetchImpl: transient, pause });
    expect(result.status).toBe(200);
    expect(transient).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
    for (const status of [403, 404]) {
      const permanent = vi.fn(async () => new Response("Unavailable", { status }));
      const res = await fetchOriginalPublisherWithRecovery(
        OFFICIAL_NATIVE_FEEDS.geopolitics.url, { fetchImpl: permanent, pause });
      expect(res.status).toBe(status);
      expect(permanent).toHaveBeenCalledTimes(1);
    }
  });

  it("does not turn two consecutive 429, 500 or connection failures into eligible news", async () => {
    for (const status of [429, 500, 503]) {
      const f = vi.fn(async () => new Response("unavailable", { status }));
      const res = await fetchOriginalPublisherWithRecovery(
        OFFICIAL_NATIVE_FEEDS.macro.url, { fetchImpl: f, pause: async () => {} });
      expect(f).toHaveBeenCalledTimes(2);
      expect(res.status).toBe(status);
    }
    const f = vi.fn(async () => { throw new Error("transient failure"); });
    await expect(fetchOriginalPublisherWithRecovery(
      OFFICIAL_NATIVE_FEEDS.rare_earth.url, { fetchImpl: f, pause: async () => {} },
    )).rejects.toThrow("ORIGINAL_FEED_NETWORK_UNAVAILABLE");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("bounds exact official HTTPS-only URLs, deadlines and alternate feed attempts", async () => {
    await expect(fetchOriginalPublisherWithRecovery("http://example.org/feed"))
      .rejects.toThrow("ORIGINAL_FEED_REQUEST_INVALID");
    await expect(fetchOriginalPublisherWithRecovery(
      OFFICIAL_NATIVE_FEEDS.macro.url, { timeoutMs: 60_000 },
    )).rejects.toThrow("ORIGINAL_FEED_REQUEST_INVALID");
    const status404 = vi.fn(async () => new Response("gone", { status: 404 }));
    await expect(fetchOriginalAlternate("macro", { fetchImpl: status404, now }))
      .rejects.toThrow("OFFICIAL_ALTERNATE_TRANSPORT_INVALID");
    expect(status404).toHaveBeenCalledTimes(1);
    expect(status404.mock.calls[0][0]).toBe(ORIGINAL_PUBLISHER_ALTERNATES.macro.url);
  });

  it("keeps both feeds bounded without broadening commercial authorization", () => {
    const a = readFileSync("scripts/lib/official-native-rss.mjs", "utf8");
    const b = readFileSync("scripts/lib/official-native-alternates.mjs", "utf8");
    const proof = readFileSync("scripts/ops/probe-official-native-rss-three-domains.mjs", "utf8");
    for (const s of [a, b]) {
      expect(s).toContain("fetchOriginalPublisherWithRecovery");
      expect(s).toMatch(/rightsVerified:\s*false/);
    }
    expect(proof).toContain("public_scored_verified: false");
    expect(proof).toContain("funds_touched: false");
    expect(proof).toContain("b2_requests: 0");
  });
});
