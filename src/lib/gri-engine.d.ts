export const GRI_METHOD_VERSION: string;
export const GRI_CATEGORIES: readonly string[];
export const GRI_LOOKBACK_HOURS: number;
export const GRI_HALF_LIFE_HOURS: number;
export const GRI_SOURCE_WEIGHT_CAP: number;
export const GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS: number;
export const GRI_METHOD: Readonly<Record<string, unknown>>;

export type GriInputRow = {
  id?: string | number | null;
  category?: string | null;
  severity?: number | null;
  confidence?: number | null;
  created_at?: string | null;
  observed_at?: string | null;
  published_at?: string | null;
  source_name?: string | null;
  source_domain?: string | null;
  source_url?: string | null;
  source_title?: string | null;
  title?: string | null;
  summary?: string | null;
  classification_provider?: string | null;
  classification_model?: string | null;
  classification_version?: string | null;
  classification_prompt_version?: string | null;
  classification_scored_at?: string | null;
  classification_input_hash?: string | null;
};

export type GriContribution = {
  eventId: string;
  category: string;
  sourceKey: string;
  sourceName: string | null;
  sourceDomain: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  summary: string | null;
  severity: number;
  confidence: number;
  observedAt: string;
  publishedAt: string | null;
  ageHours: number;
  confidenceWeight: number;
  decayWeight: number;
  rawWeight: number;
  effectiveEventWeight: number;
  sourceEffectiveWeight: number;
  categoryEffectiveWeight: number;
  normalizedCategoryWeight: number;
  withinCategoryShare: number;
  globalShare: number;
  contributionPoints: number;
  classificationProvider: string | null;
  classificationModel: string | null;
  classificationVersion: string | null;
  classificationPromptVersion: string | null;
  classificationScoredAt: string | null;
  classificationInputHash: string | null;
};

export type GriCategory = {
  category: string;
  baseWeight: number;
  normalizedWeight: number;
  score: number;
  contributionPoints: number;
  confidence: number;
  eventCount: number;
  sourceCount: number;
  effectiveWeight: number;
};

export type GriCalculation = {
  methodologyVersion: string;
  asOf: string;
  rawScore: number | null;
  displayScore: number | null;
  coverage: number;
  activeCategories: string[];
  eventCount: number;
  sourceCount: number;
  weightedConfidence: number | null;
  categories: GriCategory[];
  contributions: GriContribution[];
  inputRows: Array<Record<string, unknown>>;
};

export function canonicalJson(value: unknown): string;
export function methodologyManifest(): Record<string, unknown>;
export function normalizeGriEvent(row: GriInputRow, asOfMs: number): Record<string, unknown> | null;
export function calculateGri(rows: GriInputRow[], asOf?: Date | string | number): GriCalculation;
export function attributeGriChange(
  previous: GriCalculation,
  current: GriCalculation,
): null | {
  previousAsOf: string;
  currentAsOf: string;
  previousRawScore: number;
  currentRawScore: number;
  previousDisplayScore: number;
  currentDisplayScore: number;
  rawDelta: number;
  displayDelta: number;
  coverageDelta: number;
  eventCountDelta: number;
  sourceCountDelta: number;
  categoryChanges: Array<Record<string, unknown>>;
  eventChanges: Array<Record<string, unknown>>;
  residual: number;
};
