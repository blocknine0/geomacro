import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  deriveStatelessSignals, parseFirstPartyFeed, selectOfficialTopic,
  type StatelessSourceSpec,
} from "@/lib/stateless-intelligence-model";

const now = Date.parse("2026-10-12T22:00:00.000Z");
const source = (id: string, category: "rare_earth" | "macro"): StatelessSourceSpec => ({
  id, category, media: "rss",
  url: "https://www.minister.industry.gov.au/feed/king/rss.xml",
  allowedHosts: ["www.minister.industry.gov.au"], credit: null,
});
const item = (title: string, path: string, original: string) =>
  "<item><title>" + title + "</title><link>https://www.minister.industry.gov.au" +
  path + "</link><pubDate>" + original + "</pubDate></item>";
const rss = (...items: string[]) =>
  '<rss version="2.0"><channel>' + items.join("") + '</channel></rss>';

describe("Australian Resources Minister original news recovery", () => {
  it("uses the Resources Minister official RSS and preserves original dates", () => {
    const src = readFileSync("src/lib/stateless-public-intelligence.server.ts", "utf8");
    expect(src).toContain("https://www.minister.industry.gov.au/feed/king/rss.xml");
    expect(src).toContain("https://www.minister.industry.gov.au/feed/media-releases/rss.xml");
    expect(src).not.toContain("https://www.minister.industry.gov.au/feed/t-ayres/rss.xml");
    expect(src).toContain('id: "au_resource_exports", category: "macro"');
    expect(src).toContain('id: "au_resource_releases", category: "rare_earth"');
    expect(src).not.toContain("https://www.minister.industry.gov.au/feed/m-king/rss.xml");
  });
  it("recognizes distinct original-dated rare-earth releases without copying publisher headlines", () => {
    const xml=rss(
      item("Construction starts on Arafura Rare Earths Project",
        "/king/media/construction-starts-arafura-rare-earths-project",
        "Thu, 08 Oct 2026 05:00:00 GMT"),
      item("Speech at Arafura Rare Earths Nolans Project groundbreaking ceremony",
        "/king/media/speech-arafura-rare-earths-nolans-project-groundbreaking-ceremony",
        "Fri, 09 Oct 2026 05:00:00 GMT"),
    );
    const result=parseFirstPartyFeed(xml,source("au_resource_releases","rare_earth"),now);
    expect(result.metrics.original_link_valid).toBe(2);
    const signals=deriveStatelessSignals(result.dated,now);
    expect(signals).toHaveLength(2);
    expect(signals.every(x=>x.category==="rare_earth" &&
      x.severity===null && x.same_event_corrob_verified===false)).toBe(true);
    expect(signals[0].published_at).toBe("2026-10-09T05:00:00.000Z");
    expect(JSON.stringify(signals)).not.toContain("https://");
    expect(JSON.stringify(signals)).not.toContain("Construction starts on Arafura");
  });
  it("prevents repeat publication of an identical original URL", () => {
    const article=item("Construction starts on Arafura Rare Earths Project",
      "/king/media/construction-starts-arafura-rare-earths-project",
      "Thu, 08 Oct 2026 05:00:00 GMT");
    const first=parseFirstPartyFeed(rss(article),source("au_resource_releases","rare_earth"),now);
    const second=parseFirstPartyFeed(rss(article),source("au_resource_releases","rare_earth"),now);
    expect(deriveStatelessSignals([...first.dated,...second.dated],now)).toHaveLength(1);
  });
  it("recognizes publisher-original resource export releases for Macro/FX without inventing FX direction", () => {
    const title="Resources and energy exports remain steady";
    expect(selectOfficialTopic(title,"macro")?.name).toBe("trade and economic relations");
    const parsed=parseFirstPartyFeed(rss(item(title,
      "/king/media/resources-and-energy-exports-remain-steady",
      "Fri, 02 Oct 2026 04:00:00 GMT")),source("au_resource_exports","macro"),now);
    expect(parsed.dated).toHaveLength(1);
    const [signal]=deriveStatelessSignals(parsed.dated,now);
    expect(signal.category).toBe("macro");
    expect(signal.title).toMatch(/^Geomacro finds /);
    expect(signal.why_it_matters).not.toMatch(/\b(export prices (?:rose|fell)|AUD (?:rallied|plunged))\b/i);
  });
  it("does not make future-dated, undated or external-host Australian releases into eligible news", () => {
    const feed=rss(
      item("Construction starts on Arafura Rare Earths Project",
        "/king/media/construction-starts-arafura-rare-earths-project",
        "Tue, 13 Oct 2026 02:00:00 GMT"),
      '<item><title>Rare earths project starts today</title>' +
      '<link>https://attacker.example.net/king/media/rare-earths</link>' +
      '<pubDate>Fri, 09 Oct 2026 04:00:00 GMT</pubDate></item>',
    );
    const parsed=parseFirstPartyFeed(feed,source("au_resource_releases","rare_earth"),now);
    expect(parsed.dated).toEqual([]);
    expect(deriveStatelessSignals(parsed.dated,now)).toEqual([]);
  });
});
