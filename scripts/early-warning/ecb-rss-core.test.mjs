import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { classifyEcbTitle, parseEcbPressRss } from "./ecb-rss-core.mjs";

const fixture = fs.readFileSync(
  new URL("./fixtures/ecb-press-sample.xml", import.meta.url),
  "utf8",
);

describe("ECB RSS core", () => {
  it("parses only bounded official ECB item metadata", () => {
    const items = parseEcbPressRss(fixture);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("ECB announces monetary policy decisions");
    expect(items[0].url).toMatch(/^https:\/\/www\.ecb\.europa\.eu\//);
    expect(items[0].published_at_utc).toBe("2026-09-16T10:15:00.000Z");
    expect(items[0].event_family_candidate).toBe("monetary_policy");
    expect(items[0].raw_body_stored).toBe(false);
    expect(items[0].source_record_id).toMatch(/^[0-9a-f]{64}$/);
    expect(items[1].event_family_candidate).toBe("regulatory_policy");
  });

  it("decodes XML entities exactly once", () => {
    const encoded = fixture.replace(
      "ECB Banking Supervision publishes supervisory priorities",
      "ECB &amp;lt;test&amp;gt; &amp; policy",
    );
    const items = parseEcbPressRss(encoded);
    expect(items[1].title).toBe("ECB &lt;test&gt; & policy");
    expect(items[1].title).not.toContain("<test>");
  });

  it("leaves CDATA content literal instead of entity-decoding it again", () => {
    const encodedCdata = fixture.replace(
      "ECB announces monetary policy decisions",
      "ECB &amp; monetary policy decisions",
    );
    const items = parseEcbPressRss(encodedCdata);
    expect(items[0].title).toBe("ECB &amp; monetary policy decisions");
  });

  it("classifies only explicit title patterns and otherwise returns other", () => {
    expect(classifyEcbTitle("ECB announces key ECB interest rates")).toBe("monetary_policy");
    expect(classifyEcbTitle("ECB updates collateral framework")).toBe("banking_liquidity");
    expect(classifyEcbTitle("A general ECB publication")).toBe("other");
  });

  it("rejects non-ECB item URLs", () => {
    const poisoned = fixture.replace(
      "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp260916~example.en.html",
      "https://example.com/fake-ecb-release",
    );
    expect(() => parseEcbPressRss(poisoned)).toThrow(/unexpected URL/);
  });

  it("rejects malformed or empty RSS payloads", () => {
    expect(() => parseEcbPressRss("<html>not rss</html>")).toThrow(/not a valid RSS/);
    expect(() => parseEcbPressRss("<rss><channel></channel></rss>")).toThrow(/contains no items/);
  });
});
