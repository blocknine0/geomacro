import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractTrustedPublishedAt,
  isTrustedFedericoTimestampUrl,
} from "../lib/federico-source-time-hydration";

const SOURCE_URL = "https://english.news.cn/20261001/example.html";
const AS_OF = new Date("2026-10-01T16:30:00.000Z");

describe("Federico trusted source publication-time hydration", () => {
  it("extracts an explicit article publication meta timestamp", () => {
    const html = '<html><head><meta content="2026-10-01T15:05:00Z" property="article:published_time"></head></html>';
    expect(extractTrustedPublishedAt(html, SOURCE_URL, AS_OF)).toBe(
      "2026-10-01T15:05:00.000Z",
    );
  });

  it("extracts JSON-LD datePublished", () => {
    const html = '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-01T14:20:00+00:00"}</script>';
    expect(extractTrustedPublishedAt(html, SOURCE_URL, AS_OF)).toBe(
      "2026-10-01T14:20:00.000Z",
    );
  });

  it("interprets a timezone-less Xinhua publication time as China Standard Time", () => {
    const html = '<meta itemprop="datePublished" content="2026-10-01 22:00:00">';
    expect(extractTrustedPublishedAt(html, SOURCE_URL, AS_OF)).toBe(
      "2026-10-01T14:00:00.000Z",
    );
  });

  it("uses the bounded visible Xinhua article timestamp when structured metadata is absent", () => {
    const html = '<html><body><div>Source: Xinhua</div><div>Editor: huaxia</div><div>2026-10-01 19:21:31</div></body></html>';
    expect(extractTrustedPublishedAt(html, SOURCE_URL, AS_OF)).toBe(
      "2026-10-01T11:21:31.000Z",
    );
  });

  it("ignores date-only metadata and prefers a precise visible publication time", () => {
    const html = '<html><head><meta itemprop="datePublished" content="2026-10-01"></head><body><div>2026-10-01 19:21:31</div></body></html>';
    expect(extractTrustedPublishedAt(html, SOURCE_URL, AS_OF)).toBe(
      "2026-10-01T11:21:31.000Z",
    );
  });

  it("rejects date-only metadata when no precise publication time exists", () => {
    const html = '<meta itemprop="datePublished" content="2026-10-01">';
    expect(extractTrustedPublishedAt(html, SOURCE_URL, AS_OF)).toBeNull();
  });

  it("rejects untrusted hosts, stale timestamps, and future timestamps", () => {
    expect(isTrustedFedericoTimestampUrl(SOURCE_URL)).toBe(true);
    expect(isTrustedFedericoTimestampUrl("https://example.com/article")).toBe(false);

    expect(
      extractTrustedPublishedAt(
        '<meta property="article:published_time" content="2026-10-01T15:00:00Z">',
        "https://example.com/article",
        AS_OF,
      ),
    ).toBeNull();

    expect(
      extractTrustedPublishedAt(
        '<meta property="article:published_time" content="2026-09-29T15:00:00Z">',
        SOURCE_URL,
        AS_OF,
      ),
    ).toBeNull();

    expect(
      extractTrustedPublishedAt(
        '<meta property="article:published_time" content="2026-10-01T17:30:00Z">',
        SOURCE_URL,
        AS_OF,
      ),
    ).toBeNull();
  });

  it("keeps readiness fail-closed and re-corroborates only after trusted hydration", () => {
    const script = readFileSync("scripts/check-federico-publication.ts", "utf8");
    const hydrate = script.indexOf("const hydrated = await hydrateTrustedSourceTimes()");
    const recorroborate = script.indexOf("await recorroborateCountry()");
    const dryRun = script.indexOf("await dryRunCountryRiskObject");
    const strictAssert = script.indexOf("assertFedericoPublicationReady(object)");

    expect(hydrate).toBeGreaterThan(-1);
    expect(recorroborate).toBeGreaterThan(hydrate);
    expect(dryRun).toBeGreaterThan(recorroborate);
    expect(strictAssert).toBeGreaterThan(dryRun);
    expect(script).toContain(".is(\"published_at\", null)");
    expect(script).toContain("trusted_publisher_metadata_only");
  });

  it("keeps stdout as exactly one readiness JSON document", () => {
    const script = readFileSync("scripts/check-federico-publication.ts", "utf8");
    expect(script.match(/console\.log\(/g) ?? []).toHaveLength(1);
    expect(script.match(/console\.error\(/g) ?? []).toHaveLength(2);
    expect(script).toContain("stdout is intentionally exactly one JSON document");
  });
});
