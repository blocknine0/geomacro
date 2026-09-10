import { describe, expect, it } from "vitest";

import {
  normalizeTestnetSocialCardInput,
  renderTestnetSocialCardSvg,
  TESTNET_SOCIAL_CARD_VERSION,
} from "../lib/testnet-social-card";

describe("testnet social card", () => {
  it("renders a bounded branded 1200x630 card", () => {
    const svg = renderTestnetSocialCardSvg({
      subject: "USA > CHN",
      summary: "Directional endpoint-composed risk context for Testnet evaluation.",
      score: 73.4,
      delta: -2.1,
      confidence: 84.2,
      chain: "Arc Testnet",
      profile_name: "Pallab",
    });

    expect(TESTNET_SOCIAL_CARD_VERSION).toBe("geomacro-testnet-card-v1");
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain("Geomacro");
    expect(svg).toContain("TESTNET · USDC ACCESS");
    expect(svg).toContain("geomacro.live");
    expect(svg).toContain("Shared by Pallab");
  });

  it("escapes user-controlled text and clamps numeric values", () => {
    const normalized = normalizeTestnetSocialCardInput({
      subject: "<script>alert(1)</script>",
      summary: "A & B < C",
      score: 999,
      delta: -999,
      confidence: 999,
    });
    const svg = renderTestnetSocialCardSvg(normalized);

    expect(normalized.score).toBe(100);
    expect(normalized.delta).toBe(-100);
    expect(normalized.confidence).toBe(100);
    expect(svg).not.toContain("<script>alert(1)</script>");
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).toContain("A &amp; B &lt; C");
  });

  it("contains no upstream source identity fields", () => {
    const source = renderTestnetSocialCardSvg({
      subject: "Risk intelligence",
      summary: "Bounded governed structural context.",
    });

    for (const forbidden of [
      "source_url",
      "source_id",
      "publisher",
      "source_name",
      "upstream_news_source",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
