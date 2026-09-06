// LEGACY AUDIT IMPLEMENTATION.
// Retained to reproduce historical gri-v1.0.0 artifacts only.
// Production publication, replay, validation and verification use gri-v1.1.0.
//
// /**
 * Geomacro Global Risk Index (GRI) — canonical deterministic engine.
 *
 * Methodology v1.0.0 principles:
 * - severity is the risk signal (0..100)
 * - confidence and recency determine evidence weight, never the severity itself
 * - each source has a capped evidence budget so article volume cannot dominate
 * - four product domains have equal base weight; missing domains are excluded,
 *   not treated as zero risk, and coverage is disclosed separately
 * - all timestamps use observed_at/created_at so late ingestion never backdates
 *   what Geomacro knew at an earlier snapshot
 */

export const GRI_METHOD_VERSION = "gri-v1.0.0";
export const GRI_CATEGORIES = ["geopolitics", "macro", "rare_earth", "crypto"];
export const GRI_LOOKBACK_HOURS = 72;
export const GRI_HALF_LIFE_HOURS = 24;
export const GRI_SOURCE_WEIGHT_CAP = 1;
// Publication/read-model safety policy, not part of the score formula hash.
export const GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS = 3;

export const GRI_METHOD = Object.freeze({
  version: GRI_METHOD_VERSION,
  scoreScale: [0, 100],
  categories: Object.freeze({
    geopolitics: 0.25,
    macro: 0.25,
    rare_earth: 0.25,
    crypto: 0.25,
  }),
  lookbackHours: GRI_LOOKBACK_HOURS,
  halfLifeHours: GRI_HALF_LIFE_HOURS,
  sourceWeightCap: GRI_SOURCE_WEIGHT_CAP,
  eventWeight: "(confidence / 100) * 2^(-ageHours / 24)",
  sourceRule:
    "Within each category, a source receives at most 1.0 total evidence weight; its events share that budget in proportion to event weight.",
  categoryRule:
    "Category score is the source-capped weighted mean of event severity. Active category base weights are renormalized; missing categories are excluded and disclosed through coverage.",
  globalRule:
    "GRI = sum(activeCategoryNormalizedWeight * categoryScore). Display score = round(GRI).",
  timeRule:
    "created_at/observed_at is the canonical observation timestamp. published_at is provenance only and cannot backdate a snapshot.",
});

