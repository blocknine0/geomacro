export const EARLY_WARNING_PROOF_VERSION = "early-warning-proof-v1" as const;

export type ReplayOutcome = "MATERIAL_EVENT" | "NO_MATERIAL_EVENT" | "INVALIDATED";

export type ReplaySample = {
  sample_id: string;
  country_iso3: string;
  event_family: string;
  alert_issued: boolean;
  alert_status?: "WARNING" | "CRITICAL" | null;
  detected_at_utc?: string | null;
  outcome: ReplayOutcome;
  outcome_observed_at_utc?: string | null;
};

export type ProofReadinessInput = {
  methodology_calibrated: boolean;
  material_event_universe_complete: boolean;
  control_period_sampling_documented: boolean;
  samples: ReplaySample[];
  minimum_resolved_samples?: number;
  minimum_material_events?: number;
  minimum_countries?: number;
};

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function round6(value: number | null) {
  return value === null ? null : Math.round(value * 1_000_000) / 1_000_000;
}

function parseIso(value: string | null | undefined, field: string) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) throw new Error(`${field} must be a valid timestamp`);
  return ms;
}

function assertSample(sample: ReplaySample) {
  if (!sample.sample_id?.trim()) throw new Error("sample_id is required");
  if (!/^[A-Z]{3}$/.test(sample.country_iso3)) {
    throw new Error(`country_iso3 must be ISO3 uppercase text: ${sample.sample_id}`);
  }
  if (!sample.event_family?.trim()) throw new Error(`event_family is required: ${sample.sample_id}`);

  const detectedMs = parseIso(sample.detected_at_utc, "detected_at_utc");
  const outcomeMs = parseIso(sample.outcome_observed_at_utc, "outcome_observed_at_utc");

  if (sample.alert_issued && detectedMs === null) {
    throw new Error(`alert_issued sample requires detected_at_utc: ${sample.sample_id}`);
  }
  if (!sample.alert_issued && sample.alert_status) {
    throw new Error(`non-alert sample cannot carry alert_status: ${sample.sample_id}`);
  }
  if (sample.alert_issued && !sample.alert_status) {
    throw new Error(`alert_issued sample requires WARNING/CRITICAL status: ${sample.sample_id}`);
  }
  if (sample.outcome === "MATERIAL_EVENT" && outcomeMs === null) {
    throw new Error(`material event requires outcome_observed_at_utc: ${sample.sample_id}`);
  }
  if (
    detectedMs !== null &&
    outcomeMs !== null &&
    sample.outcome === "MATERIAL_EVENT" &&
    outcomeMs < detectedMs
  ) {
    throw new Error(`material outcome cannot precede detection in proof sample: ${sample.sample_id}`);
  }
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = (ordered.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  const weight = index - lower;
  return ordered[lower] * (1 - weight) + ordered[upper] * weight;
}

export function computeEarlyWarningProofMetrics(samples: ReplaySample[]) {
  if (!Array.isArray(samples)) throw new Error("samples must be an array");
  const seen = new Set<string>();
  for (const sample of samples) {
    assertSample(sample);
    if (seen.has(sample.sample_id)) throw new Error(`duplicate sample_id: ${sample.sample_id}`);
    seen.add(sample.sample_id);
  }

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  let invalidated = 0;
  const leadSeconds: number[] = [];
  const resolvedCountries = new Set<string>();

  for (const sample of samples) {
    if (sample.outcome === "INVALIDATED") {
      invalidated++;
      continue;
    }

    resolvedCountries.add(sample.country_iso3);
    const material = sample.outcome === "MATERIAL_EVENT";

    if (sample.alert_issued && material) {
      truePositive++;
      const detectedMs = parseIso(sample.detected_at_utc, "detected_at_utc")!;
      const outcomeMs = parseIso(sample.outcome_observed_at_utc, "outcome_observed_at_utc")!;
      leadSeconds.push(Math.round((outcomeMs - detectedMs) / 1000));
    } else if (sample.alert_issued && !material) {
      falsePositive++;
    } else if (!sample.alert_issued && material) {
      falseNegative++;
    } else {
      trueNegative++;
    }
  }

  const resolved = truePositive + falsePositive + falseNegative + trueNegative;
  const materialEvents = truePositive + falseNegative;
  const alertsIssued = truePositive + falsePositive;
  const noAlertSamples = falseNegative + trueNegative;

  return {
    proof_version: EARLY_WARNING_PROOF_VERSION,
    sample_count: samples.length,
    resolved_sample_count: resolved,
    invalidated_sample_count: invalidated,
    country_count: resolvedCountries.size,
    alert_sample_count: alertsIssued,
    no_alert_sample_count: noAlertSamples,
    confusion_matrix: {
      true_positive: truePositive,
      false_positive: falsePositive,
      false_negative: falseNegative,
      true_negative: trueNegative,
    },
    material_event_count: materialEvents,
    alerts_issued_count: alertsIssued,
    precision: round6(ratio(truePositive, alertsIssued)),
    recall: round6(ratio(truePositive, materialEvents)),
    false_positive_rate: round6(ratio(falsePositive, falsePositive + trueNegative)),
    false_alert_share: round6(ratio(falsePositive, alertsIssued)),
    specificity: round6(ratio(trueNegative, trueNegative + falsePositive)),
    lead_time_seconds: {
      confirmed_alert_count: leadSeconds.length,
      median: median(leadSeconds),
      p25: percentile(leadSeconds, 0.25),
      p75: percentile(leadSeconds, 0.75),
      minimum: leadSeconds.length ? Math.min(...leadSeconds) : null,
      maximum: leadSeconds.length ? Math.max(...leadSeconds) : null,
    },
  };
}

export function evaluateProofPublicationReadiness(input: ProofReadinessInput) {
  const minimumResolved = input.minimum_resolved_samples ?? 100;
  const minimumMaterial = input.minimum_material_events ?? 30;
  const minimumCountries = input.minimum_countries ?? 5;

  if (![minimumResolved, minimumMaterial, minimumCountries].every(Number.isInteger)) {
    throw new Error("proof readiness minimums must be integers");
  }
  if (minimumResolved <= 0 || minimumMaterial <= 0 || minimumCountries <= 0) {
    throw new Error("proof readiness minimums must be positive");
  }
  if (typeof input.methodology_calibrated !== "boolean") {
    throw new Error("methodology_calibrated must be boolean");
  }
  if (typeof input.material_event_universe_complete !== "boolean") {
    throw new Error("material_event_universe_complete must be boolean");
  }
  if (typeof input.control_period_sampling_documented !== "boolean") {
    throw new Error("control_period_sampling_documented must be boolean");
  }

  const metrics = computeEarlyWarningProofMetrics(input.samples);
  const reasons: string[] = [];

  if (!input.methodology_calibrated) reasons.push("methodology_not_calibrated");
  if (!input.material_event_universe_complete) reasons.push("material_event_universe_not_complete");
  if (!input.control_period_sampling_documented) reasons.push("control_period_sampling_not_documented");
  if (metrics.resolved_sample_count < minimumResolved) reasons.push("insufficient_resolved_samples");
  if (metrics.material_event_count < minimumMaterial) reasons.push("insufficient_material_events");
  if (metrics.country_count < minimumCountries) reasons.push("insufficient_country_coverage");
  if (metrics.no_alert_sample_count === 0) reasons.push("no_alert_samples_missing");
  if (metrics.confusion_matrix.true_negative === 0) {
    reasons.push("control_period_universe_not_demonstrated");
  }

  return {
    publishable: reasons.length === 0,
    reasons: reasons.length ? reasons : ["eligible"],
    thresholds: {
      minimum_resolved_samples: minimumResolved,
      minimum_material_events: minimumMaterial,
      minimum_countries: minimumCountries,
    },
    universe_assertions: {
      material_event_universe_complete: input.material_event_universe_complete,
      control_period_sampling_documented: input.control_period_sampling_documented,
    },
    metrics,
  };
}

export function computeResolvedAlertLedgerMetrics(
  alerts: Array<{
    country_iso3: string;
    status: string;
    detected_at_utc: string;
    outcome_status: "PENDING" | "MATERIAL_EVENT_CONFIRMED" | "NO_MATERIAL_EVENT" | "INVALIDATED";
    outcome_observed_at_utc?: string | null;
    lead_time_seconds?: number | null;
  }>,
) {
  const resolved = alerts.filter(
    (row) =>
      row.outcome_status === "MATERIAL_EVENT_CONFIRMED" ||
      row.outcome_status === "NO_MATERIAL_EVENT",
  );
  const confirmed = resolved.filter((row) => row.outcome_status === "MATERIAL_EVENT_CONFIRMED");
  const falseAlerts = resolved.filter((row) => row.outcome_status === "NO_MATERIAL_EVENT");
  const leads = confirmed
    .map((row) => Number(row.lead_time_seconds))
    .filter((value) => Number.isFinite(value) && value >= 0);

  return {
    scope: "RESOLVED_ALERTS_ONLY_NOT_RECALL",
    resolved_alert_count: resolved.length,
    confirmed_material_event_count: confirmed.length,
    no_material_event_count: falseAlerts.length,
    confirmation_share: round6(ratio(confirmed.length, resolved.length)),
    false_alert_share: round6(ratio(falseAlerts.length, resolved.length)),
    median_confirmed_lead_time_seconds: median(leads),
    recall: null,
    recall_reason:
      "Recall requires a labeled opportunity universe that includes independently enumerated material events, including any missed events.",
  };
}
