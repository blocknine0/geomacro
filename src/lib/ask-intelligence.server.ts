import { getAppSupabase } from "./supabase-app.server";
import {
  GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS,
  GRI_METHOD_VERSION,
  GRI_PROOF_VERSION,
  GRI_STORY_CORRELATION_PROMPT_VERSION,
  GRI_STORY_CORRELATION_VERSION,
} from "./gri-current-contract.js";

/**
 * Deterministic Ask Geomacro engine.
 *
 * It uses only Geomacro's stored intelligence and the current canonical GRI.
 * No LLM provider, external search or private fallback score is involved.
 */
export type AskAnswer = {
  summary: string;
  what_changed: string;
  why_it_matters: string;
  geomacro_view: string;
  evidence: Array<{ eventId: string; title: string; sourceUrl: string; relevance: number }>;
  insufficient_evidence: boolean;
  mean_relevance: number | null;
  low_confidence: boolean;
  gri: number | null;
  generatedAt: string;
};

export type EventRow = {
  id: string;
  source_title: string | null;
  source_url: string | null;
  source_name: string | null;
  source_domain: string | null;
  category: string | null;
  summary: string | null;
  narrative: string | null;
  severity: number | null;
  confidence: number | null;
  delta: number | null;
  published_at: string | null;
  created_at: string;
};

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
  "emerging",
  "current",
  "currently",
  "risk",
  "risks",
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
]);

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
};

const COLUMNS =
  "id,source_title,source_url,source_name,source_domain,category,summary,narrative,severity,confidence,delta,published_at,created_at";
const RECENT_LIMIT = 120;
const KEYWORD_LIMIT = 60;
const MAX_EVIDENCE = 5;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const SIMILARITY_THRESHOLD = 0.45;
export const CONFIDENT_MEAN_SIMILARITY = 0.5;

export function extractTerms(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((term) => term.length > 2 && !STOPWORDS.has(term)),
    ),
  ).slice(0, 8);
}

export function inferCategories(terms: string[]): string[] {
  const hits: string[] = [];
  for (const [category, words] of Object.entries(CATEGORY_HINTS)) {
    if (terms.some((term) => words.includes(term))) hits.push(category);
  }
  return hits;
}

export function rankRow(row: EventRow, terms: string[], categories: string[], now: number) {
  const hay =
    `${row.source_title ?? ""} ${row.summary ?? ""} ${row.narrative ?? ""} ${row.category ?? ""}`.toLowerCase();
  const matches = terms.filter((term) => hay.includes(term)).length;
  const catMatch = categories.length && row.category && categories.includes(row.category) ? 1 : 0;
  const ageHours = Math.max(0, (now - new Date(row.created_at).getTime()) / HOUR);
  const recency = Math.max(0, 168 - ageHours) / 168;
  const severity = (row.severity ?? 0) / 100;
  const movement = Math.abs(row.delta ?? 0) / 100;
  return matches * 6 + catMatch * 4 + recency * 3 + severity * 2 + movement;
}

export function similarityOf(
  row: EventRow,
  terms: string[],
  categories: string[],
  now: number,
): number {
  const hay =
    `${row.source_title ?? ""} ${row.summary ?? ""} ${row.narrative ?? ""} ${row.category ?? ""}`.toLowerCase();
  const catMatch = categories.length && row.category && categories.includes(row.category) ? 1 : 0;
  const ageHours = Math.max(0, (now - new Date(row.created_at).getTime()) / HOUR);
  const recency = Math.max(0, 168 - ageHours) / 168;

  if (terms.length === 0) {
    const severity = (row.severity ?? 0) / 100;
    return Math.min(1, 0.3 + recency * 0.5 + severity * 0.2);
  }

  const coverage = terms.filter((term) => hay.includes(term)).length / terms.length;
  return Math.min(1, coverage * 0.65 + catMatch * 0.2 + recency * 0.15);
}

function escapeLike(term: string) {
  return term.replace(/[%,()]/g, " ");
}

function label(category: string | null) {
  if (!category) return "uncategorised";
  if (category === "rare_earth") return "critical minerals";
  return category.replace(/_/g, " ");
}

function titleOf(row: EventRow) {
  return (row.source_title ?? row.summary ?? "Untitled event").trim();
}

