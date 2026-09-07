export const GRI_METHOD_VERSION: "gri-v1.0.0";

export const GRI_CATEGORIES: readonly [
  "geopolitics",
  "macro",
  "rare_earth",
  "crypto",
];

export const GRI_LOOKBACK_HOURS: number;
export const GRI_HALF_LIFE_HOURS: number;
export const GRI_SOURCE_WEIGHT_CAP: number;
export const GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS: number;

export type GriInputRow = {
  id: string;
  category: string;
  severity: number;
  confidence: number;
  source_name?: string | null;
  source_domain?: string | null;
  source_url?: string | null;
  source_title?: string | null;
  summary?: string | null;
  created_at: string;
  published_at?: string | null;
};

export type GriContribution = {
  eventId: string;
  category: string;
  contributionPoints: number;
  [key: string]: unknown;
};

export type GriEventChange = {
  eventId: string;
  kind: string;
  deltaPoints?: number;
  [key: string]: unknown;
};

export type GriCalculation = {
  methodologyVersion: string;
  rawScore: number | null;
  displayScore: number | null;
  coverage: number;
  eventCount: number;
  activeCategories: string[];
  contributions: GriContribution[];
  [key: string]: unknown;
};

export type GriChangeAttribution = {
  rawDelta: number;
  residual: number;
  eventChanges: GriEventChange[];
  [key: string]: unknown;
};

export function canonicalJson(value: unknown): string;

export function methodologyManifest(): Record<string, unknown>;

export function normalizeGriEvent(
  row: GriInputRow,
  asOfMs: number,
): Record<string, unknown> | null;

export function calculateGri(
  rows: GriInputRow[],
  asOf?: Date | number,
): GriCalculation;

export function attributeGriChange(
  previous: GriCalculation,
  current: GriCalculation,
): GriChangeAttribution | null;
