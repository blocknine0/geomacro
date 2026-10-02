import type { GlobalRisk, Timeframe, TimeframeSeries } from "./global-risk.types";
import {
  PUBLIC_RISK_INDICES_CONTRACT_VERSION,
  type PublicRiskIndex,
  type PublicRiskIndices,
  type PublicRiskIndexKey,
} from "./risk-indices.types";

const HOUR_MS = 60 * 60 * 1000;
const CURRENT_READING_MAX_AGE_HOURS = 6;

const SPECS: ReadonlyArray<{
  key: PublicRiskIndexKey;
  name: string;
  sourceCategory: "geopolitics" | "macro" | "rare_earth";
}> = [
  { key: "geopolitics", name: "Geopolitical Risk Index", sourceCategory: "geopolitics" },
  { key: "macro", name: "Macroeconomic Risk Index", sourceCategory: "macro" },
  { key: "critical_minerals", name: "Critical Minerals Risk Index", sourceCategory: "rare_earth" },
];

function emptySeries(timeframe: Timeframe): TimeframeSeries {
  return { timeframe, buckets: null, low: null, high: null };
}

function ageHours(value: string, now = Date.now()): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (now - parsed) / HOUR_MS);
}

/**
 * Projects the already-verified category scores carried by the canonical B2
 * GlobalRisk package into the public three-index contract.
 *
 * The archived GlobalRisk package does not contain per-category historical
 * series or score-to-score deltas, so this adapter deliberately leaves those
 * fields unavailable rather than reusing the old combined-GRI contribution
 * delta or fabricating history. This makes the public website available from
 * B2 without weakening the proof boundary.
 */
export function riskIndicesFromGlobalRisk(
  risk: GlobalRisk,
  now = Date.now(),
): PublicRiskIndices {
  const snapshotAgeHours = ageHours(risk.snapshotAsOf, now);
  const readingStatus =
    snapshotAgeHours !== null && snapshotAgeHours <= CURRENT_READING_MAX_AGE_HOURS
      ? "current"
      : "last_verified";

  const driverByCategory = new Map(
    risk.drivers.map((driver) => [driver.category, driver] as const),
  );

  const indices: PublicRiskIndex[] = SPECS.map((spec) => {
    const driver = driverByCategory.get(spec.sourceCategory);
    const score = driver && Number.isFinite(driver.score) ? driver.score : null;

    return {
      key: spec.key,
      name: spec.name,
      sourceCategory: spec.sourceCategory,
      status: score === null ? "unavailable" : "available",
      readingStatus,
      readingSnapshotId: score === null ? null : risk.snapshotId,
      readingAsOf: score === null ? null : risk.snapshotAsOf,
      readingAgeHours: score === null ? null : snapshotAgeHours,
      score: score === null ? null : Math.round(score),
      rawScore: score,
      previousScore: null,
      changePoints: null,
      confidence: null,
      eventCount: 0,
      sourceCount: 0,
      independentStoryCount: 0,
      series: {
        "24H": emptySeries("24H"),
        "7D": emptySeries("7D"),
        "30D": emptySeries("30D"),
      },
      topEvent: driver?.topEvent ?? null,
    };
  });

  return {
    contractVersion: PUBLIC_RISK_INDICES_CONTRACT_VERSION,
    parentMethodologyVersion: risk.methodologyVersion,
    proofVersion: String(risk.proofVersion ?? ""),
    proofScope: "verified-category-projection",
    snapshotId: risk.snapshotId,
    snapshotAsOf: risk.snapshotAsOf,
    verificationStatus: "verified",
    proofHash: String(risk.proofHash ?? ""),
    evidenceHash: String(risk.evidenceHash ?? ""),
    calculationHash: risk.calculationHash,
    dispositionHash: risk.dispositionHash,
    inputHash: risk.inputHash,
    methodologyHash: risk.methodologyHash,
    changeHash: risk.changeHash,
    candidateEventCount: risk.candidateEventCount,
    reconciliationResidual: risk.reconciliationResidual,
    changeResidual: risk.changeResidual,
    indices,
  };
}