function sentence(row: EventRow) {
  const body = (row.summary ?? row.narrative ?? "").trim();
  const first = body.split(/(?<=\.)\s/)[0] ?? body;
  return first.length > 220 ? `${first.slice(0, 217)}...` : first;
}

function eventTime(row: EventRow) {
  return new Date(row.published_at ?? row.created_at).getTime();
}

function sortByNewest(a: EventRow, b: EventRow) {
  return eventTime(b) - eventTime(a);
}

function evidenceFromRows(rows: EventRow[], base = 100) {
  return rows
    .filter((row) => Boolean(row.source_url))
    .slice(0, MAX_EVIDENCE)
    .map((row, index) => ({
      eventId: row.id,
      title: titleOf(row),
      sourceUrl: row.source_url as string,
      relevance: Math.max(70, base - index * 6),
    }));
}

async function retrieve(terms: string[], categories: string[]) {
  const supabase = getAppSupabase();
  if (!supabase) throw new Error("Intelligence store unavailable");

  const recentSince = new Date(Date.now() - 7 * DAY).toISOString();
  const keywordSince = new Date(Date.now() - 30 * DAY).toISOString();

  const recent = supabase
    .from("events")
    .select(COLUMNS)
    .in("category", ["geopolitics", "macro", "rare_earth"])
    .gte("created_at", recentSince)
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  const queries: Array<PromiseLike<{ data: unknown; error: { message: string } | null }>> = [recent];

  const filters: string[] = [];
  for (const term of terms.slice(0, 4)) {
    const safe = escapeLike(term);
    filters.push(`source_title.ilike.%${safe}%`, `summary.ilike.%${safe}%`);
  }
  for (const category of categories) filters.push(`category.eq.${category}`);

  if (filters.length > 0) {
    queries.push(
      supabase
        .from("events")
        .select(COLUMNS)
        .in("category", ["geopolitics", "macro", "rare_earth"])
        .gte("created_at", keywordSince)
        .or(filters.join(","))
        .order("severity", { ascending: false })
        .limit(KEYWORD_LIMIT),
    );
  }

  const results = await Promise.all(queries);
  const merged = new Map<string, EventRow>();
  let recentRows: EventRow[] = [];

  results.forEach((result, index) => {
    if (result.error) {
      console.error("[askGeomacro] retrieval failed", result.error.message);
      throw new Error("Intelligence store unavailable");
    }
    const rows = (result.data ?? []) as EventRow[];
    if (index === 0) recentRows = rows;
    for (const row of rows) merged.set(row.id, row);
  });

  return { rows: Array.from(merged.values()), recentRows };
}

type GriReading = {
  displayScore: number | null;
  previousScore: number | null;
  changePoints: number | null;
  eventCount: number;
  independentStoryCount: number;
  coverage: number;
  methodologyVersion: string;
  auditPersisted: boolean;
  asOf: string | null;
  explanation: Record<string, unknown> | null;
};

