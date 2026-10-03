import { GRI_METHOD_VERSION } from "./gri-current-contract";
import type { Bucket, GlobalRisk, Timeframe, TimeframeSeries } from "./global-risk.types";

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const REQUIRED_HISTORY_FRAMES: Timeframe[] = ["7D", "30D"];
const ALL_FRAMES: Timeframe[] = ["24H", "7D", "30D"];

export type GlobalRiskContinuityResult =
  | { ok: true }
  | { ok: false; code: string };

function finiteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validBucket(bucket: Bucket): boolean {
  return (
    Number.isFinite(bucket.t) &&
    finiteInRange(bucket.avg, 0, 100) &&
    Number.isInteger(bucket.count) &&
    bucket.count > 0
  );
}

function validateSeries(
  key: Timeframe,
  series: TimeframeSeries | undefined,
  snapshotMs: number,
): GlobalRiskContinuityResult {
  if (!series || series.timeframe !== key) {
    return { ok: false, code: `RISK_HISTORY_${key}_CONTRACT_INVALID` };
  }

  if (series.buckets === null) {
    if (REQUIRED_HISTORY_FRAMES.includes(key)) {
      return { ok: false, code: `RISK_HISTORY_${key}_MISSING` };
    }
    if (series.low !== null || series.high !== null) {
      return { ok: false, code: `RISK_HISTORY_${key}_NULL_RANGE_INVALID` };
    }
    return { ok: true };
  }

  if (series.buckets.length === 0 || series.buckets.some((bucket) => !validBucket(bucket))) {
    return { ok: false, code: `RISK_HISTORY_${key}_BUCKET_INVALID` };
  }

  for (let index = 1; index < series.buckets.length; index += 1) {
    if (series.buckets[index].t <= series.buckets[index - 1].t) {
      return { ok: false, code: `RISK_HISTORY_${key}_ORDER_INVALID` };
    }
  }

  const last = series.buckets.at(-1);
  if (!last || Math.abs(last.t - snapshotMs) > 1_000) {
    return { ok: false, code: `RISK_HISTORY_${key}_LATEST_MISMATCH` };
  }

  const scores = series.buckets.map((bucket) => bucket.avg);
  const expectedLow = Math.min(...scores);
  const expectedHigh = Math.max(...scores);
  if (
    !finiteInRange(series.low, 0, 100) ||
    !finiteInRange(series.high, 0, 100) ||
    Math.abs(series.low - expectedLow) > 1e-9 ||
    Math.abs(series.high - expectedHigh) > 1e-9
  ) {
    return { ok: false, code: `RISK_HISTORY_${key}_RANGE_INVALID` };
  }

  return { ok: true };
}

/**
 * Fail-closed validator for the public Global Risk continuity package.
 *
 * This deliberately verifies that the customer-facing object still contains
 * same-methodology historical series. It prevents a future projection-only
 * refactor from silently replacing the historical Global Risk experience with
 * a current-only payload. It never creates or interpolates missing history.
 */
export function validateGlobalRiskContinuity(
  risk: GlobalRisk,
  now = Date.now(),
): GlobalRiskContinuityResult {
  if (risk.methodologyVersion !== GRI_METHOD_VERSION) {
    return { ok: false, code: "RISK_METHODOLOGY_MISMATCH" };
  }
  if (risk.verificationStatus !== "verified") {
    return { ok: false, code: "RISK_VERIFICATION_INVALID" };
  }
  if (!/^[a-f0-9]{64}$/i.test(String(risk.proofHash ?? ""))) {
    return { ok: false, code: "RISK_PROOF_HASH_INVALID" };
  }
  if (!/^[a-f0-9]{64}$/i.test(String(risk.calculationHash ?? ""))) {
    return { ok: false, code: "RISK_CALCULATION_HASH_INVALID" };
  }
  if (!finiteInRange(risk.score, 0, 100) || !finiteInRange(risk.rawScore, 0, 100)) {
    return { ok: false, code: "RISK_SCORE_INVALID" };
  }

  const snapshotMs = Date.parse(risk.snapshotAsOf);
  if (!Number.isFinite(snapshotMs) || snapshotMs > now + FUTURE_TOLERANCE_MS) {
    return { ok: false, code: "RISK_SNAPSHOT_TIME_INVALID" };
  }

  if (!risk.series || typeof risk.series !== "object") {
    return { ok: false, code: "RISK_HISTORY_CONTAINER_MISSING" };
  }

  for (const key of ALL_FRAMES) {
    const result = validateSeries(key, risk.series[key], snapshotMs);
    if (!result.ok) return result;
  }

  const sevenDay = risk.series["7D"].buckets;
  const thirtyDay = risk.series["30D"].buckets;
  if (!sevenDay || sevenDay.length < 2 || !thirtyDay || thirtyDay.length < sevenDay.length) {
    return { ok: false, code: "RISK_HISTORY_CONTINUITY_INSUFFICIENT" };
  }

  return { ok: true };
}
