import type { Timeframe, TimeframeSeries } from "./global-risk.types";

export const PUBLIC_RISK_INDICES_CONTRACT_VERSION = "risk-indices-v1.0.0" as const;

export type PublicRiskIndexKey =
  | "geopolitics"
  | "macro"
  | "critical_minerals";

export type PublicRiskIndexStatus = "available" | "unavailable";

export type PublicRiskIndex = {
  key: PublicRiskIndexKey;
  name: string;
  sourceCategory: "geopolitics" | "macro" | "rare_earth";
  status: PublicRiskIndexStatus;
  score: number | null;
  rawScore: number | null;
  previousScore: number | null;
  changePoints: number | null;
  confidence: number | null;
  eventCount: number;
  sourceCount: number;
  independentStoryCount: number;
  series: Record<Timeframe, TimeframeSeries>;
  topEvent: {
    title: string;
    summary: string | null;
    severity: number | null;
  } | null;
};

export type PublicRiskIndices = {
  contractVersion: typeof PUBLIC_RISK_INDICES_CONTRACT_VERSION;
  parentMethodologyVersion: string;
  proofVersion: string;
  proofScope: "verified-category-projection";
  snapshotId: string;
  snapshotAsOf: string;
  verificationStatus: "verified";
  proofHash: string;
  evidenceHash: string;
  calculationHash: string;
  dispositionHash: string;
  inputHash: string;
  methodologyHash: string;
  changeHash: string | null;
  candidateEventCount: number;
  reconciliationResidual: number | null;
  changeResidual: number | null;
  indices: PublicRiskIndex[];
};
