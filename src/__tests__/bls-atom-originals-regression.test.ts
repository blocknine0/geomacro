import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  acceptedOriginalArticleLink, parseFirstPartyFeed, deriveStatelessSignals,
  type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const samples = [
  ["bls_cpi", "cpi", "Consumer Price Index for September rose in latest data"],
  ["bls_employment", "empsit", "Employment Situation in September for workers"],
  ["bls_external_prices", "ximpim", "U.S. Import and Export Price Indexes for September"],
] as const;

describe("verified BLS Atom publisher originals", () => {
  for (const [id, family, title] of samples) {
    it(id + " retains publisher-native published time and strict original release identity", () => {
      const source: StatelessSourceSpec = {
        id, category: "macro", media: "atom",
        url: "https://www.bls.gov/feed/" + family + ".rss",
        allowedHosts: ["www.bls.gov"], credit: null,
      };
      const link = "https://www.bls.gov/news.release/" + family + ".nr0.htm";
      const original = "2026-10-08T12:30:00Z";
      const xml = "<feed><entry><title>" + title + "</title><link rel=\"alternate\" href=\"" + link +
        "\"/><published>" + original + "</published><updated>2026-10-15T00:00:00Z</updated></entry></feed>";
      const parsed = parseFirstPartyFeed(xml, source, Date.parse("2026-10-15T12:00:00Z"));
      expect(parsed.metrics).toMatchObject({
        seen: 1, relevant: 1, original_link_valid: 1, native_clock_valid: 1,
      });
      expect(parsed.dated).toHaveLength(1);
      expect(parsed.dated[0].publishedAt).toBe(original.replace("Z", ".000Z"));
      const at = Date.parse(original);
      expect(deriveStatelessSignals(parsed.dated, at - 1)).toHaveLength(0);
      const signals = deriveStatelessSignals(parsed.dated, at);
      expect(signals).toHaveLength(1);
      expect(signals[0]).toMatchObject({ category: "macro", severity: null,
        same_event_corrob_verified: false, status: "official_release_observed_unscored" });
      expect(JSON.stringify(signals)).not.toContain(title);
      expect(JSON.stringify(signals)).not.toContain(link);
      for (const bad of [
        link + "?updated=1", link + "#top",
        link.replace("www.bls.gov", "www.bls.gov.invalid"),
        link.replace(family + ".nr0.htm", "other.nr0.htm"),
      ]) expect(acceptedOriginalArticleLink(bad, source)).toBeNull();
    });
  }
  it("never activates Supabase or direct x402 settlement", () => {
    const src = readFileSync("src/lib/stateless-public-intelligence.server.ts", "utf8");
    for (const [, family] of samples)
      expect(src).toContain("https://www.bls.gov/feed/" + family + ".rss");
    expect(src).not.toContain("SUPABASE_DB_URL");
    expect(src).not.toContain("settleCoinbase");
  });
});
