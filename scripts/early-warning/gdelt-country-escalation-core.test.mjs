import { describe, expect, it } from "vitest";

import { buildGdeltCountryEscalationFeatures } from "./gdelt-country-escalation-core.mjs";

function observation({
  country = "IND",
  observedAt,
  goldstein,
  tone = -2,
  mentions = 10,
  sources = 3,
  articles = 4,
  id,
}) {
  return {
    source_id: "gdelt_v2_events",
    source_record_id: id,
    country_iso3: country,
    observed_at: observedAt,
    value_numeric: goldstein,
    provenance: {
      avg_tone: tone,
      num_mentions: mentions,
      num_sources: sources,
      num_articles: articles,
    },
  };
}

describe("GDELT country escalation features", () => {
  it("builds deterministic current/prior windows without creating a CEWS or public alert", () => {
    const features = buildGdeltCountryEscalationFeatures({
      as_of_utc: "2026-09-16T12:00:00Z",
      observations: [
        observation({
          observedAt: "2026-09-16T11:55:00Z",
          goldstein: -8,
          tone: -5,
          mentions: 30,
          sources: 8,
          articles: 12,
          id: "current-a",
        }),
        observation({
          observedAt: "2026-09-16T11:35:00Z",
          goldstein: -4,
          tone: -3,
          mentions: 20,
          sources: 5,
          articles: 7,
          id: "current-b",
        }),
        observation({
          observedAt: "2026-09-16T10:45:00Z",
          goldstein: -2,
          tone: -1,
          mentions: 4,
          sources: 2,
          articles: 2,
          id: "prior-a",
        }),
      ],
    });

    expect(features).toHaveLength(1);
    const ind = features[0];
    expect(ind.country_iso3).toBe("IND");
    expect(ind.methodology).toBe("gdelt-country-escalation-features-v1");
    expect(ind.research_only).toBe(true);
    expect(ind.commercial_signal_activation).toBe(false);
    expect(ind.public_alert_activation).toBe(false);
    expect(ind).not.toHaveProperty("cews_score");
    expect(ind).not.toHaveProperty("status");

    expect(ind.windows.current_15m.event_count).toBe(1);
    expect(ind.windows.current_60m.event_count).toBe(2);
    expect(ind.windows.current_60m.negative_intensity_sum).toBe(12);
    expect(ind.windows.current_60m.severe_negative_event_count).toBe(1);
    expect(ind.windows.current_60m.mentions_sum).toBe(50);
    expect(ind.windows.current_60m.sources_sum).toBe(13);
    expect(ind.windows.prior_60m.event_count).toBe(1);
    expect(ind.windows.prior_60m.negative_intensity_sum).toBe(2);
    expect(ind.deltas.event_count_delta_60m).toBe(1);
    expect(ind.deltas.event_count_ratio_60m).toBe(2);
    expect(ind.deltas.negative_intensity_delta_60m).toBe(10);
    expect(ind.deltas.negative_intensity_ratio_60m).toBe(6);
    expect(ind.freshness_seconds).toBe(300);
  });

  it("filters malformed, future and older-than-two-hour observations", () => {
    const features = buildGdeltCountryEscalationFeatures({
      as_of_utc: "2026-09-16T12:00:00Z",
      observations: [
        observation({ observedAt: "2026-09-16T11:50:00Z", goldstein: -3, id: "valid" }),
        observation({ observedAt: "2026-09-16T12:01:00Z", goldstein: -9, id: "future" }),
        observation({ observedAt: "2026-09-16T09:59:59Z", goldstein: -9, id: "old" }),
        { country_iso3: "XX", observed_at: "2026-09-16T11:50:00Z", value_numeric: -5 },
        { country_iso3: "USA", observed_at: "invalid", value_numeric: -5 },
        { country_iso3: "USA", observed_at: "2026-09-16T11:50:00Z", value_numeric: -99 },
      ],
    });

    expect(features).toHaveLength(1);
    expect(features[0].country_iso3).toBe("IND");
    expect(features[0].windows.current_60m.event_count).toBe(1);
  });

  it("returns null growth ratios when the prior window is zero but current activity exists", () => {
    const [row] = buildGdeltCountryEscalationFeatures({
      as_of_utc: "2026-09-16T12:00:00Z",
      observations: [
        observation({ observedAt: "2026-09-16T11:58:00Z", goldstein: -7, id: "new" }),
      ],
    });

    expect(row.deltas.event_count_ratio_60m).toBeNull();
    expect(row.deltas.negative_intensity_ratio_60m).toBeNull();
  });

  it("sorts countries by escalation delta, not by arbitrary input order", () => {
    const features = buildGdeltCountryEscalationFeatures({
      as_of_utc: "2026-09-16T12:00:00Z",
      observations: [
        observation({ country: "USA", observedAt: "2026-09-16T11:55:00Z", goldstein: -2, id: "usa" }),
        observation({ country: "JPN", observedAt: "2026-09-16T11:55:00Z", goldstein: -8, id: "jpn" }),
      ],
    });

    expect(features.map((row) => row.country_iso3)).toEqual(["JPN", "USA"]);
  });
});
