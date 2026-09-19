import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const METHOD_VERSION = "gri-v1.2.0"
const PROOF_VERSION = "gri-proof-v1.2.0"
const STORY_VERSION = "story-correlation-v1.0.0"
const STORY_PROMPT_VERSION = "story-match-title-v1.0.0"
const CONTRACT_VERSION = "risk-indices-v1.1.0"
const LOOKBACK_HOURS = 72
const SNAPSHOT_RETENTION_DAYS = 91
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const FUTURE_TOLERANCE_MS = 15 * 60 * 1000

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const INDEX_SPECS = [
  {
    key: "geopolitics",
    name: "Geopolitical Risk Index",
    sourceCategory: "geopolitics",
  },
  {
    key: "macro",
    name: "Macroeconomic Risk Index",
    sourceCategory: "macro",
  },
  {
    key: "critical_minerals",
    name: "Critical Minerals Risk Index",
    sourceCategory: "rare_earth",
  },
] as const

type AnyRow = Record<string, unknown>
type Timeframe = "24H" | "7D" | "30D"

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function object(value: unknown): AnyRow | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AnyRow
    : null
}

function arrayOfObjects(value: unknown): AnyRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is AnyRow => Boolean(object(item)))
    : []
}

function isHash(value: unknown) {
  return /^[a-f0-9]{64}$/.test(String(value ?? ""))
}

function responseHeaders(cache = false) {
  return {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cache
      ? "public, max-age=60, stale-while-revalidate=300"
      : "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "x-content-type-options": "nosniff",
  }
}

function json(status: number, body: unknown, cache = false) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(cache),
  })
}

function categoryRows(snapshot: AnyRow) {
  return arrayOfObjects(snapshot.category_breakdown)
}

function categoryByName(snapshot: AnyRow, category: string) {
  return categoryRows(snapshot).find(
    (row) => String(row.category ?? "") === category,
  ) ?? null
}

function categoryChanges(snapshot: AnyRow) {
  const attribution = object(snapshot.change_attribution)
  return arrayOfObjects(attribution?.categoryChanges)
}

function categoryChangeByName(snapshot: AnyRow, category: string) {
  return categoryChanges(snapshot).find(
    (row) => String(row.category ?? "") === category,
  ) ?? null
}

function topEventFor(snapshot: AnyRow, category: string) {
  const explanation = object(snapshot.explanation)
  const how = object(explanation?.how)
  const events = arrayOfObjects(how?.topCurrentEvents)
  const found = events.find((event) => String(event.category ?? "") === category)
  if (!found) return null

  const title = String(found.sourceTitle ?? "").trim()
  if (!title) return null

  return {
    title,
    summary: typeof found.summary === "string" ? found.summary : null,
    severity: num(found.severity),
  }
}

function finishSeries(timeframe: Timeframe, buckets: Array<{ t: number; avg: number; count: number }>) {
  if (buckets.length < 2) {
    return { timeframe, buckets: null, low: null, high: null }
  }
  const values = buckets.map((bucket) => bucket.avg)
  return {
    timeframe,
    buckets,
    low: Math.min(...values),
    high: Math.max(...values),
  }
}

function globalSeries(snapshots: AnyRow[], timeframe: Timeframe, latestAt: number) {
  const width = timeframe === "24H" ? DAY : timeframe === "7D" ? 7 * DAY : 30 * DAY
  const start = latestAt - width
  const buckets = snapshots
    .map((snapshot) => ({
      t: Date.parse(String(snapshot.as_of ?? "")),
      avg: num(snapshot.display_score),
      count: Math.max(0, Number(snapshot.event_count ?? 0)),
    }))
    .filter((row): row is { t: number; avg: number; count: number } =>
      Number.isFinite(row.t) && row.t >= start && row.t <= latestAt && row.avg !== null
    )
    .sort((a, b) => a.t - b.t)
  return finishSeries(timeframe, buckets)
}

