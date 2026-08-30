/**
 * Read model for the /intelligence workspace.
 *
 * Everything is derived from the existing Supabase `events` table using the
 * columns the pipeline already writes (severity, delta, category, timestamps).
 * No schema change, no new backend, no fabricated numbers: when a surface
 * cannot be computed from real rows it reports `null` so the UI can show an
 * honest unavailable state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseFeed } from "@/lib/supabase-feed";
import { reportError, type UserError } from "@/lib/user-errors";

export type IntelEvent = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  severity: number | null;
  /** Severity change written by the pipeline. null when never scored. */
  delta: number | null;
  sourceName: string | null;
  createdAt: string;
  publishedAt: string | null;
  marketCreated: boolean;
  marketResolved: boolean;
};

export type IntelStatus = "loading" | "ready" | "updating" | "error";

export type Intelligence = {
  all: IntelEvent[];
  /** Last 24h, or the most recent rows when the day is quiet. */
  today: IntelEvent[];
  usedFallbackWindow: boolean;
  topRisks: IntelEvent[];
  /** null when no row in the window carries a real severity change. */
  fastestMoving: IntelEvent[] | null;
  fading: IntelEvent[] | null;
  /** New rows scoring at or above the window median. null when unavailable. */
  emerging: IntelEvent[] | null;
  emergingMedian: number | null;
  categories: string[];
  categoryCounts: { category: string; count: number; avgSeverity: number }[];
  latest: IntelEvent[];
};

const DAY = 24 * 60 * 60 * 1000;
const EMERGING_WINDOW = 12 * 60 * 60 * 1000;

export const SORTS = ["risk", "newest", "moving"] as const;
export type IntelSort = (typeof SORTS)[number];

export const SORT_LABELS: Record<IntelSort, string> = {
  risk: "Highest risk",
  newest: "Newest",
  moving: "Fastest moving",
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function timeOf(e: IntelEvent) {
  return new Date(e.publishedAt ?? e.createdAt).getTime();
}

function build(rows: IntelEvent[], now: number): Intelligence {
  const in24h = rows.filter((r) => new Date(r.createdAt).getTime() >= now - DAY);
  const usedFallbackWindow = in24h.length === 0;
  const pool = usedFallbackWindow ? rows.slice(0, 24) : in24h;

  const scored = pool.filter((r) => r.severity !== null);
  const topRisks = [...scored].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)).slice(0, 8);

  const moved = pool.filter((r) => r.delta !== null && r.delta !== 0);
  const rising = moved
    .filter((r) => (r.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const falling = moved
    .filter((r) => (r.delta ?? 0) < 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  const med = median(scored.map((r) => r.severity as number));
  const emergingPool =
    med === null
      ? null
      : pool.filter(
          (r) =>
            r.severity !== null &&
            r.severity >= med &&
            new Date(r.createdAt).getTime() >= now - EMERGING_WINDOW,
        );

  const counts = new Map<string, { count: number; sum: number; scored: number }>();
  for (const r of pool) {
    const key = (r.category ?? "").trim();
    if (!key) continue;
    const c = counts.get(key) ?? { count: 0, sum: 0, scored: 0 };
    c.count += 1;
    if (r.severity !== null) {
      c.sum += r.severity;
      c.scored += 1;
    }
    counts.set(key, c);
  }
  const categoryCounts = [...counts.entries()]
    .map(([category, c]) => ({
      category,
      count: c.count,
      avgSeverity: c.scored > 0 ? Math.round(c.sum / c.scored) : 0,
    }))
    .sort((a, b) => b.avgSeverity - a.avgSeverity || b.count - a.count);

  return {
    all: rows,
    today: [...pool].sort((a, b) => (b.severity ?? -1) - (a.severity ?? -1)).slice(0, 12),
    usedFallbackWindow,
    topRisks,
    fastestMoving: rising.length > 0 ? rising.slice(0, 5) : null,
    fading: falling.length > 0 ? falling.slice(0, 5) : null,
    emerging: emergingPool && emergingPool.length > 0 ? emergingPool.slice(0, 5) : null,
    emergingMedian: med === null ? null : Math.round(med),
    categories: categoryCounts.map((c) => c.category),
    categoryCounts,
    latest: [...rows].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 6),
  };
}

export function useIntelligence(refreshMs = 5 * 60 * 1000) {
  const [data, setData] = useState<Intelligence | null>(null);
  const [status, setStatus] = useState<IntelStatus>("loading");
  const [error, setError] = useState<UserError | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasData = useRef(false);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus(hasData.current ? "updating" : "loading");
      try {
        const now = Date.now();
        const since = new Date(now - 30 * DAY).toISOString();
        const { data: rows, error: rowsError } = await supabaseFeed
          .from("events")
          .select(
            "id, source_title, summary, category, severity, delta, source_name, created_at, published_at, market_created, market_resolved",
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500);
        if (rowsError) throw rowsError;
        if (cancelled) return;

        const mapped: IntelEvent[] = (rows ?? []).map((r: Record<string, unknown>) => ({
          id: String(r.id),
          title: (r.source_title as string | null) ?? "Untitled event",
          summary: (r.summary as string | null) ?? null,
          category: (r.category as string | null) ?? null,
          severity: num(r.severity),
          delta: num(r.delta),
          sourceName: (r.source_name as string | null) ?? null,
          createdAt: String(r.created_at),
          publishedAt: (r.published_at as string | null) ?? null,
          marketCreated: Boolean(r.market_created),
          marketResolved: Boolean(r.market_resolved),
        }));

        if (mapped.length === 0) {
          hasData.current = false;
          setData(null);
          setStatus("error");
          setError({ message: "Intelligence feed unavailable.", retryable: true });
          return;
        }

        hasData.current = true;
        setData(build(mapped, now));
        setUpdatedAt(Date.now());
        setError(null);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(reportError("useIntelligence", e, "loading the intelligence feed"));
        setStatus("error");
      }
    }

    void load();
    const id = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reloadKey, refreshMs]);

  return useMemo(
    () => ({ data, status, error, updatedAt, retry }),
    [data, status, error, updatedAt, retry],
  );
}

/** Client-side filter + search + sort over already-loaded rows. */
export function applyIntelFilters(
  rows: IntelEvent[],
  { category, query, sort }: { category: string; query: string; sort: IntelSort },
): IntelEvent[] {
  const q = query.trim().toLowerCase();
  let out = rows;
  if (category !== "all") out = out.filter((r) => (r.category ?? "").trim() === category);
  if (q) {
    out = out.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.sourceName ?? "").toLowerCase().includes(q),
    );
  }
  const sorted = [...out];
  if (sort === "risk") sorted.sort((a, b) => (b.severity ?? -1) - (a.severity ?? -1));
  else if (sort === "newest") sorted.sort((a, b) => timeOf(b) - timeOf(a));
  else sorted.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
  return sorted;
}

/** Fastest-moving sort is only offered when real severity changes exist. */
export function availableSorts(rows: IntelEvent[]): IntelSort[] {
  const hasMovement = rows.some((r) => r.delta !== null && r.delta !== 0);
  return hasMovement ? ["risk", "newest", "moving"] : ["risk", "newest"];
}

export function prettyCategory(category: string): string {
  return category
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
