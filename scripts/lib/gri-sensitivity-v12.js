import {
  GRI_CATEGORIES,
  GRI_HALF_LIFE_HOURS,
  GRI_LOOKBACK_HOURS,
  GRI_METHOD,
  GRI_SOURCE_WEIGHT_CAP,
  GRI_STORY_WEIGHT_CAP,
} from "./gri-engine-v12.js";

export const GRI_SENSITIVITY_VERSION = "gri-sensitivity-v1.0.0";

const EPS = 1e-12;

export const GRI_CANONICAL_SENSITIVITY_PARAMETERS = Object.freeze({
  lookbackHours: GRI_LOOKBACK_HOURS,
  halfLifeHours: GRI_HALF_LIFE_HOURS,
  sourceWeightCap: GRI_SOURCE_WEIGHT_CAP,
  storyWeightCap: GRI_STORY_WEIGHT_CAP,
  categoryWeights: Object.freeze({
    geopolitics: GRI_METHOD.categories.geopolitics,
    macro: GRI_METHOD.categories.macro,
    rare_earth: GRI_METHOD.categories.rare_earth,
  }),
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stableSource(row) {
  const explicit =
    typeof row.sourceKey === "string"
      ? row.sourceKey.trim().toLowerCase()
      : typeof row.source_key === "string"
        ? row.source_key.trim().toLowerCase()
        : "";
  if (explicit) return explicit;

  const domain =
    typeof row.source_domain === "string"
      ? row.source_domain.trim().toLowerCase()
      : "";
  if (domain) return domain;

  const name =
    typeof row.source_name === "string"
      ? row.source_name.trim().toLowerCase()
      : "";
  if (name) return name;

  try {
    return (
      new URL(row.source_url ?? "")
        .hostname.toLowerCase()
        .replace(/^www\./, "") || "unknown-source"
    );
  } catch {
    return "unknown-source";
  }
}

function storyClusterId(row) {
  const value = row.storyClusterId ?? row.story_cluster_id;
  return typeof value === "string" ? value.trim() : "";
}

function observedTimestamp(row) {
  return row.observedAt ?? row.observed_at ?? row.created_at;
}

function normalizeCategoryWeights(input) {
  const merged = {
    geopolitics:
      finite(input?.geopolitics) ??
      GRI_CANONICAL_SENSITIVITY_PARAMETERS.categoryWeights.geopolitics,
    macro:
      finite(input?.macro) ??
      GRI_CANONICAL_SENSITIVITY_PARAMETERS.categoryWeights.macro,
    rare_earth:
      finite(input?.rare_earth) ??
      GRI_CANONICAL_SENSITIVITY_PARAMETERS.categoryWeights.rare_earth,
  };

  for (const category of GRI_CATEGORIES) {
    if (merged[category] < 0 || merged[category] > 1) {
      throw new Error(`Invalid category weight for ${category}`);
    }
  }

  const total = GRI_CATEGORIES.reduce(
    (sum, category) => sum + merged[category],
    0,
  );
  if (total <= EPS) throw new Error("Sensitivity category weights must sum above zero");

  return merged;
}

export function resolveSensitivityParameters(overrides = {}) {
  const params = {
    lookbackHours:
      finite(overrides.lookbackHours) ??
      GRI_CANONICAL_SENSITIVITY_PARAMETERS.lookbackHours,
    halfLifeHours:
      finite(overrides.halfLifeHours) ??
      GRI_CANONICAL_SENSITIVITY_PARAMETERS.halfLifeHours,
    sourceWeightCap:
      finite(overrides.sourceWeightCap) ??
      GRI_CANONICAL_SENSITIVITY_PARAMETERS.sourceWeightCap,
    storyWeightCap:
      finite(overrides.storyWeightCap) ??
      GRI_CANONICAL_SENSITIVITY_PARAMETERS.storyWeightCap,
    categoryWeights: normalizeCategoryWeights(overrides.categoryWeights),
  };

  if (params.lookbackHours <= 0 || params.lookbackHours > GRI_LOOKBACK_HOURS) {
    throw new Error(
      `Sensitivity lookback must be within 0..${GRI_LOOKBACK_HOURS} hours so the current published eligible universe remains complete`,
    );
  }
  if (params.halfLifeHours <= 0) throw new Error("Sensitivity half-life must be positive");
  if (params.sourceWeightCap <= 0) throw new Error("Sensitivity source cap must be positive");
  if (params.storyWeightCap <= 0) throw new Error("Sensitivity story cap must be positive");

  return params;
}

export function calculateGriCounterfactual(rows, asOf, overrides = {}) {
  if (!Array.isArray(rows)) throw new Error("Sensitivity rows must be an array");

  const params = resolveSensitivityParameters(overrides);
  const asOfMs = new Date(asOf).getTime();
  if (!Number.isFinite(asOfMs)) throw new Error("Invalid sensitivity as-of timestamp");

  const eligible = [];
  for (const row of rows) {
    const category =
      typeof row.category === "string" ? row.category.trim().toLowerCase() : "";
    if (!GRI_CATEGORIES.includes(category)) continue;

    const severity = finite(row.severity);
    const confidence = finite(row.confidence);
    if (
      severity === null ||
      confidence === null ||
      severity < 0 ||
      severity > 100 ||
      confidence <= 0 ||
      confidence > 100
    ) {
      continue;
    }

    const observedMs = new Date(observedTimestamp(row)).getTime();
    if (!Number.isFinite(observedMs) || observedMs > asOfMs) continue;

    const ageHours = (asOfMs - observedMs) / 3_600_000;
    if (ageHours < 0 || ageHours > params.lookbackHours) continue;

    const storyId = storyClusterId(row);
    if (!storyId) continue;

    const rawWeight =
      (confidence / 100) * 2 ** (-ageHours / params.halfLifeHours);
    if (!(rawWeight > 0)) continue;

    eligible.push({
      category,
      severity,
      confidence,
      sourceKey: stableSource(row),
      storyClusterId: storyId,
      rawWeight,
    });
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
    (sum, category) => sum + params.categoryWeights[category],
    0,
  );

  if (activeCategories.length === 0 || activeBaseWeight <= EPS) {
    return {
      rawScore: null,
      displayScore: null,
      coverage: 0,
      eventCount: 0,
      sourceCount: 0,
      independentStoryCount: 0,
      activeCategories: [],
      categories: [],
      parameters: params,
    };
  }

  const categoryResults = [];

  for (const category of activeCategories) {
    const events = byCategory.get(category) ?? [];
    const sources = new Map();
    for (const event of events) {
      const list = sources.get(event.sourceKey) ?? [];
      list.push(event);
      sources.set(event.sourceKey, list);
    }

    const postSourceEvents = [];
    for (const sourceEvents of sources.values()) {
      const sourceRawWeight = sourceEvents.reduce(
        (sum, event) => sum + event.rawWeight,
        0,
      );
      const sourceEffectiveWeight = Math.min(
        params.sourceWeightCap,
        sourceRawWeight,
      );
      if (sourceRawWeight <= EPS || sourceEffectiveWeight <= EPS) continue;

      for (const event of sourceEvents) {
        postSourceEvents.push({
          ...event,
          preStoryEventWeight:
            sourceEffectiveWeight * (event.rawWeight / sourceRawWeight),
        });
      }
    }

    const stories = new Map();
    for (const event of postSourceEvents) {
      const list = stories.get(event.storyClusterId) ?? [];
      list.push(event);
      stories.set(event.storyClusterId, list);
    }

    let categoryEffectiveWeight = 0;
    let categorySeverityNumerator = 0;

    for (const storyEvents of stories.values()) {
      const storyRawWeight = storyEvents.reduce(
        (sum, event) => sum + event.preStoryEventWeight,
        0,
      );
      const bySource = new Map();
      for (const event of storyEvents) {
        bySource.set(
          event.sourceKey,
          (bySource.get(event.sourceKey) ?? 0) + event.preStoryEventWeight,
        );
      }
      const strongestSourceWeight = Math.max(...bySource.values());
      const storyEffectiveWeight = Math.min(
        params.storyWeightCap,
        strongestSourceWeight,
      );
      if (
        storyRawWeight <= EPS ||
        strongestSourceWeight <= EPS ||
        storyEffectiveWeight <= EPS
      ) {
        continue;
      }

      categoryEffectiveWeight += storyEffectiveWeight;
      for (const event of storyEvents) {
        const effectiveEventWeight =
          storyEffectiveWeight *
          (event.preStoryEventWeight / storyRawWeight);
        categorySeverityNumerator += event.severity * effectiveEventWeight;
      }
    }

    if (categoryEffectiveWeight <= EPS) continue;

    const score = categorySeverityNumerator / categoryEffectiveWeight;
    const normalizedWeight = params.categoryWeights[category] / activeBaseWeight;
    categoryResults.push({
      category,
      score,
      normalizedWeight,
      contributionPoints: score * normalizedWeight,
      eventCount: events.length,
      sourceCount: sources.size,
      storyCount: stories.size,
    });
  }

  const rawScore = categoryResults.reduce(
    (sum, category) => sum + category.contributionPoints,
    0,
  );

  return {
    rawScore,
    displayScore: Math.round(rawScore),
    coverage: activeCategories.reduce(
      (sum, category) => sum + params.categoryWeights[category],
      0,
    ),
    eventCount: eligible.length,
    sourceCount: new Set(eligible.map((event) => event.sourceKey)).size,
    independentStoryCount: new Set(
      eligible.map((event) => event.storyClusterId),
    ).size,
    activeCategories,
    categories: categoryResults,
    parameters: params,
  };
}

function shiftedWeights(targetCategory, delta) {
  const base = 1 / 3;
  const other = base - delta / 2;
  const result = {
    geopolitics: other,
    macro: other,
    rare_earth: other,
  };
  result[targetCategory] = base + delta;
  return result;
}

export const GRI_SENSITIVITY_SCENARIOS = Object.freeze([
  {
    id: "half_life_12h",
    description: "Faster recency decay: 12-hour half-life.",
    overrides: { halfLifeHours: 12 },
  },
  {
    id: "half_life_48h",
    description: "Slower recency decay: 48-hour half-life over the same eligible event universe.",
    overrides: { halfLifeHours: 48 },
  },
  {
    id: "lookback_24h",
    description: "Shorter evidence window: 24-hour lookback.",
    overrides: { lookbackHours: 24 },
  },
  {
    id: "lookback_48h",
    description: "Shorter evidence window: 48-hour lookback.",
    overrides: { lookbackHours: 48 },
  },
  {
    id: "source_cap_0_5",
    description: "Stricter per-source concentration cap of 0.5.",
    overrides: { sourceWeightCap: 0.5 },
  },
  {
    id: "source_cap_1_5",
    description: "Looser per-source concentration cap of 1.5 with the canonical story cap retained.",
    overrides: { sourceWeightCap: 1.5 },
  },
  {
    id: "story_cap_0_5",
    description: "Stricter per-story concentration cap of 0.5.",
    overrides: { storyWeightCap: 0.5 },
  },
  {
    id: "geopolitics_plus_10pp",
    description: "Increase geopolitics base weight by 10 percentage points and split the offset across the other domains.",
    overrides: { categoryWeights: shiftedWeights("geopolitics", 0.1) },
  },
  {
    id: "geopolitics_minus_10pp",
    description: "Decrease geopolitics base weight by 10 percentage points and split the offset across the other domains.",
    overrides: { categoryWeights: shiftedWeights("geopolitics", -0.1) },
  },
  {
    id: "macro_plus_10pp",
    description: "Increase macro base weight by 10 percentage points and split the offset across the other domains.",
    overrides: { categoryWeights: shiftedWeights("macro", 0.1) },
  },
  {
    id: "macro_minus_10pp",
    description: "Decrease macro base weight by 10 percentage points and split the offset across the other domains.",
    overrides: { categoryWeights: shiftedWeights("macro", -0.1) },
  },
  {
    id: "rare_earth_plus_10pp",
    description: "Increase rare-earth base weight by 10 percentage points and split the offset across the other domains.",
    overrides: { categoryWeights: shiftedWeights("rare_earth", 0.1) },
  },
  {
    id: "rare_earth_minus_10pp",
    description: "Decrease rare-earth base weight by 10 percentage points and split the offset across the other domains.",
    overrides: { categoryWeights: shiftedWeights("rare_earth", -0.1) },
  },
  {
    id: "strict_evidence_combo",
    description: "Combined conservative perturbation: 48-hour lookback, 18-hour half-life, 0.75 source cap and 0.75 story cap.",
    overrides: {
      lookbackHours: 48,
      halfLifeHours: 18,
      sourceWeightCap: 0.75,
      storyWeightCap: 0.75,
    },
  },
]);