function indexSeries(
  snapshots: AnyRow[],
  category: string,
  timeframe: Timeframe,
  latestAt: number,
) {
  const width = timeframe === "24H" ? DAY : timeframe === "7D" ? 7 * DAY : 30 * DAY
  const start = latestAt - width
  const buckets = snapshots
    .map((snapshot) => {
      const categoryRow = categoryByName(snapshot, category)
      return {
        t: Date.parse(String(snapshot.as_of ?? "")),
        avg: num(categoryRow?.score),
        count: Math.max(0, Number(categoryRow?.eventCount ?? 0)),
      }
    })
    .filter((row): row is { t: number; avg: number; count: number } =>
      Number.isFinite(row.t) && row.t >= start && row.t <= latestAt && row.avg !== null
    )
    .sort((a, b) => a.t - b.t)
  return finishSeries(timeframe, buckets)
}

function latestVerifiedCategorySnapshot(
  snapshots: AnyRow[],
  category: string,
): { snapshot: AnyRow; categoryRow: AnyRow } | null {
  for (const snapshot of snapshots) {
    const categoryRow = categoryByName(snapshot, category)
    if (num(categoryRow?.score) !== null) {
      return { snapshot, categoryRow: categoryRow as AnyRow }
    }
  }
  return null
}

function verifySnapshot(snapshot: AnyRow, now: number) {
  const latestAt = Date.parse(String(snapshot.as_of ?? ""))
  const reconciliationResidual = num(snapshot.reconciliation_residual)
  const changeResidual = num(snapshot.change_residual)
  const candidateEventCount = Number(snapshot.candidate_event_count)
  const eventCount = Number(snapshot.event_count)
  const storyCount = Number(snapshot.independent_story_count)

  if (!Number.isFinite(latestAt) || latestAt > now + FUTURE_TOLERANCE_MS) {
    throw new Error("snapshot_timestamp_invalid")
  }
  if (snapshot.methodology_version !== METHOD_VERSION) throw new Error("methodology_mismatch")
  if (snapshot.proof_version !== PROOF_VERSION) throw new Error("proof_version_mismatch")
  if (snapshot.verification_status !== "verified") throw new Error("snapshot_not_verified")
  if (snapshot.story_correlation_version !== STORY_VERSION) throw new Error("story_version_mismatch")
  if (snapshot.story_correlation_prompt_version !== STORY_PROMPT_VERSION) throw new Error("story_prompt_mismatch")
  if (!Number.isInteger(eventCount) || eventCount <= 0) throw new Error("event_count_invalid")
  if (!Number.isInteger(storyCount) || storyCount <= 0 || storyCount > eventCount) {
    throw new Error("story_count_invalid")
  }
  if (!Number.isInteger(candidateEventCount) || candidateEventCount < eventCount) {
    throw new Error("candidate_count_invalid")
  }
  for (const key of [
    "methodology_hash",
    "input_hash",
    "evidence_hash",
    "calculation_hash",
    "disposition_hash",
    "proof_hash",
  ]) {
    if (!isHash(snapshot[key])) throw new Error(`${key}_invalid`)
  }
  if (reconciliationResidual !== null && Math.abs(reconciliationResidual) > 1e-7) {
    throw new Error("reconciliation_residual_invalid")
  }
  if (changeResidual !== null && Math.abs(changeResidual) > 1e-7) {
    throw new Error("change_residual_invalid")
  }
  if (num(snapshot.raw_score) === null || num(snapshot.display_score) === null) {
    throw new Error("score_missing")
  }

  return {
    latestAt,
    reconciliationResidual,
    changeResidual,
    candidateEventCount,
  }
}

