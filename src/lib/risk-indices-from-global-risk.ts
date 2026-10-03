import type { GlobalRisk, RiskDomainKey } from "./global-risk.types";
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
  sourceCategory: RiskDomainKey;
}> = [
  { key: "geopolitics", name: "Geopolitical Risk Index", sourceCategory: "geopolitics" },
  { key: "macro", name: "Macroeconomic Risk Index", sourceCategory: "macro" },
  { key: "critical_minerals", name: "Critical Minerals Risk Index", sourceCategory: "rare_earth" },
];

function ageHours(value: string, now = Date.now()): number | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (now - parsed) / HOUR_MS);
}

/**
 * Projects the three verified domain readings carried by the canonical B2
 * GlobalRisk continuity package into the public three-index contract. The
 * category histories are assembled from persisted category_breakdown values on
 * same-methodology verified snapshots; no blended-GRI history or interpolation
 * is substituted for missing domain data.
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
    const domain = risk.domainIndices?.[spec.sourceCategory] ?? null;
    const driver = driverByCategory.get(spec.sourceCategory);

    if (!domain) {
      return {
        key: spec.key,
        name: spec.name,
        sourceCategory: spec.sourceCategory,
        status: "unavailable",
        readingStatus,
        readingSnapshotId: null,
        readingAsOf: null,
        readingAgeHours: null,
        score: null,
        rawScore: null,
        previousScore: null,
        changePoints: null,
        confidence: null,
        eventCount: 0,
        sourceCount: 0,
        independentStoryCount: 0,
        series: {
          "24H": { timeframe: "24H", buckets: null, low: null, high: null },
          "7D": { timeframe: "7D", buckets: null, low: null, high: null },
          "30D": { timeframe: "30D", buckets: null, low: null, high: null },
        },
        topEvent: driver?.topEvent ?? null,
      };
    }

    return {
      key: spec.key,
      name: spec.name,
      sourceCategory: spec.sourceCategory,
      status: "available",
      readingStatus,
      readingSnapshotId: risk.snapshotId,
      readingAsOf: risk.snapshotAsOf,
      readingAgeHours: snapshotAgeHours,
      score: domain.score,
      rawScore: domain.rawScore,
      previousScore: domain.previousScore,
      changePoints: domain.changePoints,
      confidence: domain.confidence,
      eventCount: domain.eventCount,
      sourceCount: domain.sourceCount,
      independentStoryCount: domain.independentStoryCount,
      series: domain.series,
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
