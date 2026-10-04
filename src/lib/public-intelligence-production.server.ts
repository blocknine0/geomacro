import { readB2PublicIntelligence } from "./b2-live.server";
import { dedupePublicIntelligenceRows } from "./public-intelligence-dedupe";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

export type ProductionPublicIntelligenceRow = PublicIntelligenceRow & {
  public_status: "verified_b2" | "live_observed";
};

export type ProductionPublicIntelligence = {
  rows: ProductionPublicIntelligenceRow[];
  mode: "verified_b2" | "verified_b2_plus_live_observed";
  verified_rows: number;
  live_observed_rows: number;
  newest_at: string | null;
  current_within_24h: boolean;
  generated_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_OBSERVED_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"] as const;
const MAX_TOTAL_ROWS = 300;
const SCORED_TITLE_PREFIX = "Geomacro finds ";
const LIVE_TITLE_PREFIX = "Geomacro observes ";

function rowTime(row: Pick<PublicIntelligenceRow, "published_at" | "created_at">): number {
  const published = Date.parse(String(row.published_at ?? ""));
  if (Number.isFinite(published)) return published;
  const created = Date.parse(String(row.created_at ?? ""));
  return Number.isFinite(created) ? created : -Infinity;
}

function newestAt(rows: Array<Pick<PublicIntelligenceRow, "published_at" | "created_at">>): string | null {
  const latest = rows.reduce((best, row) => Math.max(best, rowTime(row)), -Infinity);
  return Number.isFinite(latest) ? new Date(latest).toISOString() : null;
}

function normalizedScoredRow(row: PublicIntelligenceRow): ProductionPublicIntelligenceRow | null {
  const category = String(row.category ?? "").trim().toLowerCase();
  const severity = Number(row.severity);
  const title = String(row.source_title ?? "").replace(/\s+/g, " ").trim();
  if (!(REQUIRED_CATEGORIES as readonly string[]).includes(category)) return null;
  if (!title.startsWith(SCORED_TITLE_PREFIX)) return null;
  if (!Number.isFinite(severity) || severity < 0 || severity > 100) return null;
  return {
    ...row,
    source_title: title,
    category,
    severity,
    delta: row.delta === null || row.delta === undefined || !Number.isFinite(Number(row.delta))
      ? null
      : Number(row.delta),
    public_status: "verified_b2",
  };
}

function normalizedLiveObservedRow(
  row: PublicIntelligenceRow,
  now = Date.now(),
): ProductionPublicIntelligenceRow | null {
  if (row.public_status !== "live_observed") return null;
  const category = String(row.category ?? "").trim().toLowerCase();
  const title = String(row.source_title ?? "").replace(/\s+/g, " ").trim();
  const timestamp = rowTime(row);
  if (
    category !== "geopolitics" ||
    !title.startsWith(LIVE_TITLE_PREFIX) ||
    row.severity !== null ||
    row.delta !== null ||
    !Number.isFinite(timestamp) ||
    timestamp > now + 5 * 60_000 ||
    now - timestamp > LIVE_OBSERVED_MAX_AGE_MS
  ) return null;
  return {
    ...row,
    source_title: title,
    category,
    severity: null,
    delta: null,
    public_status: "live_observed",
  };
}

function normalizedRows(rows: PublicIntelligenceRow[]): ProductionPublicIntelligenceRow[] {
  const normalized: ProductionPublicIntelligenceRow[] = [];
  const exact = new Set<string>();
  const now = Date.now();

  for (const raw of [...rows].sort((a, b) => rowTime(b) - rowTime(a))) {
    const row = raw.public_status === "live_observed"
      ? normalizedLiveObservedRow(raw, now)
      : normalizedScoredRow(raw);
    if (!row) continue;

    const key = `${row.public_status}|${row.category}|${String(row.source_title).toLowerCase().replace(/\s+/g, " ")}`;
    if (exact.has(key)) continue;
    exact.add(key);
    normalized.push(row);
  }

  return dedupePublicIntelligenceRows(normalized, MAX_TOTAL_ROWS);
}

function assertThreeDomainCoverage(rows: ProductionPublicIntelligenceRow[]) {
  const categories = new Set(
    rows
      .filter((row) => row.public_status === "verified_b2" && row.severity !== null)
      .map((row) => String(row.category ?? "").toLowerCase()),
  );
  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) throw new Error(`INTELLIGENCE_SCORED_DOMAIN_MISSING_${category}`);
  }
}

/**
 * Production Intelligence keeps two explicit evidence classes:
 *
 * 1. `verified_b2`: canonical classifier-scored, derived English records.
 * 2. `live_observed`: certified current GDELT Event observations with real
 *    event timestamps, derived public wording and no Geomacro severity score.
 *
 * Live observations cannot be converted into scored rows here. Raw publisher
 * headlines, source URLs and provider identity never cross this boundary.
 */
export async function readProductionPublicIntelligence(): Promise<ProductionPublicIntelligence> {
  const generatedAt = new Date().toISOString();
  const base = (await readB2PublicIntelligence()) ?? [];
  const rows = normalizedRows(base);
  const verifiedRows = rows.filter((row) => row.public_status === "verified_b2");
  const liveRows = rows.filter((row) => row.public_status === "live_observed");
  if (verifiedRows.length === 0) throw new Error("INTELLIGENCE_SCORED_PACKAGE_EMPTY");
  assertThreeDomainCoverage(verifiedRows);

  const newest = newestAt(rows);
  const newestMs = newest ? Date.parse(newest) : -Infinity;
  const currentWithin24h =
    Number.isFinite(newestMs) && newestMs <= Date.now() + 5 * 60_000 && Date.now() - newestMs <= DAY_MS;

  return {
    rows,
    mode: liveRows.length > 0 ? "verified_b2_plus_live_observed" : "verified_b2",
    verified_rows: verifiedRows.length,
    live_observed_rows: liveRows.length,
    newest_at: newest,
    current_within_24h: currentWithin24h,
    generated_at: generatedAt,
  };
}