function buildIndices(snapshots: AnyRow[], latest: AnyRow, latestAt: number) {
  return INDEX_SPECS.map((spec) => {
    const reading = latestVerifiedCategorySnapshot(snapshots, spec.sourceCategory)
    const readingSnapshot = reading?.snapshot ?? null
    const current = reading?.categoryRow ?? null
    const storedChange = readingSnapshot
      ? categoryChangeByName(readingSnapshot, spec.sourceCategory)
      : null
    const rawScore = num(current?.score)
    const previousScore = num(storedChange?.previousScore)
    const currentForChange = num(storedChange?.currentScore) ?? rawScore
    const readingAt = readingSnapshot
      ? Date.parse(String(readingSnapshot.as_of ?? ""))
      : NaN
    const readingAgeHours = Number.isFinite(readingAt)
      ? Math.max(0, (latestAt - readingAt) / HOUR)
      : null

    return {
      key: spec.key,
      name: spec.name,
      sourceCategory: spec.sourceCategory,
      status: rawScore === null ? "unavailable" : "available",
      readingStatus:
        rawScore === null
          ? "last_verified"
          : readingSnapshot?.id === latest.id
            ? "current"
            : "last_verified",
      readingSnapshotId: rawScore === null ? null : String(readingSnapshot?.id ?? ""),
      readingAsOf: rawScore === null ? null : String(readingSnapshot?.as_of ?? ""),
      readingAgeHours: rawScore === null ? null : readingAgeHours,
      score: rawScore === null ? null : Math.round(rawScore),
      rawScore,
      previousScore,
      // A standalone index delta is score-to-score. It is deliberately not
      // the old combined-GRI category contribution-point delta.
      changePoints:
        currentForChange !== null && previousScore !== null
          ? currentForChange - previousScore
          : null,
      confidence: num(current?.confidence),
      eventCount: Math.max(0, Number(current?.eventCount ?? 0)),
      sourceCount: Math.max(0, Number(current?.sourceCount ?? 0)),
      independentStoryCount: Math.max(0, Number(current?.storyCount ?? 0)),
      series: {
        "24H": indexSeries(snapshots, spec.sourceCategory, "24H", latestAt),
        "7D": indexSeries(snapshots, spec.sourceCategory, "7D", latestAt),
        "30D": indexSeries(snapshots, spec.sourceCategory, "30D", latestAt),
      },
      topEvent: readingSnapshot
        ? topEventFor(readingSnapshot, spec.sourceCategory)
        : null,
    }
  })
}

function buildLegacyDrivers(latest: AnyRow) {
  return categoryRows(latest)
    .map((row) => {
      const category = String(row.category ?? "")
      const change = categoryChangeByName(latest, category)
      return {
        category,
        score: Math.round(num(row.score) ?? 0),
        change: num(change?.deltaPoints),
        contribution: num(row.normalizedWeight) ?? 0,
        topEvent: topEventFor(latest, category),
      }
    })
    .filter((row) => row.category.length > 0)
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) || b.contribution - a.contribution)
}

