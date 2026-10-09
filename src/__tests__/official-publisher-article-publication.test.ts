import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  originalPublicationFromPublisherHtml,
  fetchPublisherOriginalPublication,
} from "../../scripts/lib/official-publisher-article-publication.mjs";
import { fetchOriginalAlternate } from "../../scripts/lib/official-native-alternates.mjs";

const now = new Date("2026-10-09T13:30:00Z");
const approvedNews = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals.html";
const approvedStatCan = "https://www.statcan.gc.ca/en/daily-quotidien/261009/a-eng.htm";
const validMeta = (time: string) =>
  `<html><head><meta property="article:published_time" content="${time}"></head><body>Article</body></html>`;
const feed = (title: string, url: string) =>
  `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>${title}</title><link rel="alternate" href="${url}"/>
  <updated>2026-10-09T13:29:00Z</updated></entry></feed>`;

describe("source-native original article HTML publication fallback", () => {
  it("requires first-party explicit published metadata, never page modified/updated time", () => {
    expect(originalPublicationFromPublisherHtml(validMeta("2026-10-09T12:15:00Z"), { now }))
      .toBe("2026-10-09T12:15:00.000Z");
    expect(originalPublicationFromPublisherHtml(
      '<meta name="dcterms.issued" content="2026-10-09T12:05:00-04:00">', { now }))
      .toBeNull(); // publication would be in the future at this fixed now
    expect(originalPublicationFromPublisherHtml(
      '<meta name="dcterms.issued" content="2026-10-09T08:05:00-04:00">', { now }))
      .toBe("2026-10-09T12:05:00.000Z");
    expect(originalPublicationFromPublisherHtml(
      '<meta property="article:modified_time" content="2026-10-09T13:29:00Z">', { now }))
      .toBeNull();
    expect(originalPublicationFromPublisherHtml(
      '<meta name="dcterms.modified" content="2026-10-09T13:29:00Z">', { now }))
      .toBeNull();
    expect(originalPublicationFromPublisherHtml(
      '<meta name="dcterms.issued" content="2026-10-09">', { now }))
      .toBeNull(); // day without hour is not hour-fresh evidence
    expect(originalPublicationFromPublisherHtml(
      '<meta property="article:published_time" content="2026-10-05T12:15:00Z">', { now }))
      .toBeNull();
    expect(originalPublicationFromPublisherHtml(
      '<meta property="article:published_time" content="2026-02-30T12:15:00Z">', { now }))
      .toBeNull();
  });

  it("never allows arbitrary hosts, HTTP, unsafe redirects or non-HTML media", async () => {
    const fetchImpl = vi.fn(async () => new Response(validMeta("2026-10-09T12:15:00Z"), {
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    for (const bad of [
      "http://www.canada.ca/xx",
      "https://evil.canada.ca.evil.example/xx",
      "https://127.0.0.1/x",
      "https://www.canada.ca:8443/path",
      "https://username:password@www.canada.ca/path",
    ]) {
      await expect(fetchPublisherOriginalPublication(bad, ["www.canada.ca"],
        { fetchImpl, now })).rejects.toThrow("PUBLISHER_PAGE_URL_NOT_APPROVED");
    }
    expect(fetchImpl).not.toHaveBeenCalled();

    const pdf = vi.fn(async () => new Response("not HTML", {
      headers: { "content-type": "application/pdf" },
    }));
    await expect(fetchPublisherOriginalPublication(approvedNews, ["www.canada.ca"],
      { fetchImpl: pdf, now })).rejects.toThrow("PUBLISHER_PAGE_TRANSPORT_INVALID");
  });

  it("promotes updated-only NRCan Atom to PRIVATE only if linked publisher has original date", async () => {
    const atom = feed("Canada supports critical minerals and rare earth lithium refining", approvedNews);
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("https://api.io.canada.ca/")) return new Response(atom, {
        headers: { "content-type": "application/atom+xml" },
      });
      if (url === approvedNews) return new Response(validMeta("2026-10-09T12:15:00Z"), {
        headers: { "content-type": "text/html" },
      });
      return new Response("", { status: 404 });
    });
    const diagnostics: Record<string, number> = {};
    const rows = await fetchOriginalAlternate("rare_earth", { now, fetchImpl, diagnostics });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      publishedAt: "2026-10-09T12:15:00.000Z",
      nativeTimeEvidence: "publisher_first_party_article_publication_metadata",
      privateOnly: true, rightsVerified: false, commercialEligible: false,
    });
    expect(diagnostics.alternate_publisher_page_attempted).toBe(1);
    expect(diagnostics.alternate_publisher_page_original_date_verified).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).redirect).toBe("error");
  });

  it("does not use Atom updated when StatCan article lacks explicit original date", async () => {
    const atom = feed("Consumer price inflation and currency prices show macro shift", approvedStatCan);
    const fetchImpl = vi.fn(async (url: string) =>
      new Response(url.includes(".atom") ? atom : '<meta name="dcterms.modified" content="2026-10-09T13:29:00Z">',
        { headers: { "content-type": url.includes(".atom") ? "application/atom+xml" : "text/html" } }));
    const diagnostics: Record<string, number> = {};
    const rows = await fetchOriginalAlternate("macro", { now, fetchImpl, diagnostics });
    expect(rows).toEqual([]);
    expect(diagnostics.alternate_publisher_page_attempted).toBe(1);
    expect(diagnostics.alternate_publisher_page_original_date_verified).toBe(0);
    expect(diagnostics.alternate_admitted_private_count).toBe(0);
  });

  it("safely caps article page GETs at 2 despite many topical entries", async () => {
    const entries = Array.from({ length: 40 }, (_, i) =>
      `<entry><title>Critical minerals lithium expansion development number ${i}</title>
      <link rel="alternate" href="https://www.canada.ca/en/news/2026/10/minerals-${i}.html"/>
      <updated>2026-10-09T13:29:00Z</updated></entry>`).join("");
    let pageGets = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("api.io.canada.ca")) return new Response(`<feed>${entries}</feed>`,
        { headers: { "content-type": "application/atom+xml" } });
      pageGets++;
      return new Response("<meta name='dcterms.modified' content='2026-10-09T13:29:00Z'>",
        { headers: { "content-type": "text/html" } });
    });
    const diagnostics: Record<string, number> = {};
    expect(await fetchOriginalAlternate("rare_earth", { now, fetchImpl, diagnostics }))
      .toEqual([]);
    expect(pageGets).toBe(2);
    expect(diagnostics.alternate_publisher_page_attempted).toBe(2);
  });

  it("preserves zero-B2/Supabase/no-payment & no-raw source-audit contract", () => {
    const source = readFileSync("scripts/lib/official-native-alternates.mjs", "utf8");
    const audit = readFileSync("scripts/ops/probe-official-native-rss-three-domains.mjs", "utf8");
    expect(source).toContain("MAX_PRIVATE_PAGE_LOOKUPS = 2");
    expect(source).toContain("publisher_first_party_article_publication_metadata");
    expect(audit).toContain("publisher_page_read_count");
    expect(audit).toContain("publisher_page_original_publication_verified");
    expect(audit).toContain("supabase_reads: 0, supabase_writes: 0, b2_requests: 0");
  });
});
