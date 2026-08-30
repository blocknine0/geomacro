/**
 * Canonical public read model for every Global Risk Index surface.
 *
 * Production rule:
 * - only immutable, published `gri_snapshots` are authoritative;
 * - every query is pinned to the current methodology version;
 * - there is no client-side score fallback and no synthetic zero;
 * - contribution/evidence rows are not fetched here. They are loaded lazily
 *   only when a user explicitly opens the proof package.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseFeed } from "@/lib/supabase-feed";
import { reportError, type UserError } from "@/lib/user-errors";
import {
  GRI_HALF_LIFE_HOURS,
  GRI_LOOKBACK_HOURS,
  GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS,
  GRI_METHOD_VERSION,
} from "@/lib/gri-engine.js";

export type RiskRow = {
  id: string;
  source_title: string | null;
  summary: string | null;
  category: string | null;
  severity: number | null;
  confidence: number | null;
  delta: number | null;
  source_name: string | null;
  source_domain?: string | null;
  source_url: string | null;
  created_at: string;
  published_at: string | null;
  classification_provider?: string | null;
  classification_model?: string | null;
  classification_version?: string | null;
  classification_prompt_version?: string | null;
  classification_input_hash?: string | null;
  market_created?: boolean | null;
};

export type Bucket = { t: number; avg: number; count: number };
export type Timeframe = "24H" | "7D" | "30D";
export type TimeframeSeries = {
  timeframe: Timeframe;
  buckets: Bucket[] | null;
  low: number | null;
  high: number | null;
};

export type RiskDriver = {
  category: string;
  score: number;
  /** Exact category contribution-point change from the stored attribution. */
  change: number | null;
  /** Normalized category weight in the current GRI, 0-1. */
  contribution: number;
  topEvent: { title: string; summary: string | null; severity: number | null } | null;
};

export type GlobalRisk = {
  snapshotId: string;
  score: number;
  rawScore: number;
  previous: number | null;
  previousRaw: number | null;
  low: number | null;
  high: number | null;
  eventCount: number;
  eventCountPrevious: number | null;
  sourceCount: number | null;
  coverage: number;
  weightedConfidence: number | null;
  methodologyVersion: string;
  auditPersisted: true;
  proofVersion: string | null;
  verificationStatus: string | null;
  proofHash: string | null;
  evidenceHash: string | null;
  calculationHash: string;
  inputHash: string;
  methodologyHash: string;
  changeHash: string | null;
  reconciliationResidual: number | null;
  changeResidual: number | null;
  snapshotAsOf: string;
  usedFallbackWindow: false;
  series: Record<Timeframe, TimeframeSeries>;
  drivers: RiskDriver[];
  topDriver: RiskDriver | null;
  recentEvents: RiskRow[];
};

export type RiskStatus = "loading" | "ready" | "updating" | "error";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const LOOKBACK = GRI_LOOKBACK_HOURS * HOUR;

export const GRI_METHODOLOGY = {
  version: GRI_METHOD_VERSION,
  definition:
    `GRI ${GRI_METHOD_VERSION} is a deterministic source-capped, confidence- and recency-weighted severity index over the trailing ${GRI_LOOKBACK_HOURS} hours.`,
  weighting:
    `Event weight = confidence × exponential recency decay (${GRI_HALF_LIFE_HOURS}h half-life); each source is capped so article volume cannot dominate. Active domains are equally weighted and missing domains are disclosed as coverage, never zero risk.`,
  notProbability: "GRI is an aggregate intelligence signal, not a market probability.",
} as const;

type SnapshotRow = {
  id: string;
  as_of: string;
  methodology_version: string;
  methodology_hash: string;
  input_hash: string;
  evidence_hash: string | null;
  calculation_hash: string;
  proof_version: string | null;
  proof_hash: string | null;
  verification_status: string | null;
  reconciliation_residual: number | string | null;
  change_residual: number | string | null;
  raw_score: number | string | null;
  display_score: number | null;
  coverage: number | string;
  weighted_confidence: number | string | null;
  active_categories: string[] | null;
  event_count: number;
  source_count: number;
  category_breakdown: unknown;
  previous_as_of: string | null;
  previous_raw_score: number | string | null;
  previous_display_score: number | null;
  change_points: number | string | null;
  change_hash: string | null;
  change_attribution: unknown;
  explanation: unknown;
  status: string;
};