async function loadRecentEvents(now: number) {
  const since = new Date(now - LOOKBACK_HOURS * HOUR).toISOString()
  const { data, error } = await db
    .from("events")
    .select(
      "id,source_title,summary,category,severity,confidence,delta,created_at,published_at,classification_provider,classification_model,classification_version,classification_prompt_version,classification_input_hash,market_created",
    )
    .in("category", ["geopolitics", "macro", "rare_earth"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(24)

  if (error) {
    console.error("[public-risk-indices] recent event read failed", error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    ...row,
    source_name: null,
    source_domain: null,
    source_url: null,
  }))
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(false) })
  }
  if (request.method !== "GET") return json(405, { ok: false, code: "method_not_allowed" })
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(503, { ok: false, code: "risk_indices_unavailable" })
  }

  const now = Date.now()
  const since = new Date(now - SNAPSHOT_RETENTION_DAYS * DAY).toISOString()
  const { data, error } = await db
    .from("gri_snapshots")
    .select(
      "id,as_of,methodology_version,methodology_hash,input_hash,evidence_hash,calculation_hash,disposition_hash,candidate_event_count,proof_version,proof_hash,verification_status,reconciliation_residual,change_residual,raw_score,display_score,coverage,weighted_confidence,active_categories,event_count,source_count,independent_story_count,story_correlation_version,story_correlation_prompt_version,category_breakdown,previous_as_of,previous_raw_score,previous_display_score,change_points,change_hash,change_attribution,explanation,status",
    )
    .eq("status", "published")
    .eq("methodology_version", METHOD_VERSION)
    .gte("as_of", since)
    .order("as_of", { ascending: false })
    .limit(1000)

  if (error || !data?.length) {
    if (error) console.error("[public-risk-indices] snapshot read failed", error.message)
    return json(503, { ok: false, code: "risk_indices_unavailable" })
  }

  try {
    const snapshots = data as AnyRow[]
    const latest = snapshots[0]
    const verified = verifySnapshot(latest, now)
    const indices = buildIndices(snapshots, latest, verified.latestAt)
    const drivers = buildLegacyDrivers(latest)
    const recentEvents = await loadRecentEvents(now)

    const publicIndices = {
      contractVersion: CONTRACT_VERSION,
      parentMethodologyVersion: String(latest.methodology_version),
      proofVersion: String(latest.proof_version),
      proofScope: "verified-category-projection",
      snapshotId: String(latest.id),
      snapshotAsOf: String(latest.as_of),
      verificationStatus: "verified",
      proofHash: String(latest.proof_hash),
      evidenceHash: String(latest.evidence_hash),
      calculationHash: String(latest.calculation_hash),
      dispositionHash: String(latest.disposition_hash),
      inputHash: String(latest.input_hash),
      methodologyHash: String(latest.methodology_hash),
      changeHash: latest.change_hash ? String(latest.change_hash) : null,
      candidateEventCount: verified.candidateEventCount,
      reconciliationResidual: verified.reconciliationResidual,
      changeResidual: verified.changeResidual,
      indices,
    }

    // Transitional compatibility for current homepage/institutional/agent-facing
    // readers. Public product surfaces can migrate to `indices` without making
    // availability depend on Lovable/SSR database-secret injection.
    const legacyGlobalRisk = {
      snapshotId: String(latest.id),
      score: Number(latest.display_score),
      rawScore: Number(latest.raw_score),
      previous: num(latest.previous_display_score),
      previousRaw: num(latest.previous_raw_score),
      low: globalSeries(snapshots, "24H", verified.latestAt).low,
      high: globalSeries(snapshots, "24H", verified.latestAt).high,
      eventCount: Number(latest.event_count),
      eventCountPrevious: null,
      sourceCount: Number(latest.source_count) || null,
      independentStoryCount: Number(latest.independent_story_count),
      storyCorrelationVersion: String(latest.story_correlation_version),
      storyCorrelationPromptVersion: String(latest.story_correlation_prompt_version),
      coverage: num(latest.coverage) ?? 0,
      weightedConfidence: num(latest.weighted_confidence),
      methodologyVersion: String(latest.methodology_version),
      auditPersisted: true,
      proofVersion: String(latest.proof_version),
      verificationStatus: String(latest.verification_status),
      proofHash: String(latest.proof_hash),
      evidenceHash: String(latest.evidence_hash),
      calculationHash: String(latest.calculation_hash),
      dispositionHash: String(latest.disposition_hash),
      candidateEventCount: verified.candidateEventCount,
      inputHash: String(latest.input_hash),
      methodologyHash: String(latest.methodology_hash),
      changeHash: latest.change_hash ? String(latest.change_hash) : null,
      reconciliationResidual: verified.reconciliationResidual,
      changeResidual: verified.changeResidual,
      snapshotAsOf: String(latest.as_of),
      usedFallbackWindow: false,
      series: {
        "24H": globalSeries(snapshots, "24H", verified.latestAt),
        "7D": globalSeries(snapshots, "7D", verified.latestAt),
        "30D": globalSeries(snapshots, "30D", verified.latestAt),
      },
      drivers,
      topDriver: drivers[0] ?? null,
      recentEvents,
    }

    return json(200, { ok: true, data: publicIndices, legacyGlobalRisk }, true)
  } catch (error) {
    console.error(
      "[public-risk-indices] proof/read contract rejected",
      error instanceof Error ? error.message : error,
    )
    return json(503, { ok: false, code: "risk_indices_unavailable" })
  }
}

Deno.serve(handle)
