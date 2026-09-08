import {
  GRI_HALF_LIFE_HOURS,
  GRI_LOOKBACK_HOURS,
  GRI_METHOD_VERSION,
} from "./gri-current-contract";

export type RiskRow = {
  id: string;
  source_title: string | null;
  summary: string | null;
  category: string | null;
  severity: number | null;
  confidence: number | null;
  delta: number | null;
  source_name: string | null;
  source_domain?: string | null;
  source_url: string | null;
  created_at: string;
  published_at: string | null;
  classification_provider?: string | null;
  classification_model?: string | null;
  classification_version?: string | null;
  classification_prompt_version?: string | null;
  classification_input_hash?: string | null;
  market_created?: boolean | null;
};

export type Bucket = { t: number; avg: number; count: number };
export type Timeframe = "24H" | "7D" | "30D";
export type TimeframeSeries = {
  timeframe: Timeframe;
  buckets: Bucket[] | null;
  low: number | null;
  high: number | null;
};

export type RiskDriver = {
  category: string;
  score: number;
  /** Exact category contribution-point change from stored attribution. */
  change: number | null;
  /** Normalized category weight in the current GRI, 0-1. */
  contribution: number;
  topEvent: {
    title: string;
    summary: string | null;
    severity: number | null;
  } | null;
};

export type GlobalRisk = {
  snapshotId: string;
  score: number;
  rawScore: number;
  previous: number | null;
  previousRaw: number | null;
  low: number | null;
  high: number | null;
  eventCount: number;
  eventCountPrevious: number | null;
  sourceCount: number | null;
  independentStoryCount: number;
  storyCorrelationVersion: string;
  storyCorrelationPromptVersion: string;
  coverage: number;
  weightedConfidence: number | null;
  methodologyVersion: string;
  auditPersisted: true;
  proofVersion: string | null;
  verificationStatus: string | null;
  proofHash: string | null;
  evidenceHash: string | null;
  calculationHash: string;
  dispositionHash: string;
  candidateEventCount: number;
  inputHash: string;
  methodologyHash: string;
  changeHash: string | null;
  reconciliationResidual: number | null;
  changeResidual: number | null;
  snapshotAsOf: string;
  usedFallbackWindow: false;
  series: Record<Timeframe, TimeframeSeries>;
  drivers: RiskDriver[];
  topDriver: RiskDriver | null;
  recentEvents: RiskRow[];
};

export type RiskStatus = "loading" | "ready" | "updating" | "error";

export const GRI_METHODOLOGY = {
  version: GRI_METHOD_VERSION,
  definition: `GRI ${GRI_METHOD_VERSION} is a deterministic source- and story-capped, confidence- and recency-weighted severity index over the trailing ${GRI_LOOKBACK_HOURS} hours.`,
  weighting: `Event weight = confidence × exponential recency decay (${GRI_HALF_LIFE_HOURS}h half-life). Each source is capped, then articles describing the same underlying development share one story budget based on that story's strongest post-source evidence. Active domains are equally weighted and missing domains are disclosed as coverage, never zero risk.`,
  notProbability: "GRI is an aggregate intelligence signal, not a market probability.",
} as const;
