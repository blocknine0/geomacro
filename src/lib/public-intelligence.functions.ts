import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readB2PublicIntelligence } from "./b2-live.server";
import { getAppSupabase } from "./supabase-app.server";
import { sanitizePublicIntelligenceRow } from "./public-intelligence-gist";
import { dedupePublicIntelligenceRows } from "./public-intelligence-dedupe";

const EmptyInput = z.object({}).strict();
const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS = 3_500;
const MAX_ROWS = 300;
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const SCORED_TITLE_PREFIX = "Geomacro finds ";
const LIVE_TITLE_PREFIX = "Geomacro observes ";

export const PUBLIC_INTELLIGENCE_CATEGORIES = [
  "geopolitics",
  "macro",
  "rare_earth",
] as const;

type PublicIntelligenceCategory =
  (typeof PUBLIC_INTELLIGENCE_CATEGORIES)[number];

export type PublicIntelligenceRow = {
  id: string;
  source_title: string | null;
  summary: string | null;
  category: string | null;
  severity: number | null;
  delta: number | null;
  created_at: string;
  published_at: string | null;
  public_status?: "verified_b2" | "live_observed";
};

type CanonicalEventRow = {
  id: string;
  narrative: string | null;
  summary: string | null;
  category: string | null;
  severity: number | null;
  delta: number | null;
  created_at: string;
  published_at: string | null;
  classification_version: string | null;
};

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCategory(value: unknown): PublicIntelligenceCategory | null {
  const category = String(value ?? "").trim().toLowerCase();
  return (PUBLIC_INTELLIGENCE_CATEGORIES as readonly string[]).includes(category)
    ? (category as PublicIntelligenceCategory)
    : null;
}


function normalizeWhitespace(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function derivedEnglishTitle(narrative: unknown): string | null {
  const value = normalizeWhitespace(narrative).replace(/[.!?]+$/u, "");
  if (!value) return null;
  const title = value.toLowerCase().startsWith(SCORED_TITLE_PREFIX.toLowerCase())
    ? `${SCORED_TITLE_PREFIX}${value.slice(SCORED_TITLE_PREFIX.length).trim()}`
    : `${SCORED_TITLE_PREFIX}${value}`;
  if (title.length < SCORED_TITLE_PREFIX.length + 8 || title.length > 280) return null;
  if (/\p{Script=Arabic}|\p{Script=Cyrillic}|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Devanagari}/u.test(title)) return null;
  return title;
}

function normalizeScoredRow(row: PublicIntelligenceRow): PublicIntelligenceRow | null {
  const category = normalizeCategory(row.category);
  const severity = numberOrNull(row.severity);
  const title = normalizeWhitespace(row.source_title);
  if (!category || !title.startsWith(SCORED_TITLE_PREFIX) || severity === null || severity < 0 || severity > 100) {
    return null;
  }
  return sanitizePublicIntelligenceRow(row);
}

function normalizeLiveObservedRow(row: PublicIntelligenceRow): PublicIntelligenceRow | null {
  const category = normalizeCategory(row.category);
  const title = normalizeWhitespace(row.source_title);
  if (
    row.public_status !== "live_observed" ||
    category !== "geopolitics" ||
    !title.startsWith(LIVE_TITLE_PREFIX) ||
    row.severity !== null ||
    row.delta !== null ||
    !Number.isFinite(Date.parse(String(row.published_at ?? "")))
  ) return null;
  return sanitizePublicIntelligenceRow(row);
}

function normalizePublicRow(row: PublicIntelligenceRow): PublicIntelligenceRow | null {
  return row.public_status === "live_observed"
    ? normalizeLiveObservedRow(row)
    : normalizeScoredRow(row);
}

function sortAndDedupe(rows: PublicIntelligenceRow[]): PublicIntelligenceRow[] {
  const dedupe = new Map<string, PublicIntelligenceRow>();
  for (const raw of rows) {
    const row = normalizePublicRow(raw);
    if (!row) continue;
    const key = `${row.public_status}|${row.category}|${String(row.source_title).toLowerCase().replace(/\s+/g, " ")}`;
    if (!dedupe.has(key)) dedupe.set(key, row);
  }
  // A single verified event reported with different approved wording must
  // produce one public row. Do not discard distinct actors/places/actions.
  return dedupePublicIntelligenceRows([...dedupe.values()], MAX_ROWS);
}

/**
 * Recovery/snapshot read boundary for public Intelligence.
 *
 * Canonical scored rows remain classifier-derived `Geomacro finds ...` records.
 * B2 may additionally carry certified current GDELT Event observations as
 * `Geomacro observes ...` rows with `severity=null` and `public_status=live_observed`.
 * Raw upstream headlines, source URLs and publisher identity never cross this
 * boundary, and live observations never become a Geomacro score here.
 */
export async function readPublicIntelligenceRowsFromSupabase(): Promise<PublicIntelligenceRow[]> {
  const supabase = getAppSupabase();
  if (!supabase) return [];

  const now = Date.now();
  const nowIso = new Date(now + 5 * 60_000).toISOString();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();

  const result = await supabase
    .from("events")
    .select("id,narrative,summary,category,severity,delta,created_at,published_at,classification_version")
    .in("category", [...PUBLIC_INTELLIGENCE_CATEGORIES])
    .eq("classification_version", CLASSIFICATION_VERSION)
    .not("severity", "is", null)
    .or("source_name.is.null,source_name.not.ilike.%guardian%")
    .or("source_domain.is.null,source_domain.not.in.(theguardian.com,www.theguardian.com)")
    .gte("created_at", since30d)
    .lte("created_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS)
    .abortSignal(AbortSignal.timeout(PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS));

  if (result.error) {
    console.error("[public-intelligence] canonical scored recovery read failed", result.error);
    return [];
  }

  const rows: PublicIntelligenceRow[] = [];
  for (const raw of (result.data ?? []) as CanonicalEventRow[]) {
    if (raw.classification_version !== CLASSIFICATION_VERSION) continue;
    const category = normalizeCategory(raw.category);
    const severity = numberOrNull(raw.severity);
    const title = derivedEnglishTitle(raw.narrative);
    if (!category || severity === null || severity < 0 || severity > 100 || !title) continue;
    rows.push({
      id: String(raw.id),
      source_title: title,
      summary: raw.summary ? normalizeWhitespace(raw.summary) : null,
      category,
      severity,
      delta: numberOrNull(raw.delta),
      created_at: String(raw.created_at),
      published_at: raw.published_at ? String(raw.published_at) : null,
      public_status: "verified_b2",
    });
  }

  return sortAndDedupe(rows);
}

/** Public serving is B2-first; bounded Supabase recovery remains scored/derived only. */
export async function readPublicIntelligenceRows(): Promise<PublicIntelligenceRow[]> {
  const b2Rows = await readB2PublicIntelligence();
  if (b2Rows?.length) return sortAndDedupe(b2Rows);
  return readPublicIntelligenceRowsFromSupabase();
}

export const getPublicIntelligence = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicIntelligenceRow[]> => {
    assertSameOrigin();
    return readPublicIntelligenceRows();
  });
