import { GRI_METHOD_VERSION } from "./gri-current-contract";
import type {
  Bucket,
  GlobalRisk,
  RiskDomainKey,
  RiskDomainReading,
  Timeframe,
  TimeframeSeries,
} from "./global-risk.types";

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const REQUIRED_HISTORY_FRAMES: Timeframe[] = ["7D", "30D"];
const ALL_FRAMES: Timeframe[] = ["24H", "7D", "30D"];
const DOMAIN_KEYS: RiskDomainKey[] = ["geopolitics", "macro", "rare_earth"];

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

function validateDomainReading(
  domain: RiskDomainKey,
  reading: RiskDomainReading,
  snapshotMs: number,
): GlobalRiskContinuityResult {
  if (
    !finiteInRange(reading.score, 0, 100) ||
    !finiteInRange(reading.rawScore, 0, 100) ||
    !Number.isInteger(reading.eventCount) ||
    reading.eventCount < 1 ||
    !Number.isInteger(reading.sourceCount) ||
    reading.sourceCount < 1 ||
    !Number.isInteger(reading.independentStoryCount) ||
    reading.independentStoryCount < 1 ||
    reading.independentStoryCount > reading.eventCount
  ) {
    return { ok: false, code: `RISK_DOMAIN_${domain.toUpperCase()}_READING_INVALID` };
  }
  if (
    reading.confidence !== null &&
    !finiteInRange(reading.confidence, 0, 100)
  ) {
    return { ok: false, code: `RISK_DOMAIN_${domain.toUpperCase()}_CONFIDENCE_INVALID` };
  }
  if (
    reading.previousScore !== null &&
    !finiteInRange(reading.previousScore, 0, 100)
  ) {
    return { ok: false, code: `RISK_DOMAIN_${domain.toUpperCase()}_PREVIOUS_INVALID` };
  }
  if (
    reading.changePoints !== null &&
    !Number.isFinite(reading.changePoints)
  ) {
    return { ok: false, code: `RISK_DOMAIN_${domain.toUpperCase()}_CHANGE_INVALID` };
  }

  for (const key of ALL_FRAMES) {
    const result = validateSeries(key, reading.series?.[key], snapshotMs);
    if (!result.ok) {
      return {
        ok: false,
        code: `RISK_DOMAIN_${domain.toUpperCase()}_${result.code}`,
      };
    }
  }
  const sevenDay = reading.series["7D"].buckets;
  const thirtyDay = reading.series["30D"].buckets;
  if (!sevenDay || sevenDay.length < 2 || !thirtyDay || thirtyDay.length < sevenDay.length) {
    return { ok: false, code: `RISK_DOMAIN_${domain.toUpperCase()}_HISTORY_INSUFFICIENT` };
  }
  return { ok: true };
}

/**
 * Fail-closed validator for the public Global Risk continuity package.
 *
 * This verifies both the legacy combined same-methodology history and the
 * independently displayable domain histories projected from persisted
 * category_breakdown values. It prevents a projection-only refactor from
 * silently replacing verified history with current-only scores and never
 * creates or interpolates missing history.
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

  if (!risk.domainIndices || typeof risk.domainIndices !== "object") {
    return { ok: false, code: "RISK_DOMAIN_HISTORY_CONTAINER_MISSING" };
  }

  for (const domain of DOMAIN_KEYS) {
    const reading = risk.domainIndices[domain];
    const hasCurrentDriver = risk.drivers.some((driver) => driver.category === domain);
    if (!reading) {
      if (hasCurrentDriver) {
        return { ok: false, code: `RISK_DOMAIN_${domain.toUpperCase()}_HISTORY_MISSING` };
      }
      continue;
    }
    const result = validateDomainReading(domain, reading, snapshotMs);
    if (!result.ok) return result;
  }

  return { ok: true };
}