function n(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}

function finishSeries(timeframe: Timeframe, buckets: Bucket[]): TimeframeSeries {
  if (buckets.length < 2) return { timeframe, buckets: null, low: null, high: null };
  const values = buckets.map((b) => b.avg);
  return { timeframe, buckets, low: Math.min(...values), high: Math.max(...values) };
}

function seriesForSnapshots(rows: SnapshotRow[], timeframe: Timeframe, latestAt: number): TimeframeSeries {
  const ms: Record<Timeframe, number> = { "24H": DAY, "7D": 7 * DAY, "30D": 30 * DAY };
  const start = latestAt - ms[timeframe];
  const buckets = rows
    .filter((row) => {
      const t = new Date(row.as_of).getTime();
      return Number.isFinite(t) && t >= start && t <= latestAt && typeof row.display_score === "number";
    })
    .map((row) => ({ t: new Date(row.as_of).getTime(), avg: row.display_score as number, count: row.event_count }))
    .sort((a, b) => a.t - b.t);
  return finishSeries(timeframe, buckets);
}

function snapshotDrivers(snapshot: SnapshotRow): RiskDriver[] {
  const categories = Array.isArray(snapshot.category_breakdown)
    ? (snapshot.category_breakdown as Array<Record<string, unknown>>)
    : [];
  const changeObj = snapshot.change_attribution && typeof snapshot.change_attribution === "object"
    ? (snapshot.change_attribution as Record<string, unknown>)
    : null;
  const categoryChanges = Array.isArray(changeObj?.categoryChanges)
    ? (changeObj?.categoryChanges as Array<Record<string, unknown>>)
    : [];
  const changeByCategory = new Map(
    categoryChanges.map((c) => [String(c.category ?? ""), n(c.deltaPoints as number | string | null)]),
  );

  const explanation = snapshot.explanation && typeof snapshot.explanation === "object"
    ? (snapshot.explanation as Record<string, unknown>)
    : null;
  const how = explanation?.how && typeof explanation.how === "object"
    ? (explanation.how as Record<string, unknown>)
    : null;
  const topCurrentEvents = Array.isArray(how?.topCurrentEvents)
    ? (how.topCurrentEvents as Array<Record<string, unknown>>)
    : [];
  const topByCategory = new Map<string, Record<string, unknown>>();
  for (const event of topCurrentEvents) {
    const category = String(event.category ?? "");
    if (category && !topByCategory.has(category)) topByCategory.set(category, event);
  }

  return categories
    .map((c) => {
      const category = String(c.category ?? "");
      const top = topByCategory.get(category);
      return {
        category,
        score: Math.round(Number(c.score ?? 0)),
        change: changeByCategory.get(category) ?? null,
        contribution: Number(c.normalizedWeight ?? 0),
        topEvent: top
          ? {
              title: String(top.sourceTitle ?? "Untitled event"),
              summary: null,
              severity: n(top.severity as number | string | null),
            }
          : null,
      } satisfies RiskDriver;
    })
    .filter((d) => d.category.length > 0)
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) || b.contribution - a.contribution);
}

async function loadRecentEvents(since: string, limit = 24): Promise<RiskRow[]> {
  const { data, error } = await supabaseFeed
    .from("events")
    .select("id,source_title,summary,category,severity,confidence,delta,source_name,source_url,created_at,published_at,market_created")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RiskRow[];
}

