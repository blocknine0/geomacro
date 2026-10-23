import { describe, expect, it } from "vitest";
import { buildCategoryLiveObservation, readCategoryLiveObservation } from "./category-live-observation.server";
import type { StatelessIntelligenceResult } from "./stateless-public-intelligence.server";

const now = Date.parse("2026-10-13T14:00:00Z");
const signals = [
  {
    id: "origin-evidence-1", category: "macro" as const,
    title: "Geomacro finds macro monetary policy update",
    why_it_matters: "A documented policy release affects funding context, not a predictive price claim.",
    topic: "monetary policy",
    what_changed: "An official policy notice was released with a native publication date.",
    geography: null, development_type: "policy_release",
    published_at: "2026-10-13T11:00:00.000Z", date_precision: "exact" as const,
    observed_release_count: 1 as const, sources_credited: ["Bank of Canada"],
    status: "official_release_observed_unscored" as const,
    same_event_corrob_verified: false as const, severity: null,
  },
];
const base = (category: "geopolitics" | "macro" | "rare_earth" = "macro"): StatelessIntelligenceResult => ({
  schema: "geomacro.website-stateless-intelligence.v1",
  category, checked_at: new Date(now).toISOString(),
  website_release_cutoff: new Date(now - 900_000).toISOString(),
  earliest_original: new Date(now - 30 * 86400_000).toISOString(),
  releases_examined: 1, feed_count: 3, healthy_feed_count: 2,
  current_24h_count: 1, last_7d_count: 1, last_30d_count: 1,
  status: "official_observations_available",
  signals, persistent_storage: false,
  publisher_title_redistributed: false,
  signed_risk_score_generated: false,
  independent_same_event_verification: false,
});

describe("original-release GET view for three fixed category API endpoints", () => {
  it("returns only original-dated, derived-only unscored structured observations", () => {
    const result = buildCategoryLiveObservation("macro-fx", base(), now);
    expect(result.schema_version).toBe("geomacro.category-live-official-observation.v1");
    expect(result.category).toBe("macro-fx");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      topic: "monetary policy",
      published_at: "2026-10-13T11:00:00.000Z",
      same_event_corroborated: false, risk_score: null,
    });
    expect(result.signed_gro_generated).toBe(false);
    expect(result.current_signed_risk_intelligence_verified).toBe(false);
    expect(result.x402_payment_required).toBe(false);
    expect(result.paid_delivery_authorized_by_observations).toBe(false);
    expect(result.raw_publisher_content_delivered).toBe(false);
    expect(result.licensed_source_credits).toEqual(["Bank of Canada"]);
    expect(JSON.stringify(result)).not.toContain("http");
  });

  it("fails closed on cross-category data and rejects mixed-source contamination", () => {
    expect(() => buildCategoryLiveObservation("critical-minerals", base(), now))
      .toThrow("CATEGORY_LIVE_OBSERVATION_MISMATCH");
    const obj = base();
    obj.signals.push({ ...signals[0], category: "rare_earth", id: "cross-lane" });
    const result = buildCategoryLiveObservation("macro-fx", obj, now);
    expect(result.findings).toHaveLength(1);
  });

  it("never rewrites stale source dates, day-only publication or future clocks", () => {
    const obj = base();
    obj.signals = [
      { ...signals[0], id: "too-recent", published_at: "2026-10-13T14:01:00.000Z" },
      { ...signals[0], id: "too-old", published_at: "2026-10-09T11:00:00.000Z" },
    ];
    const result = buildCategoryLiveObservation("macro-fx", obj, now);
    expect(result.findings).toHaveLength(0);
    expect(result.status).toBe("NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H");
    expect(result.latest_original_published_at).toBeNull();
    expect(result.signed_gro_generated).toBe(false);
  });

  it("differentiates source transport outage from genuine no qualifying releases", () => {
    const obj = base("rare_earth");
    obj.signals = []; obj.healthy_feed_count = 0;
    expect(buildCategoryLiveObservation("critical-minerals", obj, now).status)
      .toBe("OFFICIAL_SOURCES_UNAVAILABLE");
  });

  it("takes a bounded injected official reader without x402 or storage", async () => {
    const result = await readCategoryLiveObservation("geopolitics", {
      now,
      reader: async category => ({ ...base(category), signals: [] }),
    });
    expect(result.category).toBe("geopolitics");
    expect(result.status).toBe("NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H");
    expect(result.durable_storage_written).toBe(false);
  });
});
