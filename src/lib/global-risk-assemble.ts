import {
  GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS,
  GRI_METHOD_VERSION,
  GRI_PROOF_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
  GRI_STORY_CORRELATION_VERSION,
} from "./gri-current-contract";
import type {
  Bucket,
  GlobalRisk,
  RiskDriver,
  RiskRow,
  Timeframe,
  TimeframeSeries,
} from "./global-risk.types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type SnapshotRow = {
  id: string;
  as_of: string;
  methodology_version: string;
  methodology_hash: string;
  input_hash: string;
  evidence_hash: string | null;
  calculation_hash: string;
  disposition_hash: string | null;
  candidate_event_count: number | null;
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
  independent_story_count: number;
  story_correlation_version: string | null;
  story_correlation_prompt_version: string | null;
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
  const values = buckets.map((bucket) => bucket.avg);
  return { timeframe, buckets, low: Math.min(...values), high: Math.max(...values) };
}

function seriesForSnapshots(
  rows: SnapshotRow[],
  timeframe: Timeframe,
  latestAt: number,
): TimeframeSeries {
  const windows: Record<Timeframe, number> = {
    "24H": DAY,
    "7D": 7 * DAY,
    "30D": 30 * DAY,
  };
  const start = latestAt - windows[timeframe];
  const buckets = rows
    .filter((row) => {
      const t = new Date(row.as_of).getTime();
      return (
        Number.isFinite(t) &&
        t >= start &&
        t <= latestAt &&
        typeof row.display_score === "number"
      );
    })
    .map((row) => ({
      t: new Date(row.as_of).getTime(),
      avg: row.display_score as number,
      count: row.event_count,
    }))
    .sort((a, b) => a.t - b.t);
  return finishSeries(timeframe, buckets);
}

function snapshotDrivers(snapshot: SnapshotRow): RiskDriver[] {
  const categories = Array.isArray(snapshot.category_breakdown)
    ? (snapshot.category_breakdown as Array<Record<string, unknown>>)
    : [];
  const changeObj =
    snapshot.change_attribution && typeof snapshot.change_attribution === "object"
      ? (snapshot.change_attribution as Record<string, unknown>)
      : null;
  const categoryChanges = Array.isArray(changeObj?.categoryChanges)
    ? (changeObj.categoryChanges as Array<Record<string, unknown>>)
    : [];
  const changeByCategory = new Map(
    categoryChanges.map((category) => [
      String(category.category ?? ""),
      n(category.deltaPoints as number | string | null),
    ]),
  );

  const explanation =
    snapshot.explanation && typeof snapshot.explanation === "object"
      ? (snapshot.explanation as Record<string, unknown>)
      : null;
  const how =
    explanation?.how && typeof explanation.how === "object"
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
    .map((category) => {
      const name = String(category.category ?? "");
      const top = topByCategory.get(name);
      return {
        category: name,
        score: Math.round(Number(category.score ?? 0)),
        change: changeByCategory.get(name) ?? null,
        contribution: Number(category.normalizedWeight ?? 0),
        topEvent: top
          ? {
              title: String(top.sourceTitle ?? "Untitled event"),
              summary: typeof top.summary === "string" ? top.summary : null,
              severity: n(top.severity as number | string | null),
            }
          : null,
      } satisfies RiskDriver;
    })
    .filter((driver) => driver.category.length > 0)
    .sort(
      (a, b) =>
        Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) ||
        b.contribution - a.contribution,
    );
}

function normalizeSnapshotOrder(rows: SnapshotRow[]): SnapshotRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.as_of).getTime() - new Date(a.as_of).getTime(),
  );
}

/**
 * One pure canonical assembler for every public Global Risk publication path.
 * Supabase REST, direct Postgres recovery and B2 promotion all call this exact
 * function, so recovery cannot silently change methodology, history windows or
 * proof checks.
 */
export function assemblePublicGlobalRisk(
  snapshotRows: SnapshotRow[],
  recentEvents: RiskRow[],
  now = Date.now(),
): GlobalRisk {
  const snapshots = normalizeSnapshotOrder(snapshotRows).filter(
    (row) => row.status === "published" && row.methodology_version === GRI_METHOD_VERSION,
  );
  if (!snapshots.length) {
    throw new Error("No published verified snapshot exists for the current GRI methodology");
  }

  const latest = snapshots[0];
  const latestAt = new Date(latest.as_of).getTime();
  const snapshotAgeHours = Number.isFinite(latestAt)
    ? (now - latestAt) / HOUR
    : Number.POSITIVE_INFINITY;
  const reconciliationResidual = n(latest.reconciliation_residual);
  const changeResidual = n(latest.change_residual);
  const candidateEventCount = Number(latest.candidate_event_count);

  const proofReady =
    latest.verification_status === "verified" &&
    latest.proof_version === GRI_PROOF_VERSION &&
    latest.story_correlation_version === GRI_STORY_CORRELATION_VERSION &&
    latest.story_correlation_prompt_version === GRI_STORY_CORRELATION_PROMPT_VERSION &&
    Number.isInteger(Number(latest.independent_story_count)) &&
    Number(latest.independent_story_count) > 0 &&
    Number(latest.independent_story_count) <= Number(latest.event_count) &&
    Number.isInteger(candidateEventCount) &&
    candidateEventCount >= Number(latest.event_count) &&
    /^[a-f0-9]{64}$/.test(String(latest.disposition_hash ?? "")) &&
    Boolean(
      latest.proof_hash &&
        latest.evidence_hash &&
        latest.calculation_hash &&
        latest.input_hash &&
        latest.methodology_hash,
    ) &&
    (reconciliationResidual === null || Math.abs(reconciliationResidual) <= 1e-7) &&
    (changeResidual === null || Math.abs(changeResidual) <= 1e-7);

  if (!proofReady) {
    throw new Error("The newest canonical GRI snapshot has not passed proof verification");
  }
  if (
    snapshotAgeHours < -0.25 ||
    snapshotAgeHours > GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS
  ) {
    throw new Error(
      `The latest verified GRI snapshot is older than ${GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS} hours`,
    );
  }

  const rawScore = n(latest.raw_score);
  if (latest.display_score === null || rawScore === null) {
    throw new Error("The latest canonical GRI snapshot has no qualifying score");
  }

  const series: Record<Timeframe, TimeframeSeries> = {
    "24H": seriesForSnapshots(snapshots, "24H", latestAt),
    "7D": seriesForSnapshots(snapshots, "7D", latestAt),
    "30D": seriesForSnapshots(snapshots, "30D", latestAt),
  };
  const active = series["24H"].buckets ? series["24H"] : series["7D"];
  const drivers = snapshotDrivers(latest);

  return {
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
    independentStoryCount: Number(latest.independent_story_count),
    storyCorrelationVersion: latest.story_correlation_version as string,
    storyCorrelationPromptVersion: latest.story_correlation_prompt_version as string,
    coverage: n(latest.coverage) ?? 0,
    weightedConfidence: n(latest.weighted_confidence),
    methodologyVersion: latest.methodology_version,
    auditPersisted: true,
    proofVersion: latest.proof_version,
    verificationStatus: latest.verification_status,
    proofHash: latest.proof_hash,
    evidenceHash: latest.evidence_hash,
    calculationHash: latest.calculation_hash,
    dispositionHash: latest.disposition_hash as string,
    candidateEventCount,
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
  };
}
