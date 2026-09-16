import { describe, expect, it } from "vitest";

import { renderPublicEarlyWarningRss } from "./public-early-warning-rss";

const feed = {
  feed_schema_version: "geomacro.public-early-warning-feed.v1",
  generated_at_utc: "2026-09-16T08:13:10.000Z",
  items: [
    {
      alert_key: "sample-alert-1",
      country: { iso3: "IND", name: "India & South Asia", local_timezone: "Asia/Kolkata" },
      event: {
        family: "monetary_policy",
        title: "Policy <update>",
        primary_cause: "Verified policy change & cross-market transmission",
      },
      early_warning: { status: "WARNING", cews_score: 76.4, confidence: 0.86 },
      timestamps: {
        detected_at_local: "2026-09-16T13:42:41+05:30",
        published_at_utc: "2026-09-16T08:13:00.000Z",
      },
      public_url: "https://geomacro.live/intelligence/sample",
      boundaries: {
        structural_pressure_only: true as const,
        market_price_prediction: false as const,
        trading_instruction: false as const,
        public_performance_claims_allowed: false as const,
      },
    },
  ],
};

describe("public Early Warning RSS", () => {
  it("renders bounded feed items and escapes XML", () => {
    const rss = renderPublicEarlyWarningRss(feed);
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain("Geomacro WARNING · India &amp; South Asia (IND)");
    expect(rss).toContain("Verified policy change &amp; cross-market transmission");
    expect(rss).toContain("https://geomacro.live/intelligence/sample");
    expect(rss).not.toContain("evidence_refs");
    expect(rss).not.toContain("cews_inputs");
  });

  it("fails closed when an item boundary drifts", () => {
    const unsafe = structuredClone(feed);
    unsafe.items[0].boundaries.trading_instruction = true as never;
    expect(() => renderPublicEarlyWarningRss(unsafe)).toThrow(/safety boundary mismatch/);
  });

  it("rejects a different public feed schema", () => {
    const drift = structuredClone(feed);
    drift.feed_schema_version = "unknown";
    expect(() => renderPublicEarlyWarningRss(drift)).toThrow(/schema mismatch/);
  });
});