async function loadPublishedGri(): Promise<GriReading> {
  const unavailable = (): GriReading => ({
    displayScore: null,
    previousScore: null,
    changePoints: null,
    eventCount: 0,
    independentStoryCount: 0,
    coverage: 0,
    methodologyVersion: GRI_METHOD_VERSION,
    auditPersisted: false,
    asOf: null,
    explanation: null,
  });

  const supabase = getAppSupabase();
  if (!supabase) return unavailable();

  const { data, error } = await supabase
    .from("gri_snapshots")
    .select(
      "display_score,previous_display_score,change_points,event_count,independent_story_count,coverage,methodology_version,as_of,proof_version,story_correlation_version,story_correlation_prompt_version,verification_status,proof_hash,evidence_hash,calculation_hash,input_hash,methodology_hash,disposition_hash,candidate_event_count,reconciliation_residual,change_residual,explanation",
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
    ? (Date.now() - asOfMs) / HOUR
    : Number.POSITIVE_INFINITY;
  const reconciliationResidual = Number(data.reconciliation_residual);
  const changeResidual = data.change_residual === null ? null : Number(data.change_residual);
  const candidateEventCount = Number(data.candidate_event_count);

  const hashesReady = Boolean(
    data.proof_hash &&
      data.evidence_hash &&
      data.calculation_hash &&
      data.input_hash &&
      data.methodology_hash &&
      /^[a-f0-9]{64}$/.test(String(data.disposition_hash ?? "")),
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
    Number.isInteger(candidateEventCount) &&
    candidateEventCount >= Number(data.event_count ?? 0) &&
    hashesReady &&
    residualsReady &&
    fresh;

  if (!verified) return unavailable();

  return {
    displayScore: data.display_score,
    previousScore:
      typeof data.previous_display_score === "number" ? data.previous_display_score : null,
    changePoints: data.change_points === null ? null : Number(data.change_points),
    eventCount: Number(data.event_count ?? 0),
    independentStoryCount: Number(data.independent_story_count ?? 0),
    coverage: Number(data.coverage ?? 0),
    methodologyVersion: String(data.methodology_version ?? GRI_METHOD_VERSION),
    auditPersisted: true,
    asOf: data.as_of,
    explanation:
      data.explanation && typeof data.explanation === "object"
        ? (data.explanation as Record<string, unknown>)
        : null,
  };
}

type Intent = "gri_change" | "current_digest" | "emerging" | "rising" | "topic";

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();
  if (/\bgri\b|global risk index/.test(q) && /(change|changed|move|moved|why|driver|driving)/.test(q)) {
    return "gri_change";
  }
  if (/what changed|what happened|today|latest|current developments|recent developments/.test(q)) {
    return "current_digest";
  }
  if (/emerging|new risk|new risks|biggest risk|biggest risks/.test(q)) return "emerging";
  if (/risk rising|risks rising|rising risk|moving up|increasing risk|driving risk/.test(q)) {
    return "rising";
  }
  return "topic";
}

function griWhy(gri: GriReading): AskAnswer | null {
  if (gri.displayScore === null) return null;
  const why =
    gri.explanation?.why && typeof gri.explanation.why === "object"
      ? (gri.explanation.why as Record<string, unknown>)
      : null;
  const how =
    gri.explanation?.how && typeof gri.explanation.how === "object"
      ? (gri.explanation.how as Record<string, unknown>)
      : null;
  const categoryChanges = Array.isArray(why?.topCategoryChanges)
    ? (why?.topCategoryChanges as Array<Record<string, unknown>>)
    : [];
  const eventChanges = Array.isArray(why?.topEventChanges)
    ? (why?.topEventChanges as Array<Record<string, unknown>>)
    : [];
  const currentEvents = Array.isArray(how?.topCurrentEvents)
    ? (how?.topCurrentEvents as Array<Record<string, unknown>>)
    : [];

  const categorySentence = categoryChanges.length
    ? categoryChanges
        .slice(0, 3)
        .map((item) => {
          const delta = Number(item.deltaPoints ?? 0);
          return `${label(String(item.category ?? "uncategorised"))} ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} pts`;
        })
        .join(", ")
    : "No material domain-level change is stored for this snapshot.";

  const eventSentence = eventChanges.length
    ? eventChanges
        .slice(0, 3)
        .map((item) => String(item.sourceTitle ?? item.eventId ?? "stored event"))
        .join("; ")
    : "No material event-level change is stored for this snapshot.";

  const strongest = categoryChanges[0];
  const strongestLabel = strongest ? label(String(strongest.category ?? "uncategorised")) : null;
  const change = gri.changePoints;
  const summary =
    change === null || gri.previousScore === null
      ? `The current verified GRI is ${gri.displayScore}/100.`
      : `The current verified GRI is ${gri.displayScore}/100, ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)} points from ${gri.previousScore}.`;

  const evidence = currentEvents
    .filter((item) => Boolean(item.eventId) && Boolean(item.sourceUrl))
    .slice(0, MAX_EVIDENCE)
    .map((item, index) => ({
      eventId: String(item.eventId),
      title: String(item.sourceTitle ?? item.eventId),
      sourceUrl: String(item.sourceUrl),
      relevance: Math.max(75, 100 - index * 5),
    }));

  return {
    summary,
    what_changed: `Stored contribution changes by domain: ${categorySentence}. Largest event-level changes: ${eventSentence}`,
    why_it_matters: `This reading is built from ${gri.eventCount} eligible evidence rows across ${gri.independentStoryCount} independent stories with ${Math.round(gri.coverage * 100)}% domain coverage. The score is a risk-intelligence index, not a market probability.`,
    geomacro_view: strongestLabel
      ? `The largest stored domain-level contribution change is currently ${strongestLabel}. This interpretation comes from the published GRI attribution, not from a separate model-generated narrative.`
      : "No single material domain-level driver is available in the published attribution for this snapshot.",
    evidence,
    insufficient_evidence: false,
    mean_relevance: evidence.length ? 1 : null,
    low_confidence: false,
    gri: gri.displayScore,
    generatedAt: new Date().toISOString(),
  };
}

function broadAnswer(
  intent: Exclude<Intent, "gri_change" | "topic">,
  recentRows: EventRow[],
  gri: GriReading,
): AskAnswer {
  const now = Date.now();
  const rows = [...recentRows].sort(sortByNewest);
  if (!rows.length) {
    return insufficientAnswer(
      "No scored intelligence events are stored in the current seven-day research window.",
      gri.displayScore,
    );
  }

  let selected: EventRow[] = [];
  let context = "";

  if (intent === "current_digest") {
    const in24h = rows.filter((row) => now - eventTime(row) <= DAY);
    selected = (in24h.length ? in24h : rows).slice(0, MAX_EVIDENCE);
    context = in24h.length
      ? `${in24h.length} stored intelligence records fall inside the last 24 hours.`
      : "No stored intelligence record falls inside the last 24 hours, so Geomacro is showing the most recent stored records from the seven-day window instead.";
  } else if (intent === "emerging") {
    const recent72h = rows.filter((row) => now - eventTime(row) <= 3 * DAY);
    const pool = recent72h.length ? recent72h : rows;
    selected = [...pool]
      .sort((a, b) => (b.severity ?? -1) - (a.severity ?? -1) || sortByNewest(a, b))
      .slice(0, MAX_EVIDENCE);
    context = recent72h.length
      ? "These are the highest-severity stored records from the last 72 hours."
      : "No records fall inside the last 72 hours, so Geomacro is using the highest-severity records from the seven-day window.";
  } else {
    const rising = rows
      .filter((row) => (row.delta ?? 0) > 0)
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
    selected = (rising.length
      ? rising
      : [...rows].sort((a, b) => (b.severity ?? -1) - (a.severity ?? -1)))
      .slice(0, MAX_EVIDENCE);
    context = rising.length
      ? `${rising.length} stored records have a positive recorded risk movement in the seven-day window.`
      : "No stored record has a positive risk delta in the seven-day window; the answer therefore shows the highest current risk readings instead of inventing upward momentum.";
  }

  const risingCount = selected.filter((row) => (row.delta ?? 0) > 0).length;
  const top = selected[0];
  const titles = selected.slice(0, 3).map(titleOf).join("; ");
  const categories = Array.from(new Set(selected.map((row) => label(row.category))));
  const severities = selected
    .map((row) => row.severity)
    .filter((value): value is number => typeof value === "number");
  const meanSeverity = severities.length
    ? severities.reduce((sum, value) => sum + value, 0) / severities.length
    : null;

  return {
    summary: `${selected.length} stored records are most relevant to this broad current-risk question across ${categories.join(", ") || "the current risk set"}. ${context}`,
    what_changed: `${titles}.${risingCount ? ` ${risingCount} of these records are scoring higher than their previous reading.` : ""}`,
    why_it_matters:
      gri.displayScore !== null
        ? `The current verified GRI is ${gri.displayScore}/100 from ${gri.eventCount} eligible evidence rows across ${gri.independentStoryCount} independent stories. The selected records should be read as supporting context, not as a separate index.`
        : "The canonical GRI is currently unavailable, so this answer is limited to the stored event record and does not substitute a private score.",
    geomacro_view:
      meanSeverity === null
        ? "The selected records do not contain enough scored severity data for a stronger interpretation."
        : `The selected set has a mean stored severity of ${meanSeverity.toFixed(1)}/100, led by ${titleOf(top)}. This is a deterministic summary of stored records, not an external model opinion.`,
    evidence: evidenceFromRows(selected),
    insufficient_evidence: false,
    mean_relevance: 1,
    low_confidence: false,
    gri: gri.displayScore,
    generatedAt: new Date().toISOString(),
  };
}

function insufficientAnswer(message: string, gri: number | null): AskAnswer {
  return {
    summary: "No strongly relevant stored evidence is available for this question.",
    what_changed: message,
    why_it_matters:
      "Ask Geomacro is grounded only in stored, scored evidence. It does not fill evidence gaps with uncited outside claims.",
    geomacro_view: "Interpretation is withheld until matching evidence is stored.",
    evidence: [],
    insufficient_evidence: true,
    mean_relevance: null,
    low_confidence: true,
    gri,
    generatedAt: new Date().toISOString(),
  };
}

export async function answerQuestion(question: string): Promise<AskAnswer> {
  const terms = extractTerms(question);
  const categories = inferCategories(terms);
  const intent = detectIntent(question);
  const [{ rows, recentRows }, gri] = await Promise.all([
    retrieve(terms, categories),
    loadPublishedGri(),
  ]);
  const now = Date.now();

  if (intent === "gri_change") {
    const answer = griWhy(gri);
    return answer ?? insufficientAnswer(
      "The current GRI has not passed the public verification/freshness contract, so Geomacro will not manufacture a change explanation.",
      null,
    );
  }

  if (intent !== "topic") {
    return broadAnswer(intent, recentRows, gri);
  }

  const ranked = rows
    .map((row) => ({
      row,
      score: rankRow(row, terms, categories, now),
      similarity: similarityOf(row, terms, categories, now),
    }))
    .sort((a, b) => b.similarity - a.similarity || b.score - a.score);

  const selected = ranked
    .filter(({ similarity }) => similarity >= SIMILARITY_THRESHOLD)
    .slice(0, MAX_EVIDENCE);

  if (selected.length === 0) {
    return insufficientAnswer(
      recentRows.length === 0
        ? "No scored events are recorded in the stored seven-day window."
        : `${recentRows.length} events are stored for the last seven days, but none clear the relevance threshold for this topic-specific question.`,
      gri.displayScore,
    );
  }

  const meanSimilarity =
    selected.reduce((sum, item) => sum + item.similarity, 0) / selected.length;
  const lowConfidence = meanSimilarity < CONFIDENT_MEAN_SIMILARITY;
  const picked = selected.map((item) => item.row);
  const top = picked[0];
  const newest = [...picked].sort(sortByNewest)[0];
  const categoriesSeen = Array.from(new Set(picked.map((row) => label(row.category))));
  const rising = picked.filter((row) => (row.delta ?? 0) > 0);
  const falling = picked.filter((row) => (row.delta ?? 0) < 0);
  const severities = picked
    .map((row) => row.severity)
    .filter((value): value is number => typeof value === "number");
  const meanSeverity = severities.length
    ? severities.reduce((sum, value) => sum + value, 0) / severities.length
    : null;

  return {
    summary: `${picked.length} stored ${picked.length === 1 ? "event matches" : "events match"} this question across ${categoriesSeen.join(", ")}. ${meanSeverity === null ? "" : `Mean stored severity is ${meanSeverity.toFixed(1)}/100.`} The strongest match is ${titleOf(top)}.`,
    what_changed: `Most recent matched record: ${sentence(newest)}${rising.length ? ` ${rising.length} matched ${rising.length === 1 ? "record is" : "records are"} scoring higher than before.` : ""}${falling.length ? ` ${falling.length} ${falling.length === 1 ? "is" : "are"} scoring lower.` : ""}`,
    why_it_matters:
      gri.displayScore !== null
        ? `The current verified GRI (${gri.methodologyVersion}) is ${gri.displayScore}/100. The matched set is supporting context for that broader index, not a separate probability or execution signal.`
        : "The canonical GRI is currently unavailable, so Geomacro is limiting this answer to the stored matched evidence instead of producing a private fallback score.",
    geomacro_view: lowConfidence
      ? `The matches are weak or tangential (mean relevance ${Math.round(meanSimilarity * 100)}%), so Geomacro is withholding interpretation.`
      : `Based only on stored records, ${label(top.category)} is the dominant thread in this question, led by ${titleOf(top)} at severity ${top.severity ?? "unscored"}/100. ${
          rising.length > falling.length
            ? "Recorded movement in the matched set is mainly upward."
            : falling.length > rising.length
              ? "Recorded movement in the matched set is mainly downward."
              : "Recorded movement in the matched set is mixed."
        }`,
    evidence: selected
      .filter(({ row }) => Boolean(row.source_url))
      .map(({ row, similarity }) => ({
        eventId: row.id,
        title: titleOf(row),
        sourceUrl: row.source_url as string,
        relevance: Math.round(similarity * 100),
      })),
    insufficient_evidence: false,
    mean_relevance: Number(meanSimilarity.toFixed(3)),
    low_confidence: lowConfidence,
    gri: gri.displayScore,
    generatedAt: new Date().toISOString(),
  };
}