const EPS = 1e-12;

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isoMs(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function stableSource(row) {
  const domain =
    typeof row.source_domain === "string" ? row.source_domain.trim().toLowerCase() : "";
  if (domain) return domain;
  const name = typeof row.source_name === "string" ? row.source_name.trim().toLowerCase() : "";
  if (name) return name;
  try {
    return (
      new URL(row.source_url ?? "").hostname.toLowerCase().replace(/^www\./, "") || "unknown-source"
    );
  } catch {
    return "unknown-source";
  }
}

function stableId(row) {
  if (row.id !== null && row.id !== undefined && String(row.id).trim()) return String(row.id);
  return `${stableSource(row)}|${row.source_url ?? ""}|${row.created_at ?? row.observed_at ?? ""}`;
}

/** Stable JSON serialization for hashes/manifests. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

export function methodologyManifest() {
  return JSON.parse(JSON.stringify(GRI_METHOD));
}

/**
 * Normalize and filter one raw event for a particular as-of time.
 * Returns null if the row is not eligible for GRI v1.
 */
export function normalizeGriEvent(row, asOfMs) {
  const category = typeof row.category === "string" ? row.category.trim().toLowerCase() : "";
  if (!GRI_CATEGORIES.includes(category)) return null;

  const severity = finiteNumber(row.severity);
  const confidence = finiteNumber(row.confidence);
  if (severity === null || confidence === null) return null;
  if (severity < 0 || severity > 100 || confidence <= 0 || confidence > 100) return null;

  const observedAt = row.created_at ?? row.observed_at;
  const observedMs = isoMs(observedAt);
  if (observedMs === null || observedMs > asOfMs) return null;

  const ageHours = (asOfMs - observedMs) / 3_600_000;
  if (ageHours < 0 || ageHours > GRI_LOOKBACK_HOURS) return null;

  const confidenceWeight = clamp(confidence / 100, 0, 1);
  const decayWeight = 2 ** (-ageHours / GRI_HALF_LIFE_HOURS);
  const rawWeight = confidenceWeight * decayWeight;
  if (!(rawWeight > 0)) return null;

  return {
    eventId: stableId(row),
    category,
    sourceKey: stableSource(row),
    sourceName: row.source_name ?? null,
    sourceDomain: row.source_domain ?? null,
    sourceUrl: row.source_url ?? null,
    sourceTitle: row.source_title ?? row.title ?? null,
    summary: row.summary ?? null,
    severity,
    confidence,
    observedAt: new Date(observedMs).toISOString(),
    publishedAt: row.published_at ?? null,
    ageHours,
    confidenceWeight,
    decayWeight,
    rawWeight,
    classificationProvider: row.classification_provider ?? null,
    classificationModel: row.classification_model ?? null,
    classificationVersion: row.classification_version ?? null,
    classificationPromptVersion: row.classification_prompt_version ?? null,
    classificationScoredAt: row.classification_scored_at ?? null,
    classificationInputHash: row.classification_input_hash ?? null,
  };
}

/**
 * Compute one complete, auditable GRI snapshot.
 * Every returned event has an exact contributionPoints value and those values
 * sum to rawScore (within floating point tolerance).
 */
export function calculateGri(rows, asOf = new Date()) {
  const asOfMs = typeof asOf === "number" ? asOf : new Date(asOf).getTime();
  if (!Number.isFinite(asOfMs)) throw new Error("Invalid GRI asOf timestamp");

  const eligible = rows
    .map((row) => normalizeGriEvent(row, asOfMs))
    .filter(Boolean)
    .sort((a, b) => a.eventId.localeCompare(b.eventId));

  const byCategory = new Map();
  for (const event of eligible) {
    const list = byCategory.get(event.category) ?? [];
    list.push(event);
    byCategory.set(event.category, list);
  }

  const activeCategories = GRI_CATEGORIES.filter((c) => (byCategory.get(c)?.length ?? 0) > 0);
  const activeBaseWeight = activeCategories.reduce((sum, c) => sum + GRI_METHOD.categories[c], 0);
  if (activeCategories.length === 0 || activeBaseWeight <= EPS) {
    return {
      methodologyVersion: GRI_METHOD_VERSION,
      asOf: new Date(asOfMs).toISOString(),
      rawScore: null,
      displayScore: null,
      coverage: 0,
      activeCategories: [],
      eventCount: 0,
      sourceCount: 0,
      weightedConfidence: null,
      categories: [],
      contributions: [],
      inputRows: [],
    };
  }

  const categories = [];
  const contributions = [];
  let globalConfidenceNumerator = 0;
  let globalConfidenceDenominator = 0;

  for (const category of activeCategories) {
    const events = byCategory.get(category);
    const sources = new Map();
    for (const event of events) {
      const list = sources.get(event.sourceKey) ?? [];
      list.push(event);
      sources.set(event.sourceKey, list);
    }

    const sourceParts = [];
    let categoryEffectiveWeight = 0;
    for (const [sourceKey, sourceEvents] of [...sources.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const sourceRawWeight = sourceEvents.reduce((sum, e) => sum + e.rawWeight, 0);
      const sourceEffectiveWeight = Math.min(GRI_SOURCE_WEIGHT_CAP, sourceRawWeight);
      if (sourceRawWeight <= EPS || sourceEffectiveWeight <= EPS) continue;
      categoryEffectiveWeight += sourceEffectiveWeight;
      sourceParts.push({ sourceKey, sourceEvents, sourceRawWeight, sourceEffectiveWeight });
    }
    if (categoryEffectiveWeight <= EPS) continue;

    let categorySeverityNumerator = 0;
    let categoryConfidenceNumerator = 0;
    const eventParts = [];
    for (const part of sourceParts) {
      for (const event of part.sourceEvents) {
        const withinSourceShare = event.rawWeight / part.sourceRawWeight;
        const effectiveEventWeight = part.sourceEffectiveWeight * withinSourceShare;
        categorySeverityNumerator += event.severity * effectiveEventWeight;
        categoryConfidenceNumerator += event.confidence * effectiveEventWeight;
        eventParts.push({
          ...event,
          effectiveEventWeight,
          sourceEffectiveWeight: part.sourceEffectiveWeight,
        });
      }
    }

    const categoryScore = categorySeverityNumerator / categoryEffectiveWeight;
    const categoryConfidence = categoryConfidenceNumerator / categoryEffectiveWeight;
    const normalizedCategoryWeight = GRI_METHOD.categories[category] / activeBaseWeight;
    const categoryContributionPoints = normalizedCategoryWeight * categoryScore;

    const categoryContribs = eventParts.map((event) => {
      const withinCategoryShare = event.effectiveEventWeight / categoryEffectiveWeight;
      const globalShare = normalizedCategoryWeight * withinCategoryShare;
      const contributionPoints = globalShare * event.severity;
      globalConfidenceNumerator += globalShare * event.confidence;
      globalConfidenceDenominator += globalShare;
      return {
        ...event,
        categoryEffectiveWeight,
        normalizedCategoryWeight,
        withinCategoryShare,
        globalShare,
        contributionPoints,
      };
    });
    contributions.push(...categoryContribs);

    categories.push({
      category,
      baseWeight: GRI_METHOD.categories[category],
      normalizedWeight: normalizedCategoryWeight,
      score: categoryScore,
      contributionPoints: categoryContributionPoints,
      confidence: categoryConfidence,
      eventCount: events.length,
      sourceCount: sources.size,
      effectiveWeight: categoryEffectiveWeight,
    });
  }

  const rawScore = categories.reduce((sum, c) => sum + c.contributionPoints, 0);
  const sourceCount = new Set(eligible.map((e) => e.sourceKey)).size;
  const coverage = activeCategories.reduce((sum, c) => sum + GRI_METHOD.categories[c], 0);

  const inputRows = eligible.map((e) => ({
    eventId: e.eventId,
    category: e.category,
    sourceKey: e.sourceKey,
    severity: e.severity,
    confidence: e.confidence,
    observedAt: e.observedAt,
    publishedAt: e.publishedAt,
    classificationProvider: e.classificationProvider,
    classificationModel: e.classificationModel,
    classificationVersion: e.classificationVersion,
    classificationPromptVersion: e.classificationPromptVersion,
    classificationScoredAt: e.classificationScoredAt,
    classificationInputHash: e.classificationInputHash,
  }));

  return {
    methodologyVersion: GRI_METHOD_VERSION,
    asOf: new Date(asOfMs).toISOString(),
    rawScore,
    displayScore: Math.round(rawScore),
    coverage,
    activeCategories,
    eventCount: eligible.length,
    sourceCount,
    weightedConfidence:
      globalConfidenceDenominator > EPS
        ? globalConfidenceNumerator / globalConfidenceDenominator
        : null,
    categories: categories.sort((a, b) => b.contributionPoints - a.contributionPoints),
    contributions: contributions.sort(
      (a, b) => Math.abs(b.contributionPoints) - Math.abs(a.contributionPoints),
    ),
    inputRows,
  };
}

/** Exact score-change decomposition. Deltas of event contribution sum to raw delta. */
export function attributeGriChange(previous, current) {
  if (previous?.rawScore === null || current?.rawScore === null) {
    return null;
  }

  const prevCats = new Map((previous.categories ?? []).map((c) => [c.category, c]));
  const currCats = new Map((current.categories ?? []).map((c) => [c.category, c]));
  const categoryChanges = GRI_CATEGORIES.map((category) => {
    const p = prevCats.get(category);
    const c = currCats.get(category);
    const previousContribution = p?.contributionPoints ?? 0;
    const currentContribution = c?.contributionPoints ?? 0;
    return {
      category,
      previousScore: p?.score ?? null,
      currentScore: c?.score ?? null,
      previousNormalizedWeight: p?.normalizedWeight ?? 0,
      currentNormalizedWeight: c?.normalizedWeight ?? 0,
      previousContribution,
      currentContribution,
      deltaPoints: currentContribution - previousContribution,
    };
  }).sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints));

  const prevEvents = new Map((previous.contributions ?? []).map((e) => [e.eventId, e]));
  const currEvents = new Map((current.contributions ?? []).map((e) => [e.eventId, e]));
  const ids = [...new Set([...prevEvents.keys(), ...currEvents.keys()])].sort();
  const eventChanges = ids
    .map((eventId) => {
      const p = prevEvents.get(eventId);
      const c = currEvents.get(eventId);
      const previousContribution = p?.contributionPoints ?? 0;
      const currentContribution = c?.contributionPoints ?? 0;
      let kind = "reweighted";
      if (!p && c) kind = "added";
      else if (p && !c) kind = "removed";
      else if (p && c && Math.abs((p.severity ?? 0) - (c.severity ?? 0)) > EPS) kind = "rescored";
      return {
        eventId,
        kind,
        category: c?.category ?? p?.category ?? null,
        sourceTitle: c?.sourceTitle ?? p?.sourceTitle ?? null,
        sourceUrl: c?.sourceUrl ?? p?.sourceUrl ?? null,
        previousSeverity: p?.severity ?? null,
        currentSeverity: c?.severity ?? null,
        previousContribution,
        currentContribution,
        deltaPoints: currentContribution - previousContribution,
      };
    })
    .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints));

  const rawDelta = current.rawScore - previous.rawScore;
  const eventDeltaSum = eventChanges.reduce((sum, e) => sum + e.deltaPoints, 0);
  return {
    previousAsOf: previous.asOf,
    currentAsOf: current.asOf,
    previousRawScore: previous.rawScore,
    currentRawScore: current.rawScore,
    previousDisplayScore: previous.displayScore,
    currentDisplayScore: current.displayScore,
    rawDelta,
    displayDelta: current.displayScore - previous.displayScore,
    coverageDelta: current.coverage - previous.coverage,
    eventCountDelta: current.eventCount - previous.eventCount,
    sourceCountDelta: current.sourceCount - previous.sourceCount,
    categoryChanges,
    eventChanges,
    residual: rawDelta - eventDeltaSum,
  };
}
