import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertSameOrigin } from "./origin-guard";
import { getAppSupabase } from "./supabase-app.server";

const EmptyInput = z.object({}).strict();
const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * Canonical public Intelligence read path.
 *
 * Source precedence:
 *   1. live_structured_events: canonical structured current intelligence
 *   2. verified live flash families: current verified fallback when a structured
 *      story has not yet been materialized
 *   3. public.events: legacy/news-ingest compatibility fallback
 *
 * This keeps the public workspace aligned with the current live-intelligence
 * pipeline instead of depending exclusively on the legacy events table.
 */
export async function readPublicIntelligenceRows(): Promise<PublicIntelligenceRow[]> {
  const supabase = getAppSupabase();
  if (!supabase) throw new Error("Intelligence store unavailable");

  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();
  const since24h = new Date(now - DAY_MS).toISOString();

  const [structuredResult, legacyResult, familyResult] = await Promise.all([
    supabase
      .from("live_structured_events")
      .select(
        "id,title,summary,domain,severity,confidence,first_seen_at,last_seen_at,last_observed_at,created_at,status",
      )
      .in("domain", [...PUBLIC_INTELLIGENCE_CATEGORIES])
      .in("status", ["active", "monitoring"])
      .gte("last_seen_at", since30d)
      .lte("last_seen_at", new Date(now).toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(500),
    supabase
      .from("events")
      .select("id,source_title,summary,category,severity,delta,created_at,published_at")
      .in("category", [...PUBLIC_INTELLIGENCE_CATEGORIES])
      .gte("created_at", since30d)
      .lte("created_at", new Date(now).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("live_flash_event_families")
      .select(
        "family_id,signal_category,canonical_headline,last_seen_at,latest_flash_id,current_status",
      )
      .eq("current_status", "ACTIVE")
      .in("signal_category", [...PUBLIC_INTELLIGENCE_CATEGORIES])
      .gte("last_seen_at", since24h)
      .lte("last_seen_at", new Date(now).toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(500),
  ]);

  if (structuredResult.error) {
    console.error("[public-intelligence] structured read failed", structuredResult.error.message);
    throw new Error("Intelligence feed unavailable");
  }
  if (legacyResult.error) {
    console.error("[public-intelligence] legacy read failed", legacyResult.error.message);
    throw new Error("Intelligence feed unavailable");
  }
  if (familyResult.error) {
    console.error("[public-intelligence] live-family read failed", familyResult.error.message);
    throw new Error("Intelligence feed unavailable");
  }

  const structuredRows: PublicIntelligenceRow[] = (structuredResult.data ?? [])
    .map((row) => {
      const category = normalizeCategory(row.domain);
      if (!category) return null;
      const observedAt =
        row.last_observed_at ??
        row.last_seen_at ??
        row.first_seen_at ??
        row.created_at;
      return {
        id: String(row.id),
        source_title: row.title ? String(row.title) : null,
        summary: row.summary ? String(row.summary) : null,
        category,
        severity: numberOrNull(row.severity),
        delta: null,
        created_at: String(row.created_at ?? observedAt),
        published_at: observedAt ? String(observedAt) : null,
      };
    })
    .filter((row): row is PublicIntelligenceRow => Boolean(row));

  const structuredCategories = new Set(
    structuredRows
      .map((row) => row.category)
      .filter((category): category is string => Boolean(category)),
  );

  const familyIds = (familyResult.data ?? [])
    .map((row) => String(row.latest_flash_id ?? ""))
    .filter(Boolean);

  const verifiedFlashRows =
    familyIds.length === 0
      ? []
      : await supabase
          .from("live_flash_events")
          .select("flash_id,headline,published_at,ingested_at,severity,verification_status,signal_category")
          .in("flash_id", familyIds)
          .eq("verification_status", "VERIFIED")
          .in("signal_category", [...PUBLIC_INTELLIGENCE_CATEGORIES])
          .gte("published_at", since24h)
          .order("published_at", { ascending: false });

  if (verifiedFlashRows.error) {
    console.error("[public-intelligence] verified flash read failed", verifiedFlashRows.error.message);
    throw new Error("Intelligence feed unavailable");
  }

  const verifiedFlashById = new Map(
    (verifiedFlashRows.data ?? []).map((row) => [String(row.flash_id), row]),
  );

  const familyFallbackRows: PublicIntelligenceRow[] = [];
  for (const family of familyResult.data ?? []) {
    const category = normalizeCategory(family.signal_category);
    const flash = verifiedFlashById.get(String(family.latest_flash_id ?? ""));
    if (!category || !flash || structuredCategories.has(category)) continue;

    const observedAt = flash.published_at ?? flash.ingested_at ?? family.last_seen_at;
    familyFallbackRows.push({
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

  const familyIdsByCategory = new Set(familyFallbackRows.map((row) => row.category));
  const legacyRows = (legacyResult.data ?? []) as PublicIntelligenceRow[];

  const fallbackCategories = new Set<string>([
    ...structuredCategories,
    ...familyIdsByCategory,
  ]);

  const compatibilityRows = legacyRows.filter((row) => {
    const category = normalizeCategory(row.category);
    return category !== null && !fallbackCategories.has(category);
  });

  const dedupe = new Map<string, PublicIntelligenceRow>();
  for (const row of [...structuredRows, ...familyFallbackRows, ...compatibilityRows]) {
    const key = [
      normalizeCategory(row.category) ?? "unknown",
      String(row.source_title ?? "").trim().toLowerCase().replace(/\s+/g, " "),
    ].join("|");
    if (!dedupe.has(key)) dedupe.set(key, row);
  }

  return [...dedupe.values()]
    .sort((a, b) => {
      const left = Date.parse(String(a.published_at ?? a.created_at));
      const right = Date.parse(String(b.published_at ?? b.created_at));
      return (Number.isFinite(right) ? right : -Infinity) - (Number.isFinite(left) ? left : -Infinity);
    })
    .slice(0, 500);
}

export const getPublicIntelligence = createServerFn({ method: "POST" })
  .validator((input: unknown) => EmptyInput.parse(input))
  .handler(async (): Promise<PublicIntelligenceRow[]> => {
    assertSameOrigin();
    return readPublicIntelligenceRows();
  });