export function useGlobalRisk(refreshMs = 5 * 60 * 1000) {
  const [data, setData] = useState<GlobalRisk | null>(null);
  const [status, setStatus] = useState<RiskStatus>("loading");
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
        const snapshotSince = new Date(now - 31 * DAY).toISOString();
        const snapshotResult = await supabaseFeed
          .from("gri_snapshots")
          .select(
            "id,as_of,methodology_version,methodology_hash,input_hash,evidence_hash,calculation_hash,proof_version,proof_hash,verification_status,reconciliation_residual,change_residual,raw_score,display_score,coverage,weighted_confidence,active_categories,event_count,source_count,category_breakdown,previous_as_of,previous_raw_score,previous_display_score,change_points,change_hash,change_attribution,explanation,status",
          )
          .eq("status", "published")
          .eq("methodology_version", GRI_METHOD_VERSION)
          .gte("as_of", snapshotSince)
          .order("as_of", { ascending: false })
          .limit(1000);
        if (snapshotResult.error) throw snapshotResult.error;
        if (!snapshotResult.data?.length) {
          if (cancelled) return;
          hasData.current = false;
          setData(null);
          setStatus("error");
          setError({
            message: "Risk index unavailable: no published, verified snapshot exists for the current methodology.",
            retryable: true,
          });
          setUpdatedAt(null);
          return;
        }

        const snapshots = snapshotResult.data as SnapshotRow[];
        const latest = snapshots[0];
        const latestAt = new Date(latest.as_of).getTime();
        const snapshotAgeHours = Number.isFinite(latestAt) ? (now - latestAt) / HOUR : Number.POSITIVE_INFINITY;
        const reconciliationResidual = n(latest.reconciliation_residual);
        const changeResidual = n(latest.change_residual);
        const proofReady =
          latest.verification_status === "verified" &&
          Boolean(latest.proof_hash && latest.evidence_hash && latest.calculation_hash && latest.input_hash && latest.methodology_hash) &&
          (reconciliationResidual === null || Math.abs(reconciliationResidual) <= 1e-7) &&
          (changeResidual === null || Math.abs(changeResidual) <= 1e-7);

        if (!proofReady) {
          if (cancelled) return;
          hasData.current = false;
          setData(null);
          setStatus("error");
          setError({ message: "Risk index unavailable: the newest canonical snapshot has not passed proof verification.", retryable: true });
          setUpdatedAt(Number.isFinite(latestAt) ? latestAt : null);
          return;
        }

        if (snapshotAgeHours < -0.25 || snapshotAgeHours > GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS) {
          if (cancelled) return;
          hasData.current = false;
          setData(null);
          setStatus("error");
          setError({ message: `Risk index temporarily unavailable: the latest verified snapshot is older than ${GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS} hours.`, retryable: true });
          setUpdatedAt(Number.isFinite(latestAt) ? latestAt : null);
          return;
        }

        if (latest.display_score === null || n(latest.raw_score) === null) {
          if (cancelled) return;
          hasData.current = false;
          setData(null);
          setStatus("error");
          setError({ message: "Risk index unavailable: the latest canonical snapshot has no qualifying score.", retryable: true });
          setUpdatedAt(new Date(latest.as_of).getTime());
          return;
        }

        const recentEvents = await loadRecentEvents(new Date(now - LOOKBACK).toISOString());
        const series: Record<Timeframe, TimeframeSeries> = {
          "24H": seriesForSnapshots(snapshots, "24H", latestAt),
          "7D": seriesForSnapshots(snapshots, "7D", latestAt),
          "30D": seriesForSnapshots(snapshots, "30D", latestAt),
        };
        const active = series["24H"].buckets ? series["24H"] : series["7D"];
        const drivers = snapshotDrivers(latest);
        const rawScore = n(latest.raw_score) as number;

        if (cancelled) return;
        hasData.current = true;
        setData({
          snapshotId: latest.id,
          score: latest.display_score,
          rawScore,
          previous: latest.previous_display_score,
          previousRaw: n(latest.previous_raw_score),
          low: active.low,
          high: active.high,
          eventCount: latest.event_count,
          eventCountPrevious: null,
          sourceCount: latest.source_count || null,
          coverage: n(latest.coverage) ?? 0,
          weightedConfidence: n(latest.weighted_confidence),
          methodologyVersion: latest.methodology_version,
          auditPersisted: true,
          proofVersion: latest.proof_version,
          verificationStatus: latest.verification_status,
          proofHash: latest.proof_hash,
          evidenceHash: latest.evidence_hash,
          calculationHash: latest.calculation_hash,
          inputHash: latest.input_hash,
          methodologyHash: latest.methodology_hash,
          changeHash: latest.change_hash,
          reconciliationResidual,
          changeResidual,
          snapshotAsOf: latest.as_of,
          usedFallbackWindow: false,
          series,
          drivers,
          topDriver: drivers[0] ?? null,
          recentEvents,
        });
        setUpdatedAt(latestAt);
        setError(null);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        hasData.current = false;
        setData(null);
        setError(reportError("useGlobalRisk", e, "loading the canonical global risk index"));
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

  return useMemo(() => ({ data, status, error, updatedAt, retry }), [data, status, error, updatedAt, retry]);
}
