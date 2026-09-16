import { describe, expect, it } from "vitest";

import {
  computeEarlyWarningProofMetrics,
  computeResolvedAlertLedgerMetrics,
  evaluateProofPublicationReadiness,
} from "./early-warning-proof-metrics";

const base = {
  country_iso3: "IND",
  event_family: "political_instability",
};

describe("Early Warning proof metrics", () => {
  it("computes TP/FP/FN/TN, precision, recall and lead time from a labeled replay universe", () => {
    const metrics = computeEarlyWarningProofMetrics([
      {
        sample_id: "tp-1",
        ...base,
        alert_issued: true,
        alert_status: "WARNING",
        detected_at_utc: "2026-09-16T08:00:00Z",
        outcome: "MATERIAL_EVENT",
        outcome_observed_at_utc: "2026-09-16T10:00:00Z",
      },
      {
        sample_id: "tp-2",
        country_iso3: "JPN",
        event_family: "monetary_policy",
        alert_issued: true,
        alert_status: "CRITICAL",
        detected_at_utc: "2026-09-16T09:00:00Z",
        outcome: "MATERIAL_EVENT",
        outcome_observed_at_utc: "2026-09-16T10:00:00Z",
      },
      {
        sample_id: "fp-1",
        ...base,
        alert_issued: true,
        alert_status: "WARNING",
        detected_at_utc: "2026-09-16T08:00:00Z",
        outcome: "NO_MATERIAL_EVENT",
      },
      {
        sample_id: "fn-1",
        country_iso3: "USA",
        event_family: "sanctions",
        alert_issued: false,
        outcome: "MATERIAL_EVENT",
        outcome_observed_at_utc: "2026-09-16T12:00:00Z",
      },
      {
        sample_id: "tn-1",
        country_iso3: "GBR",
        event_family: "banking_liquidity",
        alert_issued: false,
        outcome: "NO_MATERIAL_EVENT",
      },
      {
        sample_id: "invalid-1",
        country_iso3: "FRA",
        event_family: "other",
        alert_issued: false,
        outcome: "INVALIDATED",
      },
    ]);

    expect(metrics.resolved_sample_count).toBe(5);
    expect(metrics.invalidated_sample_count).toBe(1);
    expect(metrics.alert_sample_count).toBe(3);
    expect(metrics.no_alert_sample_count).toBe(2);
    expect(metrics.confusion_matrix).toEqual({
      true_positive: 2,
      false_positive: 1,
      false_negative: 1,
      true_negative: 1,
    });
    expect(metrics.precision).toBeCloseTo(2 / 3, 6);
    expect(metrics.recall).toBeCloseTo(2 / 3, 6);
    expect(metrics.false_alert_share).toBeCloseTo(1 / 3, 6);
    expect(metrics.false_positive_rate).toBe(0.5);
    expect(metrics.lead_time_seconds.median).toBe(5400);
    expect(metrics.country_count).toBe(4);
  });

  it("rejects duplicate samples and impossible material-event time order", () => {
    const duplicate = {
      sample_id: "same",
      ...base,
      alert_issued: false,
      outcome: "NO_MATERIAL_EVENT" as const,
    };
    expect(() => computeEarlyWarningProofMetrics([duplicate, duplicate])).toThrow(/duplicate sample_id/);

    expect(() =>
      computeEarlyWarningProofMetrics([
        {
          sample_id: "bad-time",
          ...base,
          alert_issued: true,
          alert_status: "WARNING",
          detected_at_utc: "2026-09-16T12:00:00Z",
          outcome: "MATERIAL_EVENT",
          outcome_observed_at_utc: "2026-09-16T11:00:00Z",
        },
      ]),
    ).toThrow(/cannot precede detection/);
  });

  it("blocks public proof claims when calibration or sampling-universe evidence is missing", () => {
    const result = evaluateProofPublicationReadiness({
      methodology_calibrated: false,
      material_event_universe_complete: false,
      control_period_sampling_documented: false,
      minimum_resolved_samples: 2,
      minimum_material_events: 1,
      minimum_countries: 1,
      samples: [
        {
          sample_id: "tp",
          ...base,
          alert_issued: true,
          alert_status: "WARNING",
          detected_at_utc: "2026-09-16T08:00:00Z",
          outcome: "MATERIAL_EVENT",
          outcome_observed_at_utc: "2026-09-16T10:00:00Z",
        },
        {
          sample_id: "fp",
          ...base,
          alert_issued: true,
          alert_status: "WARNING",
          detected_at_utc: "2026-09-16T08:00:00Z",
          outcome: "NO_MATERIAL_EVENT",
        },
      ],
    });

    expect(result.publishable).toBe(false);
    expect(result.reasons).toContain("methodology_not_calibrated");
    expect(result.reasons).toContain("material_event_universe_not_complete");
    expect(result.reasons).toContain("control_period_sampling_not_documented");
    expect(result.reasons).toContain("no_alert_samples_missing");
    expect(result.reasons).toContain("control_period_universe_not_demonstrated");
  });

  it("can become proof-publishable with calibrated methodology and documented complete sampling", () => {
    const result = evaluateProofPublicationReadiness({
      methodology_calibrated: true,
      material_event_universe_complete: true,
      control_period_sampling_documented: true,
      minimum_resolved_samples: 4,
      minimum_material_events: 2,
      minimum_countries: 2,
      samples: [
        {
          sample_id: "tp",
          country_iso3: "IND",
          event_family: "conflict",
          alert_issued: true,
          alert_status: "WARNING",
          detected_at_utc: "2026-09-16T08:00:00Z",
          outcome: "MATERIAL_EVENT",
          outcome_observed_at_utc: "2026-09-16T10:00:00Z",
        },
        {
          sample_id: "fn",
          country_iso3: "JPN",
          event_family: "monetary_policy",
          alert_issued: false,
          outcome: "MATERIAL_EVENT",
          outcome_observed_at_utc: "2026-09-16T10:00:00Z",
        },
        {
          sample_id: "fp",
          country_iso3: "IND",
          event_family: "conflict",
          alert_issued: true,
          alert_status: "WARNING",
          detected_at_utc: "2026-09-16T08:00:00Z",
          outcome: "NO_MATERIAL_EVENT",
        },
        {
          sample_id: "tn",
          country_iso3: "JPN",
          event_family: "monetary_policy",
          alert_issued: false,
          outcome: "NO_MATERIAL_EVENT",
        },
      ],
    });

    expect(result.publishable).toBe(true);
    expect(result.reasons).toEqual(["eligible"]);
    expect(result.universe_assertions).toEqual({
      material_event_universe_complete: true,
      control_period_sampling_documented: true,
    });
  });

  it("does not require an observed false negative when the material-event universe is independently complete", () => {
    const result = evaluateProofPublicationReadiness({
      methodology_calibrated: true,
      material_event_universe_complete: true,
      control_period_sampling_documented: true,
      minimum_resolved_samples: 2,
      minimum_material_events: 1,
      minimum_countries: 2,
      samples: [
        {
          sample_id: "tp-perfect",
          country_iso3: "IND",
          event_family: "conflict",
          alert_issued: true,
          alert_status: "WARNING",
          detected_at_utc: "2026-09-16T08:00:00Z",
          outcome: "MATERIAL_EVENT",
          outcome_observed_at_utc: "2026-09-16T10:00:00Z",
        },
        {
          sample_id: "tn-control",
          country_iso3: "JPN",
          event_family: "monetary_policy",
          alert_issued: false,
          outcome: "NO_MATERIAL_EVENT",
        },
      ],
    });

    expect(result.metrics.confusion_matrix.false_negative).toBe(0);
    expect(result.metrics.recall).toBe(1);
    expect(result.publishable).toBe(true);
  });

  it("keeps ledger-only metrics explicitly unable to claim recall", () => {
    const result = computeResolvedAlertLedgerMetrics([
      {
        country_iso3: "IND",
        status: "WARNING",
        detected_at_utc: "2026-09-16T08:00:00Z",
        outcome_status: "MATERIAL_EVENT_CONFIRMED",
        outcome_observed_at_utc: "2026-09-16T10:00:00Z",
        lead_time_seconds: 7200,
      },
      {
        country_iso3: "JPN",
        status: "WARNING",
        detected_at_utc: "2026-09-16T08:00:00Z",
        outcome_status: "NO_MATERIAL_EVENT",
      },
    ]);

    expect(result.scope).toBe("RESOLVED_ALERTS_ONLY_NOT_RECALL");
    expect(result.confirmation_share).toBe(0.5);
    expect(result.false_alert_share).toBe(0.5);
    expect(result.recall).toBeNull();
    expect(result.recall_reason).toMatch(/independently enumerated material events/);
  });
});
