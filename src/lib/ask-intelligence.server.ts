import { getAppSupabase } from "./supabase-app.server";
import {
  GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS,
  GRI_METHOD_VERSION,
  GRI_PROOF_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
  GRI_STORY_CORRELATION_VERSION,
} from "./gri-current-contract.js";

/** Deterministic Ask Geomacro engine: Supabase stored intelligence only.
 *  No LLM provider is involved (no Groq, no Cerebras, no external search). */

export type AskAnswer = {
  summary: string;
  what_changed: string;
  why_it_matters: string;
  geomacro_view: string;
  evidence: Array<{ eventId: string; title: string; sourceUrl: string; relevance: number }>;
  insufficient_evidence: boolean;
  /** Mean similarity (0..1) of the matched set, null when nothing matched. */
  mean_relevance: number | null;
  /** True when mean similarity is below the confident-narrative threshold. */
  low_confidence: boolean;
  gri: number | null;
  generatedAt: string;
};

const INSUFFICIENT = "No strongly relevant stored events found for this question.";

const STOPWORDS = new Set([
  "what",
  "whats",
  "why",
  "how",
  "who",
  "when",
  "where",
  "is",
  "are",
  "was",
  "were",
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "to",
  "and",
  "or",
  "at",
  "by",
  "from",
  "into",
  "today",
  "now",
  "recent",
  "recently",
  "latest",
  "happening",
  "happened",
  "going",
  "global",
  "biggest",
  "missing",
  "geomacro",
  "does",
  "do",
  "did",
  "it",
  "that",
  "this",
  "these",
  "those",
  "for",
  "with",
  "about",
  "there",
  "any",
  "much",
  "more",
  "tell",
  "show",
  "give",
  "me",
  "us",
  "you",
  "please",
  "current",
  "currently",
]);

/** Category keyword map, aligned with the pipeline's stored categories. */
const CATEGORY_HINTS: Record<string, string[]> = {
  rare_earth: [
    "rare",
    "earth",
    "earths",
    "minerals",
    "mineral",
    "lithium",
    "cobalt",
    "magnet",
    "supply",
    "chips",
    "semiconductor",
    "mining",
  ],
  geopolitics: [
    "geopolitics",
    "geopolitical",
    "war",
    "conflict",
    "military",
    "sanctions",
    "border",
    "attack",
    "strike",
    "diplomacy",
    "election",
    "coup",
  ],
  macro: [
    "macro",
    "inflation",
    "rates",
    "rate",
    "economy",
    "economic",
    "gdp",
    "bond",
    "yields",
    "unemployment",
    "fed",
    "central",
    "bank",
    "growth",
  ],
  crypto: [
    "crypto",
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "stablecoin",
    "token",
    "liquidity",
    "defi",
    "exchange",
  ],
};

export type EventRow = {
  id: string;
  source_title: string | null;
  source_url: string | null;
  source_name: string | null;
  category: string | null;
  summary: string | null;
  narrative: string | null;
  severity: number | null;
  confidence: number | null;
  delta: number | null;
  source_domain: string | null;
  published_at: string | null;
  created_at: string;
  classification_provider?: string | null;
  classification_model?: string | null;
  classification_version?: string | null;
  classification_prompt_version?: string | null;
  classification_input_hash?: string | null;
};

const COLUMNS =
  "id,source_title,source_url,source_name,category,summary,narrative,severity,confidence,delta,published_at,created_at";

const RECENT_LIMIT = 120;
const KEYWORD_LIMIT = 60;
const MAX_EVIDENCE = 5;
/** Minimum per-event similarity (0..1) required to be used as evidence. */
export const SIMILARITY_THRESHOLD = 0.45;
/** Mean similarity required before a confident interpretation is written. */
export const CONFIDENT_MEAN_SIMILARITY = 0.5;

export function extractTerms(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
    ),
  ).slice(0, 8);
}

export function inferCategories(terms: string[]): string[] {
  const hits: string[] = [];
  for (const [cat, words] of Object.entries(CATEGORY_HINTS)) {
    if (terms.some((t) => words.includes(t))) hits.push(cat);
  }
  return hits;
}

