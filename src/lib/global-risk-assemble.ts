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
  RiskDomainKey,
  RiskDomainReading,
  RiskDriver,
  RiskRow,
  Timeframe,
  TimeframeSeries,
} from "./global-risk.types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DOMAIN_KEYS: RiskDomainKey[] = ["geopolitics", "macro", "rare_earth"];

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

type CategoryReading = {
  score: number;
  confidence: number | null;
  eventCount: number;
  sourceCount: number;
  storyCount: number;
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

function timeframeStart(timeframe: Timeframe, latestAt: number): number {
  const windows: Record<Timeframe, number> = {
    "24H": DAY,
    "7D": 7 * DAY,
    "30D": 30 * DAY,
  };
  return latestAt - windows[timeframe];
}

function seriesForSnapshots(
  rows: SnapshotRow[],
  timeframe: Timeframe,
  latestAt: number,
): TimeframeSeries {
  const start = timeframeStart(timeframe, latestAt);
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

function categoryReading(snapshot: SnapshotRow, domain: RiskDomainKey): CategoryReading | null {
  if (!Array.isArray(snapshot.category_breakdown)) return null;
  const record = (snapshot.category_breakdown as Array<Record<string, unknown>>).find(
    (category) => String(category.category ?? "") === domain,
  );
  if (!record) return null;

  const score = n(record.score as number | string | null);
  const confidence = n(record.confidence as number | string | null);
  const eventCount = Number(record.eventCount);
  const sourceCount = Number(record.sourceCount);
  const storyCount = Number(record.storyCount);
  if (
    score === null ||
    score < 0 ||
    score > 100 ||
    !Number.isInteger(eventCount) ||
    eventCount < 1 ||
    !Number.isInteger(sourceCount) ||
    sourceCount < 1 ||
    !Number.isInteger(storyCount) ||
    storyCount < 1 ||
    storyCount > eventCount
  ) {
    return null;
  }
  return {
    score,
    confidence:
      confidence !== null && confidence >= 0 && confidence <= 100 ? confidence : null,
    eventCount,
    sourceCount,
    storyCount,
  };
}

function seriesForDomain(
  rows: SnapshotRow[],
  domain: RiskDomainKey,
  timeframe: Timeframe,
  readingAt: number,
): TimeframeSeries {
  const start = timeframeStart(timeframe, readingAt);
  const buckets: Bucket[] = [];
  for (const row of rows) {
    if (row.verification_status !== "verified") continue;
    const t = new Date(row.as_of).getTime();
    if (!Number.isFinite(t) || t < start || t > readingAt) continue;
    const reading = categoryReading(row, domain);
    if (!reading) continue;
    buckets.push({ t, avg: reading.score, count: reading.eventCount });
  }
  buckets.sort((a, b) => a.t - b.t);
  return finishSeries(timeframe, buckets);
}

function domainReading(
  snapshots: SnapshotRow[],
  domain: RiskDomainKey,
  latestAt: number,
): RiskDomainReading | null {
  const currentIndex = snapshots.findIndex(
    (snapshot) =>
      snapshot.verification_status === "verified" && categoryReading(snapshot, domain) !== null,
  );
  if (currentIndex < 0) return null;

  const currentSnapshot = snapshots[currentIndex];
  const current = categoryReading(currentSnapshot, domain);
  if (!current) return null;
  const readingAt = new Date(currentSnapshot.as_of).getTime();
  if (!Number.isFinite(readingAt) || readingAt > latestAt + 1_000) return null;

  const previousEntry = snapshots
    .slice(currentIndex + 1)
    .filter((snapshot) => snapshot.verification_status === "verified")
    .map((snapshot) => ({ snapshot, reading: categoryReading(snapshot, domain) }))
    .find((entry): entry is { snapshot: SnapshotRow; reading: CategoryReading } => entry.reading !== null) ?? null;

  return {
    score: Math.round(current.score),
    rawScore: current.score,
    previousScore: previousEntry?.reading.score ?? null,
    changePoints: previousEntry ? current.score - previousEntry.reading.score : null,
    confidence: current.confidence,
    eventCount: current.eventCount,
    sourceCount: current.sourceCount,
    independentStoryCount: current.storyCount,
    readingSnapshotId: currentSnapshot.id,
    readingAsOf: currentSnapshot.as_of,
    readingStatus: currentIndex === 0 ? "current" : "last_verified",
    series: {
      "24H": seriesForDomain(snapshots, domain, "24H", readingAt),
      "7D": seriesForDomain(snapshots, domain, "7D", readingAt),
      "30D": seriesForDomain(snapshots, domain, "30D", readingAt),
    },
  };
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
  const domainIndices = Object.fromEntries(
    DOMAIN_KEYS.map((domain) => [domain, domainReading(snapshots, domain, latestAt)]),
  ) as Record<RiskDomainKey, RiskDomainReading | null>;
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
    domainIndices,
    drivers,
    topDriver: drivers[0] ?? null,
    recentEvents,
  };
}
