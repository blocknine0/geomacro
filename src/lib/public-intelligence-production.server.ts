import { readB2PublicIntelligence } from "./b2-live.server";
import type { PublicIntelligenceRow } from "./public-intelligence.functions";

export type ProductionPublicIntelligenceRow = PublicIntelligenceRow & {
  public_status: "verified_b2";
};

export type ProductionPublicIntelligence = {
  rows: ProductionPublicIntelligenceRow[];
  mode: "verified_b2";
  verified_rows: number;
  live_observed_rows: 0;
  newest_at: string | null;
  current_within_24h: boolean;
  generated_at: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUIRED_CATEGORIES = ["geopolitics", "macro", "rare_earth"] as const;
const MAX_TOTAL_ROWS = 300;
const DERIVED_TITLE_PREFIX = "Geomacro finds ";

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

function scoredVerifiedRows(rows: PublicIntelligenceRow[]): ProductionPublicIntelligenceRow[] {
  const dedupe = new Map<string, ProductionPublicIntelligenceRow>();
  for (const row of [...rows].sort((a, b) => rowTime(b) - rowTime(a))) {
    const category = String(row.category ?? "").trim().toLowerCase();
    const severity = Number(row.severity);
    const title = String(row.source_title ?? "").trim();
    if (!(REQUIRED_CATEGORIES as readonly string[]).includes(category)) continue;
    if (!title.startsWith(DERIVED_TITLE_PREFIX)) continue;
    if (!Number.isFinite(severity) || severity < 0 || severity > 100) continue;
    const key = `${category}|${title.toLowerCase().replace(/\s+/g, " ")}`;
    if (dedupe.has(key)) continue;
    dedupe.set(key, {
      ...row,
      source_title: title,
      category,
      severity,
      delta: row.delta === null || row.delta === undefined || !Number.isFinite(Number(row.delta))
        ? null
        : Number(row.delta),
      public_status: "verified_b2",
    });
    if (dedupe.size >= MAX_TOTAL_ROWS) break;
  }
  return [...dedupe.values()];
}

function assertThreeDomainCoverage(rows: ProductionPublicIntelligenceRow[]) {
  const categories = new Set(rows.map((row) => String(row.category ?? "").toLowerCase()));
  for (const category of REQUIRED_CATEGORIES) {
    if (!categories.has(category)) throw new Error(`INTELLIGENCE_SCORED_DOMAIN_MISSING_${category}`);
  }
}

/**
 * Production Intelligence is deliberately scored-only and derived-only.
 *
 * Fresh discovery is handled by the bounded ingestion/classification workflow.
 * Customer-facing rows are published only after a real classifier severity is
 * persisted and the derived English title has been written to the verified B2
 * continuity package. Raw publisher headlines, source identities and unscored
 * observations never cross this boundary. If no new row qualifies, the prior
 * verified scored package remains visible.
 */
export async function readProductionPublicIntelligence(): Promise<ProductionPublicIntelligence> {
  const generatedAt = new Date().toISOString();
  const base = (await readB2PublicIntelligence()) ?? [];
  const rows = scoredVerifiedRows(base);
  if (rows.length === 0) throw new Error("INTELLIGENCE_SCORED_PACKAGE_EMPTY");
  assertThreeDomainCoverage(rows);

  const newest = newestAt(rows);
  const newestMs = newest ? Date.parse(newest) : -Infinity;
  const currentWithin24h =
    Number.isFinite(newestMs) && newestMs <= Date.now() + 5 * 60_000 && Date.now() - newestMs <= DAY_MS;

  return {
    rows,
    mode: "verified_b2",
    verified_rows: rows.length,
    live_observed_rows: 0,
    newest_at: newest,
    current_within_24h: currentWithin24h,
    generated_at: generatedAt,
  };
}
