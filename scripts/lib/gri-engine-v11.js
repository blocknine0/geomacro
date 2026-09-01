/**
 * Geomacro Global Risk Index (GRI) — canonical deterministic engine.
 *
 * Methodology v1.1.0 principles:
 * - severity is the risk signal (0..100)
 * - confidence and recency determine evidence weight, never the severity itself
 * - each source has a capped evidence budget so article volume cannot dominate
 * - four product domains have equal base weight; missing domains are excluded,
 *   not treated as zero risk, and coverage is disclosed separately
 * - all timestamps use observed_at/created_at so late ingestion never backdates
 *   what Geomacro knew at an earlier snapshot
 */

export const GRI_METHOD_VERSION = "gri-v1.1.0";
export const GRI_CATEGORIES = ["geopolitics", "macro", "rare_earth", "crypto"];
export const GRI_LOOKBACK_HOURS = 72;
export const GRI_HALF_LIFE_HOURS = 24;
export const GRI_SOURCE_WEIGHT_CAP = 1;
export const GRI_STORY_WEIGHT_CAP = 1;
export const GRI_STORY_CORRELATION_VERSION = "story-correlation-v1.0.0";
export const GRI_STORY_CORRELATION_PROMPT_VERSION = "story-match-title-v1.0.0";
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
  storyWeightCap: GRI_STORY_WEIGHT_CAP,
  storyCorrelationVersion: GRI_STORY_CORRELATION_VERSION,
  storyCorrelationPromptVersion: GRI_STORY_CORRELATION_PROMPT_VERSION,
  eventWeight: "(confidence / 100) * 2^(-ageHours / 24)",
  sourceRule:
    "Within each category, a source receives at most 1.0 total evidence weight; its events share that budget in proportion to event weight.",
  storyRule:
    "After source capping, events are grouped by immutable story cluster. For each story, post-source event weights are summed within each source; the story evidence budget equals the strongest constituent source total, capped at 1.0. Member events share that story budget in proportion to their post-source-cap weights. Cross-publisher repetition therefore cannot multiply one underlying development into multiple independent story budgets.",
  categoryRule:
    "Category score is the source-capped and story-capped weighted mean of event severity. Active category base weights are renormalized; missing categories are excluded and disclosed through coverage.",
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

  const storyClusterId =
    typeof row.story_cluster_id === "string"
      ? row.story_cluster_id.trim()
      : "";

  const storyCanonicalLabel =
    typeof row.story_canonical_label === "string"
      ? row.story_canonical_label.trim()
      : "";

  const storyAssignmentDecision =
    typeof row.story_assignment_decision === "string"
      ? row.story_assignment_decision.trim()
      : "";

  const storyDecisionRationale =
    typeof row.story_decision_rationale === "string"
      ? row.story_decision_rationale.trim()
      : "";

  const storyMatchConfidenceRaw =
    row.story_match_confidence === null ||
    row.story_match_confidence === undefined
      ? null
      : finiteNumber(row.story_match_confidence);

  const storyVersion =
    typeof row.story_clustering_version === "string"
      ? row.story_clustering_version.trim()
      : "";

  const storyPromptVersion =
    typeof row.story_clustering_prompt_version === "string"
      ? row.story_clustering_prompt_version.trim()
      : "";

  const storyProvider =
    typeof row.story_clustering_provider === "string"
      ? row.story_clustering_provider.trim()
      : "";

  const storyModel =
    typeof row.story_clustering_model === "string"
      ? row.story_clustering_model.trim()
      : "";

  const storyScoredAt = isoMs(row.story_clustering_scored_at);

  const storyInputHash =
    typeof row.story_clustering_input_hash === "string"
      ? row.story_clustering_input_hash.trim().toLowerCase()
      : "";

  if (!storyClusterId) return null;
  if (!storyCanonicalLabel) return null;
  if (!["anchor", "matched"].includes(storyAssignmentDecision)) return null;
  if (!storyDecisionRationale) return null;
  if (
    storyMatchConfidenceRaw === null ||
    storyMatchConfidenceRaw < 0 ||
    storyMatchConfidenceRaw > 100
  ) {
    return null;
  }

  if (
    storyVersion !== GRI_STORY_CORRELATION_VERSION ||
    storyPromptVersion !== GRI_STORY_CORRELATION_PROMPT_VERSION
  ) {
    return null;
  }

  if (!storyProvider || !storyModel) return null;
  if (storyScoredAt === null) return null;
  if (!/^[0-9a-f]{64}$/.test(storyInputHash)) return null;

  return {
    eventId: stableId(row),
    category,
    sourceKey: stableSource(row),
    sourceName: row.source_name ?? null,
    sourceDomain: row.source_domain ?? null,
    sourceUrl: row.source_url ?? null,
    sourceTitle: row.source_title ?? row.title ?? null,
    summary: row.summary ?? null,

    storyClusterId,
    storyCanonicalLabel,
    storyAssignmentDecision,
    storyMatchConfidence: storyMatchConfidenceRaw,
    storyDecisionRationale,
    storyClusteringProvider: storyProvider,
    storyClusteringModel: storyModel,
    storyClusteringVersion: storyVersion,
    storyClusteringPromptVersion: storyPromptVersion,
    storyClusteringScoredAt: new Date(storyScoredAt).toISOString(),
    storyClusteringInputHash: storyInputHash,
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
  const asOfMs =
    typeof asOf === "number" ? asOf : new Date(asOf).getTime();

  if (!Number.isFinite(asOfMs)) {
    throw new Error("Invalid GRI asOf timestamp");
  }

  const normalizedRows = rows.map((row) =>
    normalizeGriEvent(row, asOfMs)
  );

  const eligible = normalizedRows
    .filter(Boolean)
    .sort((a, b) => a.eventId.localeCompare(b.eventId));

  if (eligible.length !== rows.length) {
    throw new Error(
      `GRI v1.1 fail-closed input rejection: ` +
      `${rows.length - eligible.length} of ${rows.length} supplied event(s) ` +
      `lack complete current classification/story provenance or violate the observation contract.`
    );
  }

  const byCategory = new Map();

  for (const event of eligible) {
    const list = byCategory.get(event.category) ?? [];
    list.push(event);
    byCategory.set(event.category, list);
  }

  const activeCategories = GRI_CATEGORIES.filter(
    (category) => (byCategory.get(category)?.length ?? 0) > 0,
  );

  const activeBaseWeight = activeCategories.reduce(
    (sum, category) => sum + GRI_METHOD.categories[category],
    0,
  );

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
      independentStoryCount: 0,
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
    const events = byCategory.get(category) ?? [];

    // --------------------------------------------------------
    // Stage 1: source cap
    // --------------------------------------------------------

    const sources = new Map();

    for (const event of events) {
      const list = sources.get(event.sourceKey) ?? [];
      list.push(event);
      sources.set(event.sourceKey, list);
    }

    const postSourceEvents = [];

    for (const [sourceKey, sourceEvents] of [...sources.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      const sourceRawWeight = sourceEvents.reduce(
        (sum, event) => sum + event.rawWeight,
        0,
      );

      const sourceEffectiveWeight = Math.min(
        GRI_SOURCE_WEIGHT_CAP,
        sourceRawWeight,
      );

      if (
        sourceRawWeight <= EPS ||
        sourceEffectiveWeight <= EPS
      ) {
        continue;
      }

      for (const event of sourceEvents) {
        const withinSourceShare =
          event.rawWeight / sourceRawWeight;

        const preStoryEventWeight =
          sourceEffectiveWeight * withinSourceShare;

        postSourceEvents.push({
          ...event,
          sourceEffectiveWeight,
          preStoryEventWeight,
        });
      }
    }

    // --------------------------------------------------------
    // Stage 2: immutable story-cluster cap
    // --------------------------------------------------------

    const stories = new Map();

    for (const event of postSourceEvents) {
      const list = stories.get(event.storyClusterId) ?? [];
      list.push(event);
      stories.set(event.storyClusterId, list);
    }

    let categoryEffectiveWeight = 0;
    let categorySeverityNumerator = 0;
    let categoryConfidenceNumerator = 0;

    const eventParts = [];

    for (const [storyClusterId, storyEvents] of [...stories.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      const storyRawWeight = storyEvents.reduce(
        (sum, event) => sum + event.preStoryEventWeight,
        0,
      );

      // Cross-publisher repetition of one underlying development must not
      // create multiple independent evidence budgets. Preserve all articles
      // as provenance, but let the story inherit only the strongest
      // constituent source's post-source-cap support.
      //
      // Same-source repetitions are first combined here because the global
      // source-cap stage has already bounded that source's total influence.
      const storyWeightBySource = new Map();

      for (const event of storyEvents) {
        storyWeightBySource.set(
          event.sourceKey,
          (storyWeightBySource.get(event.sourceKey) ?? 0) +
            event.preStoryEventWeight,
        );
      }

      const storyStrongestSourceWeight = Math.max(
        ...storyWeightBySource.values(),
      );

      const storyEffectiveWeight = Math.min(
        GRI_STORY_WEIGHT_CAP,
        storyStrongestSourceWeight,
      );

      if (
        storyRawWeight <= EPS ||
        storyStrongestSourceWeight <= EPS ||
        storyEffectiveWeight <= EPS
      ) {
        continue;
      }

      categoryEffectiveWeight += storyEffectiveWeight;

      for (const event of storyEvents) {
        const withinStoryShare =
          event.preStoryEventWeight / storyRawWeight;

        const effectiveEventWeight =
          storyEffectiveWeight * withinStoryShare;

        categorySeverityNumerator +=
          event.severity * effectiveEventWeight;

        categoryConfidenceNumerator +=
          event.confidence * effectiveEventWeight;

        eventParts.push({
          ...event,
          storyClusterId,
          storyRawWeight,
          storyStrongestSourceWeight,
          storyEffectiveWeight,
          withinStoryShare,
          effectiveEventWeight,
        });
      }
    }

    if (categoryEffectiveWeight <= EPS) continue;

    const categoryScore =
      categorySeverityNumerator / categoryEffectiveWeight;

    const categoryConfidence =
      categoryConfidenceNumerator / categoryEffectiveWeight;

    const normalizedCategoryWeight =
      GRI_METHOD.categories[category] / activeBaseWeight;

    const categoryContributionPoints =
      normalizedCategoryWeight * categoryScore;

    const categoryContribs = eventParts.map((event) => {
      const withinCategoryShare =
        event.effectiveEventWeight / categoryEffectiveWeight;

      const globalShare =
        normalizedCategoryWeight * withinCategoryShare;

      const contributionPoints =
        globalShare * event.severity;

      globalConfidenceNumerator +=
        globalShare * event.confidence;

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
      storyCount: stories.size,
      effectiveWeight: categoryEffectiveWeight,
    });
  }

  const rawScore = categories.reduce(
    (sum, category) => sum + category.contributionPoints,
    0,
  );

  const sourceCount = new Set(
    eligible.map((event) => event.sourceKey),
  ).size;

  const independentStoryCount = new Set(
    eligible.map((event) => event.storyClusterId),
  ).size;

  const coverage = activeCategories.reduce(
    (sum, category) => sum + GRI_METHOD.categories[category],
    0,
  );

  const inputRows = eligible.map((event) => ({
    eventId: event.eventId,
    category: event.category,
    sourceKey: event.sourceKey,

    storyClusterId: event.storyClusterId,
    storyCanonicalLabel: event.storyCanonicalLabel,
    storyAssignmentDecision: event.storyAssignmentDecision,
    storyMatchConfidence: event.storyMatchConfidence,
    storyDecisionRationale: event.storyDecisionRationale,
    storyClusteringProvider: event.storyClusteringProvider,
    storyClusteringModel: event.storyClusteringModel,
    storyClusteringVersion: event.storyClusteringVersion,
    storyClusteringPromptVersion:
      event.storyClusteringPromptVersion,
    storyClusteringScoredAt: event.storyClusteringScoredAt,
    storyClusteringInputHash: event.storyClusteringInputHash,

    severity: event.severity,
    confidence: event.confidence,
    observedAt: event.observedAt,
    publishedAt: event.publishedAt,

    classificationProvider: event.classificationProvider,
    classificationModel: event.classificationModel,
    classificationVersion: event.classificationVersion,
    classificationPromptVersion:
      event.classificationPromptVersion,
    classificationScoredAt: event.classificationScoredAt,
    classificationInputHash: event.classificationInputHash,
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
    independentStoryCount,

    weightedConfidence:
      globalConfidenceDenominator > EPS
        ? globalConfidenceNumerator /
          globalConfidenceDenominator
        : null,

    categories: categories.sort(
      (a, b) =>
        b.contributionPoints - a.contributionPoints,
    ),

    contributions: contributions.sort(
      (a, b) =>
        Math.abs(b.contributionPoints) -
        Math.abs(a.contributionPoints),
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
    storyCountDelta: (current.independentStoryCount ?? 0) - (previous.independentStoryCount ?? 0),
    categoryChanges,
    eventChanges,
    residual: rawDelta - eventDeltaSum,
  };
}
