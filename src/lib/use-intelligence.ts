/**
 * Read model for the /intelligence workspace.
 *
 * Public Intelligence combines canonical scored/derived records with certified
 * current observations that remain explicitly unscored. Raw upstream headlines,
 * source identity and source-derived numeric features never become public scores.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PUBLIC_INTELLIGENCE_CATEGORIES,
  type PublicIntelligenceRow,
} from "@/lib/public-intelligence.functions";
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
  delta: number | null;
  sourceName: null;
  createdAt: string;
  publishedAt: string | null;
  isCurrent: boolean;
  publicStatus: "verified_b2" | "live_observed";
};

export type IntelStatus = "loading" | "ready" | "updating" | "error";

export type Intelligence = {
  all: IntelEvent[];
  today: IntelEvent[];
  recent: IntelEvent[];
  usedFallbackWindow: boolean;
  usesVerifiedContext: boolean;
  hasLiveObserved: boolean;
  topRisks: IntelEvent[];
  verifiedRiskContext: IntelEvent[];
  fastestMoving: IntelEvent[] | null;
  fading: IntelEvent[] | null;
  emerging: IntelEvent[] | null;
  emergingMedian: number | null;
  categories: string[];
  categoryCounts: { category: string; count: number; avgSeverity: number | null }[];
  latest: IntelEvent[];
};

type PublicIntelligenceApiRow = PublicIntelligenceRow & {
  public_status?: "verified_b2" | "live_observed";
};

type PublicIntelligenceApiResponse = {
  ok: boolean;
  rows?: PublicIntelligenceApiRow[];
  mode?: "verified_b2" | "verified_b2_plus_live_observed";
  verified_rows?: number;
  live_observed_rows?: number;
  newest_at?: string | null;
  current_within_24h?: boolean;
  error?: string;
};

const DAY = 24 * 60 * 60 * 1000;
const EMERGING_WINDOW = 12 * 60 * 60 * 1000;
const SCORED_TITLE_PREFIX = "Geomacro finds ";
const LIVE_TITLE_PREFIX = "Geomacro observes ";

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

function timeOf(e: Pick<IntelEvent, "publishedAt" | "createdAt">) {
  const published = e.publishedAt ? new Date(e.publishedAt).getTime() : NaN;
  if (Number.isFinite(published)) return published;
  const created = new Date(e.createdAt).getTime();
  return Number.isFinite(created) ? created : -Infinity;
}

function mapPublicRows(rows: PublicIntelligenceApiRow[]): IntelEvent[] {
  const allowed = new Set<string>(PUBLIC_INTELLIGENCE_CATEGORIES);
  return rows.flatMap((r) => {
    const title = String(r.source_title ?? "").replace(/\s+/g, " ").trim();
    const category = String(r.category ?? "").trim().toLowerCase();
    const createdAt = String(r.created_at ?? "");
    const publishedAt = r.published_at ?? null;
    const timestamp = timeOf({ createdAt, publishedAt });
    if (!allowed.has(category) || !Number.isFinite(timestamp)) return [];

    if (r.public_status === "live_observed") {
      if (
        category !== "geopolitics" ||
        !title.startsWith(LIVE_TITLE_PREFIX) ||
        r.severity !== null ||
        r.delta !== null
      ) return [];
      return [{
        id: String(r.id),
        title,
        summary: r.summary ?? null,
        category,
        severity: null,
        delta: null,
        sourceName: null,
        createdAt,
        publishedAt,
        isCurrent: false,
        publicStatus: "live_observed" as const,
      }];
    }

    const severity = num(r.severity);
    if (!title.startsWith(SCORED_TITLE_PREFIX)) return [];
    if (severity === null || severity < 0 || severity > 100) return [];
    return [{
      id: String(r.id),
      title,
      summary: r.summary ?? null,
      category,
      severity,
      delta: num(r.delta),
      sourceName: null,
      createdAt,
      publishedAt,
      isCurrent: false,
      publicStatus: "verified_b2" as const,
    }];
  });
}

function build(rows: IntelEvent[], now: number): Intelligence {
  const markedRows = rows
    .filter((row) => Number.isFinite(timeOf(row)) && timeOf(row) <= now + 5 * 60_000)
    .map((row) => ({
      ...row,
      isCurrent: timeOf(row) >= now - DAY && timeOf(row) <= now + 5 * 60_000,
    }))
    .sort((a, b) => timeOf(b) - timeOf(a));

  const currentRows = markedRows.filter((r) => r.isCurrent);
  const scoredRows = markedRows.filter(
    (r) => r.publicStatus === "verified_b2" && r.severity !== null,
  );
  const currentScored = scoredRows.filter((r) => r.isCurrent);
  const liveRows = markedRows.filter(
    (r) => r.publicStatus === "live_observed" && r.severity === null,
  );
  const usedFallbackWindow = currentRows.length === 0;
  const recent = [...markedRows].slice(0, 24);
  const verifiedContext = scoredRows
    .filter((r) => !r.isCurrent)
    .sort((a, b) => timeOf(b) - timeOf(a));
  const domainRows = usedFallbackWindow
    ? recent
    : [...currentRows, ...verifiedContext.slice(0, Math.max(0, 24 - currentRows.length))];

  const topRisks = [...currentScored]
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0))
    .slice(0, 8);
  const verifiedRiskContext = [...verifiedContext]
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0) || timeOf(b) - timeOf(a))
    .slice(0, 8);

  const moved = currentScored.filter((r) => r.delta !== null && r.delta !== 0);
  const rising = moved
    .filter((r) => (r.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
  const falling = moved
    .filter((r) => (r.delta ?? 0) < 0)
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));

  const med = median(currentScored.map((r) => r.severity as number));
  const emergingPool = med === null
    ? null
    : currentScored.filter(
        (r) =>
          (r.severity as number) >= med &&
          timeOf(r) >= now - EMERGING_WINDOW &&
          timeOf(r) <= now + 5 * 60_000,
      );

  const counts = new Map<string, { count: number; scoredCount: number; sum: number }>();
  for (const r of domainRows) {
    const key = (r.category ?? "").trim();
    if (!key) continue;
    const c = counts.get(key) ?? { count: 0, scoredCount: 0, sum: 0 };
    c.count += 1;
    if (r.severity !== null) {
      c.scoredCount += 1;
      c.sum += r.severity;
    }
    counts.set(key, c);
  }
  const categoryCounts = [...counts.entries()]
    .map(([category, c]) => ({
      category,
      count: c.count,
      avgSeverity: c.scoredCount > 0 ? Math.round(c.sum / c.scoredCount) : null,
    }))
    .sort((a, b) =>
      (b.avgSeverity ?? -1) - (a.avgSeverity ?? -1) || b.count - a.count,
    );

  return {
    all: markedRows,
    today: [...currentRows].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 12),
    recent,
    usedFallbackWindow,
    usesVerifiedContext: currentRows.length > 0 && verifiedContext.length > 0,
    hasLiveObserved: liveRows.length > 0,
    topRisks,
    verifiedRiskContext,
    fastestMoving: rising.length > 0 ? rising.slice(0, 5) : null,
    fading: falling.length > 0 ? falling.slice(0, 5) : null,
    emerging: emergingPool && emergingPool.length > 0 ? emergingPool.slice(0, 5) : null,
    emergingMedian: med === null ? null : Math.round(med),
    categories: [...PUBLIC_INTELLIGENCE_CATEGORIES],
    categoryCounts,
    latest: [...markedRows].slice(0, 6),
  };
}

export function buildPublicIntelligence(rows: PublicIntelligenceRow[], now: number): Intelligence {
  return build(mapPublicRows(rows), now);
}

async function fetchPublicIntelligence(): Promise<PublicIntelligenceApiRow[]> {
  const response = await fetch("/api/public/intelligence", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json()) as PublicIntelligenceApiResponse;
  const liveCount = Number(payload.live_observed_rows ?? 0);
  const validMode =
    payload.mode === "verified_b2" ||
    payload.mode === "verified_b2_plus_live_observed";
  const modeCountsAgree =
    (payload.mode === "verified_b2" && liveCount === 0) ||
    (payload.mode === "verified_b2_plus_live_observed" && liveCount > 0);
  if (
    !response.ok ||
    !payload.ok ||
    !validMode ||
    !modeCountsAgree ||
    !Array.isArray(payload.rows)
  ) {
    throw new Error(payload.error ?? "Verified intelligence feed unavailable.");
  }
  return payload.rows;
}

export function useIntelligence(
  initialData: Intelligence | null = null,
  refreshMs = 5 * 60 * 1000,
) {
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
          fetchPublicIntelligence(),
          PUBLIC_DATA_REQUEST_TIMEOUT_MS,
          "Intelligence feed request timed out.",
        );
        if (cancelled) return;

        const mapped = mapPublicRows(rows);
        if (mapped.length === 0) {
          if (hasData.current) {
            setStatus("ready");
            setError({ message: "Refresh is temporarily unavailable. Showing the latest verified intelligence.", retryable: true });
            return;
          }
          hasData.current = false;
          setData(null);
          setStatus("error");
          setError({ message: "Verified intelligence feed unavailable.", retryable: true });
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
  }, [reloadKey, refreshMs]);

  return useMemo(
    () => ({ data, status, error, updatedAt, retry }),
    [data, status, error, updatedAt, retry],
  );
}

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

export function availableSorts(rows: IntelEvent[]): IntelSort[] {
  const hasMovement = rows.some(
    (r) => r.publicStatus === "verified_b2" && r.isCurrent && r.delta !== null && r.delta !== 0,
  );
  return hasMovement ? ["risk", "newest", "moving"] : ["risk", "newest"];
}

export function prettyCategory(category: string): string {
  return category
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