/** Relevance = keyword match + category match + recency + severity + movement. */
export function rankRow(row: EventRow, terms: string[], categories: string[], now: number) {
  const hay =
    `${row.source_title ?? ""} ${row.summary ?? ""} ${row.narrative ?? ""} ${row.category ?? ""}`.toLowerCase();
  const matches = terms.filter((t) => hay.includes(t)).length;
  const catMatch = categories.length && row.category && categories.includes(row.category) ? 1 : 0;
  const ageHours = Math.max(0, (now - new Date(row.created_at).getTime()) / 3_600_000);
  const recency = Math.max(0, 168 - ageHours) / 168;
  const severity = (row.severity ?? 0) / 100;
  const movement = Math.abs(row.delta ?? 0) / 100;
  return matches * 6 + catMatch * 4 + recency * 3 + severity * 2 + movement;
}

/**
 * Normalised similarity (0..1) between a question and a stored event.
 * Term coverage dominates; category alignment and recency act as soft signals.
 */
export function similarityOf(
  row: EventRow,
  terms: string[],
  categories: string[],
  now: number,
): number {
  const hay =
    `${row.source_title ?? ""} ${row.summary ?? ""} ${row.narrative ?? ""} ${row.category ?? ""}`.toLowerCase();
  const catMatch = categories.length && row.category && categories.includes(row.category) ? 1 : 0;
  const ageHours = Math.max(0, (now - new Date(row.created_at).getTime()) / 3_600_000);
  const recency = Math.max(0, 168 - ageHours) / 168;

  if (terms.length === 0) {
    // Untargeted question ("what changed today?"): recency and severity carry it.
    const severity = (row.severity ?? 0) / 100;
    return Math.min(1, 0.3 + recency * 0.5 + severity * 0.2);
  }

  const coverage = terms.filter((t) => hay.includes(t)).length / terms.length;
  return Math.min(1, coverage * 0.65 + catMatch * 0.2 + recency * 0.15);
}

function escapeLike(term: string) {
  return term.replace(/[%,()]/g, " ");
}

function pct(n: number) {
  return `${Math.round(n)}`;
}

function titleOf(row: EventRow) {
  return (row.source_title ?? row.summary ?? "Untitled event").trim();
}

function label(category: string | null) {
  if (!category) return "uncategorised";
  return category.replace(/_/g, " ");
}

function sentence(row: EventRow) {
  const body = (row.summary ?? row.narrative ?? "").trim();
  const first = body.split(/(?<=\.)\s/)[0] ?? body;
  return first.length > 220 ? `${first.slice(0, 217)}...` : first;
}

/** Bounded retrieval: one recency window query plus one keyword-filtered query. */
async function retrieve(terms: string[], categories: string[]) {
  const supabase = getAppSupabase();
  if (!supabase) throw new Error("Intelligence store unavailable");

  const recentSince = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  const keywordSince = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();

  const recent = supabase
    .from("events")
    .select(COLUMNS)
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  const queries: Array<PromiseLike<{ data: unknown; error: { message: string } | null }>> = [
    recent,
  ];

  const filters: string[] = [];
  for (const t of terms.slice(0, 4)) {
    const safe = escapeLike(t);
    filters.push(`source_title.ilike.%${safe}%`, `summary.ilike.%${safe}%`);
  }
  for (const c of categories) filters.push(`category.eq.${c}`);

  if (filters.length > 0) {
    queries.push(
      supabase
        .from("events")
        .select(COLUMNS)
        .gte("created_at", keywordSince)
        .or(filters.join(","))
        .order("severity", { ascending: false })
        .limit(KEYWORD_LIMIT),
    );
  }

  const results = await Promise.all(queries);
  const merged = new Map<string, EventRow>();
  let recentRows: EventRow[] = [];
  results.forEach((res, i) => {
    if (res.error) {
      console.error("[askGeomacro] retrieval failed", res.error.message);
      throw new Error("Intelligence store unavailable");
    }
    const rows = (res.data ?? []) as EventRow[];
    if (i === 0) recentRows = rows;
    for (const r of rows) merged.set(r.id, r);
  });

  return { rows: Array.from(merged.values()), recentRows };
}

