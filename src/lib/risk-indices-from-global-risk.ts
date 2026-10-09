import { GRI_CURRENT_READING_WINDOW_HOURS } from "./gri-current-contract";
import type { GlobalRisk, RiskDomainKey } from "./global-risk.types";
import {
  PUBLIC_RISK_INDICES_CONTRACT_VERSION,
  type PublicRiskIndex,
  type PublicRiskIndices,
  type PublicRiskIndexKey,
} from "./risk-indices.types";

const HOUR_MS = 60 * 60 * 1000;

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
 * Projects the three canonical domain readings into the public three-index
 * contract. Each domain carries its own last verified timestamp, so a new
 * combined snapshot cannot erase a domain merely because that domain had no
 * newer qualifying evidence. A newer verified domain reading replaces the old
 * one; otherwise the previous verified reading remains visible.
 */
export function riskIndicesFromGlobalRisk(
  risk: GlobalRisk,
  now = Date.now(),
): PublicRiskIndices {
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
        readingStatus: "last_verified",
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

    const readingAge = ageHours(domain.readingAsOf, now);
    const readingStatus =
      domain.readingStatus === "current" &&
      readingAge !== null &&
      readingAge <= GRI_CURRENT_READING_WINDOW_HOURS
        ? "current"
        : "last_verified";

    return {
      key: spec.key,
      name: spec.name,
      sourceCategory: spec.sourceCategory,
      status: "available",
      readingStatus,
      readingSnapshotId: domain.readingSnapshotId,
      readingAsOf: domain.readingAsOf,
      readingAgeHours: readingAge,
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
