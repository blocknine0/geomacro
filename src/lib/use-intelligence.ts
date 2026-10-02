/**
 * Read model for the /intelligence workspace.
 *
 * Public browser surfaces deliberately read through a same-origin B2-backed
 * server function. Supabase remains an ingestion/recovery system and is not a
 * customer-facing production dependency.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  PUBLIC_INTELLIGENCE_CATEGORIES,
  type PublicIntelligenceRow,
} from "@/lib/public-intelligence.functions";
import { getPublicIntelligenceFromB2 } from "@/lib/public-intelligence-b2.functions";
import { reportError, type UserError } from "@/lib/user-errors";
import {
  PUBLIC_DATA_REQUEST_TIMEOUT_MS,
  withPublicRuntimeTimeout,
} from "@/lib/public-runtime-timeout";

export type IntelEvent = {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  severity: number | null;
  /** Severity change written by the pipeline. null when never scored. */
  delta: number | null;
  /** Public compatibility field. Upstream publisher identity is never populated. */
  sourceName: null;
  createdAt: string;
  publishedAt: string | null;
  /** True only when published/recorded time falls inside the current 24h window. */
  isCurrent: boolean;
};

export type IntelStatus = "loading" | "ready" | "updating" | "error";

export type Intelligence = {
  all: IntelEvent[];
  /** Events whose published/recorded time falls inside the current 24h window. */
  today: IntelEvent[];
  /** Most recent available records used only when the current window is empty. */
  recent: IntelEvent[];
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
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function timeOf(e: IntelEvent) {
  const published = e.publishedAt ? new Date(e.publishedAt).getTime() : NaN;
  if (Number.isFinite(published)) return published;
  const created = new Date(e.createdAt).getTime();
  return Number.isFinite(created) ? created : -Infinity;
}

function mapPublicRows(rows: PublicIntelligenceRow[]): IntelEvent[] {
  return rows.map((r) => ({
    id: String(r.id),
    title: r.source_title ?? "Untitled event",
    summary: r.summary ?? null,
    category: r.category ?? null,
    severity: num(r.severity),
    delta: num(r.delta),
    sourceName: null,
    createdAt: String(r.created_at),
    publishedAt: r.published_at ?? null,
    isCurrent: false,
  }));
}

function build(rows: IntelEvent[], now: number): Intelligence {
  const markedRows = rows.map((row) => ({
    ...row,
    isCurrent: timeOf(row) >= now - DAY && timeOf(row) <= now,
  }));
  const in24h = markedRows.filter((r) => r.isCurrent);
  const usedFallbackWindow = in24h.length === 0;
  const recent = [...markedRows]
    .filter((r) => Number.isFinite(timeOf(r)) && timeOf(r) <= now)
    .sort((a, b) => timeOf(b) - timeOf(a))
    .slice(0, 24);
  const domainRows = usedFallbackWindow ? recent : in24h;

  const currentScored = in24h.filter((r) => r.severity !== null);
  const topRisks = [...currentScored]
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
    .slice(0, 8);

  const moved = in24h.filter((r) => r.delta !== null && r.delta !== 0);
  const rising = moved
    .filter((r) => (r.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const falling = moved
    .filter((r) => (r.delta ?? 0) < 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  const med = median(currentScored.map((r) => r.severity as number));
  const emergingPool =
    med === null
      ? null
      : in24h.filter(
          (r) =>
            r.severity !== null &&
            r.severity >= med &&
            timeOf(r) >= now - EMERGING_WINDOW &&
            timeOf(r) <= now,
        );

  const counts = new Map<string, { count: number; sum: number; scored: number }>();
  for (const r of domainRows) {
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
    all: markedRows,
    today: [...in24h]
      .sort((a, b) => timeOf(b) - timeOf(a))
      .slice(0, 12),
    recent,
    usedFallbackWindow,
    topRisks,
    fastestMoving: rising.length > 0 ? rising.slice(0, 5) : null,
    fading: falling.length > 0 ? falling.slice(0, 5) : null,
    emerging: emergingPool && emergingPool.length > 0 ? emergingPool.slice(0, 5) : null,
    emergingMedian: med === null ? null : Math.round(med),
    categories: [...PUBLIC_INTELLIGENCE_CATEGORIES],
    categoryCounts,
    latest: [...markedRows].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 6),
  };
}

/** Build the exact public intelligence read model from canonical public rows. */
export function buildPublicIntelligence(rows: PublicIntelligenceRow[], now: number): Intelligence {
  return build(mapPublicRows(rows), now);
}

export function useIntelligence(
  initialData: Intelligence | null = null,
  refreshMs = 5 * 60 * 1000,
) {
  const loadPublicIntelligence = useServerFn(getPublicIntelligenceFromB2);
  const [data, setData] = useState<Intelligence | null>(initialData);
  const [status, setStatus] = useState<IntelStatus>(initialData ? "ready" : "loading");
  const [error, setError] = useState<UserError | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(initialData ? Date.now() : null);
  const [reloadKey, setReloadKey] = useState(0);
  const hasData = useRef(Boolean(initialData));

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus(hasData.current ? "updating" : "loading");
      try {
        const now = Date.now();
        const rows = await withPublicRuntimeTimeout(
          loadPublicIntelligence({ data: {} }),
          PUBLIC_DATA_REQUEST_TIMEOUT_MS,
          "Intelligence feed request timed out.",
        );
        if (cancelled) return;

        const mapped = mapPublicRows(rows);

        if (mapped.length === 0) {
          if (hasData.current) {
            setStatus("ready");
            setError({ message: "Live refresh is temporarily unavailable. Showing the latest verified intelligence.", retryable: true });
            return;
          }
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
        setStatus(hasData.current ? "ready" : "error");
      }
    }

    void load();
    const id = window.setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loadPublicIntelligence, reloadKey, refreshMs]);

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
  const explicitResearch = Boolean(q) || category !== "all";
  const current = rows.filter((r) => r.isCurrent);
  let out = explicitResearch
    ? rows
    : current.length > 0
      ? current
      : [...rows]
          .filter((r) => Number.isFinite(timeOf(r)))
          .sort((a, b) => timeOf(b) - timeOf(a))
          .slice(0, 24);
  if (category !== "all") out = out.filter((r) => (r.category ?? "").trim() === category);
  if (q) {
    out = out.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.summary ?? "").toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q),
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
  const hasMovement = rows.some((r) => r.isCurrent && r.delta !== null && r.delta !== 0);
  return hasMovement ? ["risk", "newest", "moving"] : ["risk", "newest"];
}

export function prettyCategory(category: string): string {
  return category
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
