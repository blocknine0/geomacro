import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { getAppSupabase } from "./supabase-app.server";
import { readB2PublicIntelligence } from "./b2-live.server";

const EmptyInput = z.object({}).strict();
const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS = 3_500;
const STRUCTURED_LIMIT = 180;
const FALLBACK_LIMIT = 120;

export const PUBLIC_INTELLIGENCE_CATEGORIES = [
  "geopolitics",
  "macro",
  "rare_earth",
] as const;

type PublicIntelligenceCategory =
  (typeof PUBLIC_INTELLIGENCE_CATEGORIES)[number];

type VerifiedFlashRow = {
  flash_id: string;
  event_family_id: string | null;
  headline: string | null;
  published_at: string | null;
  ingested_at: string;
  severity: number | null;
  verification_status: string;
  signal_category: string;
};

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

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCategory(value: unknown): PublicIntelligenceCategory | null {
  const category = String(value ?? "").trim().toLowerCase();
  return (PUBLIC_INTELLIGENCE_CATEGORIES as readonly string[]).includes(category)
    ? (category as PublicIntelligenceCategory)
    : null;
}

function missingCategories(rows: PublicIntelligenceRow[]): PublicIntelligenceCategory[] {
  const present = new Set(
    rows
      .map((row) => normalizeCategory(row.category))
      .filter((category): category is PublicIntelligenceCategory => Boolean(category)),
  );
  return PUBLIC_INTELLIGENCE_CATEGORIES.filter((category) => !present.has(category));
}

function sortAndDedupe(rows: PublicIntelligenceRow[]): PublicIntelligenceRow[] {
  const dedupe = new Map<string, PublicIntelligenceRow>();
  for (const row of rows) {
    const category = normalizeCategory(row.category);
    if (!category) continue;
    const key = [
      category,
      String(row.source_title ?? "").trim().toLowerCase().replace(/\s+/g, " "),
    ].join("|");
    if (!dedupe.has(key)) dedupe.set(key, { ...row, category });
  }

  return [...dedupe.values()]
    .sort((a, b) => {
      const left = Date.parse(String(a.published_at ?? a.created_at));
      const right = Date.parse(String(b.published_at ?? b.created_at));
      return (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity);
    })
    .slice(0, 300);
}

/**
 * Authoritative Supabase read used only to build/update the B2 live snapshot or
 * as a bounded fallback when the private B2 snapshot is unavailable.
 */