async function loadPublishedGri() {
  const unavailable = () => ({
    displayScore: null,
    eventCount: 0,
    independentStoryCount: 0,
    coverage: 0,
    methodologyVersion: GRI_METHOD_VERSION,
    auditPersisted: false,
  });

  const supabase = getAppSupabase();
  if (!supabase) return unavailable();

  const { data, error } = await supabase
    .from("gri_snapshots")
    .select(
      "display_score,event_count,independent_story_count,coverage,methodology_version,as_of,proof_version,story_correlation_version,story_correlation_prompt_version,verification_status,proof_hash,evidence_hash,calculation_hash,input_hash,methodology_hash,reconciliation_residual,change_residual",
    )
    .eq("status", "published")
    .eq("methodology_version", GRI_METHOD_VERSION)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[askGeomacro] canonical GRI read failed", error.message);
    return unavailable();
  }
  if (!data || typeof data.display_score !== "number") return unavailable();

  const asOfMs = new Date(data.as_of).getTime();
  const ageHours = Number.isFinite(asOfMs)
    ? (Date.now() - asOfMs) / 3_600_000
    : Number.POSITIVE_INFINITY;
  const reconciliationResidual = Number(data.reconciliation_residual);
  const changeResidual = data.change_residual === null ? null : Number(data.change_residual);
  const hashesReady = Boolean(
    data.proof_hash &&
    data.evidence_hash &&
    data.calculation_hash &&
    data.input_hash &&
    data.methodology_hash,
  );
  const residualsReady =
    Number.isFinite(reconciliationResidual) &&
    Math.abs(reconciliationResidual) <= 1e-7 &&
    (changeResidual === null ||
      (Number.isFinite(changeResidual) && Math.abs(changeResidual) <= 1e-7));
  const fresh = ageHours >= -0.25 && ageHours <= GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS;
  const verified =
    data.verification_status === "verified" &&
    data.proof_version === GRI_PROOF_VERSION &&
    data.story_correlation_version === GRI_STORY_CORRELATION_VERSION &&
    data.story_correlation_prompt_version === GRI_STORY_CORRELATION_PROMPT_VERSION &&
    Number.isInteger(Number(data.independent_story_count)) &&
    Number(data.independent_story_count) > 0 &&
    Number(data.independent_story_count) <= Number(data.event_count ?? 0) &&
    hashesReady &&
    residualsReady &&
    fresh;

  if (!verified) return unavailable();

  return {
    displayScore: data.display_score,
    eventCount: Number(data.event_count ?? 0),
    independentStoryCount: Number(data.independent_story_count ?? 0),
    coverage: Number(data.coverage ?? 0),
    methodologyVersion: String(data.methodology_version ?? GRI_METHOD_VERSION),
    auditPersisted: true,
  };
}

