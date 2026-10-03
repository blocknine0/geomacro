import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { readB2PublicIntelligence } from "./b2-live.server";
import { getAppSupabase } from "./supabase-app.server";

const EmptyInput = z.object({}).strict();
const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS = 3_500;
const MAX_ROWS = 300;
const CLASSIFICATION_VERSION = "event-severity-v1.0.5";
const DERIVED_TITLE_PREFIX = "Geomacro finds ";

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
  source_name: string | null;
  source_domain: string | null;
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

function rowTime(row: PublicIntelligenceRow): number {
  const published = Date.parse(String(row.published_at ?? ""));
  if (Number.isFinite(published)) return published;
  const created = Date.parse(String(row.created_at ?? ""));
  return Number.isFinite(created) ? created : -Infinity;
}

function normalizeWhitespace(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function derivedEnglishTitle(narrative: unknown): string | null {
  const value = normalizeWhitespace(narrative).replace(/[.!?]+$/u, "");
  if (!value) return null;
  const title = value.toLowerCase().startsWith(DERIVED_TITLE_PREFIX.toLowerCase())
    ? `${DERIVED_TITLE_PREFIX}${value.slice(DERIVED_TITLE_PREFIX.length).trim()}`
    : `${DERIVED_TITLE_PREFIX}${value}`;
  if (title.length < DERIVED_TITLE_PREFIX.length + 8 || title.length > 280) return null;
  // Fail closed on scripts that cannot be English. Classifier prompts require
  // English narrative/summary output, so any such script indicates raw/source
  // wording leaked through the classifier boundary.
  if (/\p{Script=Arabic}|\p{Script=Cyrillic}|\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|\p{Script=Devanagari}/u.test(title)) return null;
  return title;
}

function isGuardian(row: Pick<CanonicalEventRow, "source_name" | "source_domain">): boolean {
  const name = String(row.source_name ?? "").trim().toLowerCase();
  const domain = String(row.source_domain ?? "").trim().toLowerCase().replace(/^www\./, "");
  return name.includes("guardian") || domain === "theguardian.com";
}

function normalizeScoredRow(row: PublicIntelligenceRow): PublicIntelligenceRow | null {
  const category = normalizeCategory(row.category);
  const severity = numberOrNull(row.severity);
  const title = normalizeWhitespace(row.source_title);
  if (!category || !title.startsWith(DERIVED_TITLE_PREFIX) || severity === null || severity < 0 || severity > 100) {
    return null;
  }
  return {
    ...row,
    source_title: title,
    summary: row.summary ? normalizeWhitespace(row.summary) : null,
    category,
    severity,
    delta: numberOrNull(row.delta),
  };
}

function sortAndDedupe(rows: PublicIntelligenceRow[]): PublicIntelligenceRow[] {
  const dedupe = new Map<string, PublicIntelligenceRow>();
  for (const raw of rows) {
    const row = normalizeScoredRow(raw);
    if (!row) continue;
    const key = `${row.category}|${String(row.source_title).toLowerCase().replace(/\s+/g, " ")}`;
    if (!dedupe.has(key)) dedupe.set(key, row);
  }
  return [...dedupe.values()]
    .sort((a, b) => rowTime(b) - rowTime(a))
    .slice(0, MAX_ROWS);
}

/**
 * Recovery/snapshot read boundary for public Intelligence.
 *
 * Only canonical classifier-scored event rows are eligible. Raw upstream
 * headlines, publisher identity, Guardian-derived rows and unscored live
 * observations are excluded. Public titles are reconstructed from the
 * classifier-owned English narrative as `Geomacro finds ...`.
 */
export async function readPublicIntelligenceRowsFromSupabase(): Promise<PublicIntelligenceRow[]> {
  const supabase = getAppSupabase();
  if (!supabase) return [];

  const now = Date.now();
  const nowIso = new Date(now + 5 * 60_000).toISOString();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();

  const result = await supabase
    .from("events")
    .select("id,narrative,summary,category,severity,delta,created_at,published_at,source_name,source_domain,classification_version")
    .in("category", [...PUBLIC_INTELLIGENCE_CATEGORIES])
    .eq("classification_version", CLASSIFICATION_VERSION)
    .not("severity", "is", null)
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
    if (raw.classification_version !== CLASSIFICATION_VERSION || isGuardian(raw)) continue;
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
    });
  }

  return sortAndDedupe(rows);
}

/** Public serving is B2-first; bounded Supabase recovery is scored/derived only. */
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