export async function readPublicIntelligenceRowsFromSupabase(): Promise<PublicIntelligenceRow[]> {
  const supabase = getAppSupabase();
  if (!supabase) return [];

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();
  const since24h = new Date(now - DAY_MS).toISOString();
  const failures: string[] = [];
  const rows: PublicIntelligenceRow[] = [];

  const structuredResult = await supabase
    .from("live_structured_events")
    .select(
      "id,title,summary,domain,severity,confidence,first_seen_at,last_seen_at,last_observed_at,created_at,status",
    )
    .in("domain", [...PUBLIC_INTELLIGENCE_CATEGORIES])
    .in("status", ["active", "monitoring"])
    .gte("last_seen_at", since30d)
    .lte("last_seen_at", nowIso)
    .order("last_seen_at", { ascending: false })
    .limit(STRUCTURED_LIMIT)
    .abortSignal(AbortSignal.timeout(PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS));

  if (structuredResult.error) {
    failures.push(`structured:${structuredResult.error.code ?? "unknown"}`);
    console.error("[public-intelligence] structured read failed", structuredResult.error);
  } else {
    for (const row of structuredResult.data ?? []) {
      const category = normalizeCategory(row.domain);
      if (!category) continue;
      const observedAt =
        row.last_observed_at ?? row.last_seen_at ?? row.first_seen_at ?? row.created_at;
      rows.push({
        id: String(row.id),
        source_title: row.title ? String(row.title) : null,
        summary: row.summary ? String(row.summary) : null,
        category,
        severity: numberOrNull(row.severity),
        delta: null,
        created_at: String(row.created_at ?? observedAt),
        published_at: observedAt ? String(observedAt) : null,
      });
    }
  }

  let missing = missingCategories(rows);
  if (rows.length > 0 && missing.length === 0) return sortAndDedupe(rows);

  if (missing.length > 0) {
    const familyResult = await supabase
      .from("live_flash_event_families")
      .select("family_id,signal_category,canonical_headline,last_seen_at,current_status")
      .eq("current_status", "ACTIVE")
      .in("signal_category", missing)
      .gte("last_seen_at", since24h)
      .lte("last_seen_at", nowIso)
      .order("last_seen_at", { ascending: false })
      .limit(FALLBACK_LIMIT)
      .abortSignal(AbortSignal.timeout(PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS));

    if (familyResult.error) {
      failures.push(`family:${familyResult.error.code ?? "unknown"}`);
      console.error("[public-intelligence] live-family read failed", familyResult.error);
    } else {
      const familyIds = (familyResult.data ?? []).map((row) => String(row.family_id));
      if (familyIds.length > 0) {
        const flashResult = await supabase
          .from("live_flash_events")
          .select("flash_id,event_family_id,headline,published_at,ingested_at,severity,verification_status,signal_category")
          .in("event_family_id", familyIds)
          .eq("verification_status", "VERIFIED")
          .in("signal_category", missing)
          .gte("ingested_at", since24h)
          .order("ingested_at", { ascending: false })
          .limit(FALLBACK_LIMIT * 2)
          .abortSignal(AbortSignal.timeout(PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS));

        if (flashResult.error) {
          failures.push(`flash:${flashResult.error.code ?? "unknown"}`);
          console.error("[public-intelligence] verified flash read failed", flashResult.error);
        } else {
          const flashByFamily = new Map<string, VerifiedFlashRow>();
          for (const flash of (flashResult.data ?? []) as VerifiedFlashRow[]) {
            const familyId = String(flash.event_family_id ?? "");
            if (familyId && !flashByFamily.has(familyId)) flashByFamily.set(familyId, flash);
          }
          for (const family of familyResult.data ?? []) {
            const category = normalizeCategory(family.signal_category);
            const flash = flashByFamily.get(String(family.family_id));
            if (!category || !flash) continue;
            const observedAt = flash.published_at ?? flash.ingested_at ?? family.last_seen_at;
            rows.push({
              id: String(flash.flash_id),
              source_title: String(family.canonical_headline || flash.headline || "Verified live intelligence"),
              summary: null,
              category,
              severity: numberOrNull(flash.severity),
              delta: null,
              created_at: String(flash.ingested_at ?? observedAt),
              published_at: observedAt ? String(observedAt) : null,
            });
          }
        }
      }
    }
  }

  missing = missingCategories(rows);
  if (missing.length > 0) {
    const legacyResult = await supabase
      .from("events")
      .select("id,source_title,summary,category,severity,delta,created_at,published_at")
      .in("category", missing)
      .gte("created_at", since30d)
      .lte("created_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(FALLBACK_LIMIT)
      .abortSignal(AbortSignal.timeout(PUBLIC_INTELLIGENCE_QUERY_TIMEOUT_MS));

    if (legacyResult.error) {
      failures.push(`legacy:${legacyResult.error.code ?? "unknown"}`);
      console.error("[public-intelligence] legacy read failed", legacyResult.error);
    } else {
      rows.push(...((legacyResult.data ?? []) as PublicIntelligenceRow[]));
    }
  }

  const result = sortAndDedupe(rows);
  if (result.length === 0 && failures.length > 0) {
    console.error("[public-intelligence] all read paths degraded", failures.join(","));
  }
  return result;
}

/**
 * Public read boundary: private B2 live snapshot first, then bounded Supabase.
 * Supabase is therefore not a single point of failure for the Intelligence page.
 */
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