export async function answerQuestion(question: string): Promise<AskAnswer> {
  const terms = extractTerms(question);
  const categories = inferCategories(terms);
  const { rows, recentRows } = await retrieve(terms, categories);
  const now = Date.now();
  const generatedAt = new Date().toISOString();

  // Ask Geomacro uses the exact same immutable published snapshot as every UI surface.
  // It never computes a private fallback score.
  const griReading = await loadPublishedGri();
  const gri = griReading.displayScore;

  const ranked = rows
    .map((r) => ({
      row: r,
      score: rankRow(r, terms, categories, now),
      similarity: similarityOf(r, terms, categories, now),
    }))
    .sort((a, b) => b.similarity - a.similarity || b.score - a.score);

  // Similarity gate: only strongly relevant events may be used as evidence.
  const selected = ranked
    .filter(({ similarity }) => similarity >= SIMILARITY_THRESHOLD)
    .slice(0, MAX_EVIDENCE);

  if (selected.length === 0) {
    return {
      summary: INSUFFICIENT,
      what_changed:
        recentRows.length === 0
          ? "No scored events are recorded in the stored intelligence window."
          : `${recentRows.length} events are stored for the last seven days, but none clear the relevance threshold for this question.`,
      why_it_matters:
        "Answers are grounded only in events the pipeline has classified and stored. Nothing is inferred beyond that.",
      geomacro_view: "Interpretation is withheld until matching events are recorded.",
      evidence: [],
      insufficient_evidence: true,
      mean_relevance: null,
      low_confidence: true,
      gri,
      generatedAt,
    };
  }

  const meanSimilarity = selected.reduce((a, s) => a + s.similarity, 0) / selected.length;
  const lowConfidence = meanSimilarity < CONFIDENT_MEAN_SIMILARITY;

  const picked = selected.map((s) => s.row);
  const sevValues = picked.map((r) => r.severity).filter((s): s is number => typeof s === "number");
  const meanSev = sevValues.length
    ? Math.round(sevValues.reduce((a, b) => a + b, 0) / sevValues.length)
    : null;
  const top = picked[0];
  const cats = Array.from(new Set(picked.map((r) => label(r.category))));
  const rising = picked.filter((r) => (r.delta ?? 0) > 0);
  const falling = picked.filter((r) => (r.delta ?? 0) < 0);
  const newest = [...picked].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];

  const summary = [
    `${picked.length} stored ${picked.length === 1 ? "event matches" : "events match"} this question across ${cats.join(", ")}.`,
    meanSev !== null ? `Mean severity of the matched set is ${pct(meanSev)}/100.` : "",
    `The strongest match is: ${titleOf(top)}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const what_changed = [
    `Most recent matched record (${new Date(newest.created_at).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      hour12: true,
      timeZone: "UTC",
    })} UTC): ${sentence(newest)}`,
    rising.length
      ? `${rising.length} matched ${rising.length === 1 ? "event is" : "events are"} scoring higher than their previous reading.`
      : "",
    falling.length ? `${falling.length} ${falling.length === 1 ? "is" : "are"} scoring lower.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const why_it_matters = [
    gri !== null
      ? `The Global Risk Index (${griReading.methodologyVersion}) is ${gri}/100 from ${griReading.eventCount} eligible evidence rows across ${griReading.independentStoryCount} independent stories with ${Math.round(griReading.coverage * 100)}% domain coverage.`
      : "No qualifying events are available in the canonical GRI window, so the Global Risk Index is unavailable.",
    meanSev !== null && gri !== null
      ? meanSev >= gri
        ? "This matched set sits at or above the current index, so it is contributing to elevated risk."
        : "This matched set sits below the current index, so it is not the main driver of current risk."
      : "",
    "Market probability is unavailable until positions are recorded.",
  ]
    .filter(Boolean)
    .join(" ");

  const geomacro_view = lowConfidence
    ? `Matches for this question are weak or tangential (mean relevance ${Math.round(meanSimilarity * 100)}%), so Geomacro is not writing an interpretation. Treat the listed events as loosely related context rather than an answer.`
    : `Interpretation: based only on stored records, ${label(top.category)} is the dominant thread in this question, led by ${titleOf(top)} at severity ${top.severity ?? "unscored"}/100. ${
        rising.length > falling.length
          ? "Momentum across the matched set is upward, so Geomacro treats this cluster as still developing."
          : falling.length > rising.length
            ? "Momentum across the matched set is downward, so Geomacro treats this cluster as cooling."
            : "Momentum is mixed, so Geomacro treats this cluster as unresolved."
      }`;

  const evidence = selected
    .filter(({ row }) => Boolean(row.source_url))
    .map(({ row, similarity }) => ({
      eventId: row.id,
      title: titleOf(row),
      sourceUrl: row.source_url as string,
      relevance: Math.round(similarity * 100),
    }));

  return {
    summary,
    what_changed,
    why_it_matters,
    geomacro_view,
    evidence,
    insufficient_evidence: false,
    mean_relevance: Number(meanSimilarity.toFixed(3)),
    low_confidence: lowConfidence,
    gri,
    generatedAt,
  };
}
