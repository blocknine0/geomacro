import { readB2PublicIntelligence } from "./b2-live.server";
import { getAppSupabase } from "./supabase-app.server";
import type { AskAnswer } from "./ask-intelligence.server";

type PublicFinding = {
  category?: string | null;
  country_iso3?: string | null;
  published_at?: string | null;
  observed_at?: string | null;
  title?: string | null;
  summary?: string | null;
  metric?: string | null;
  value_numeric?: number | null;
  value_text?: string | null;
  unit?: string | null;
  event_type?: string | null;
  signal_type?: string | null;
  confidence?: number | null;
};

type PublicGroup = {
  verified?: boolean;
  corroborated?: boolean;
  independent_source_count?: number;
  trusted_independent_source_count?: number;
  findings?: PublicFinding[];
};

type HybridRuntimeAnswer = {
  data_mode: "permanent" | "ephemeral_live" | "short_cache";
  cache_status: "bypassed" | "hit" | "miss";
  message: string;
  source_identity_exposed: false;
  durable_live_storage_write: false;
  generated_at: string;
  served_at?: string;
  data?: AskAnswer;
  findings?: PublicGroup[];
  verified_group_count?: number;
  observation_count?: number;
  insufficient_evidence?: boolean;
};

export type HybridAskAnswer = AskAnswer & {
  data_mode: HybridRuntimeAnswer["data_mode"];
  cache_status: HybridRuntimeAnswer["cache_status"];
  source_identity_exposed: false;
  durable_live_storage_write: false;
  real_time_message?: string;
};

type StoredEvent = {
  id: string;
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
  "what", "when", "where", "which", "who", "why", "how", "the", "and", "for", "with",
  "from", "into", "about", "this", "that", "these", "those", "are", "was", "were", "is",
  "has", "have", "had", "does", "did", "can", "could", "would", "should", "will", "risk",
  "risks", "geomacro", "show", "tell", "give", "please", "latest", "current", "recent", "today",
]);

const FRESHNESS_RE = /\b(now|today|latest|current|currently|real[ -]?time|breaking|recent|recently|last\s+\d+\s*(minute|minutes|hour|hours|day|days)|past\s+\d+\s*(minute|minutes|hour|hours|day|days))\b/i;

function termsOf(question: string) {
  return Array.from(new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !STOPWORDS.has(term)),
  )).slice(0, 6);
}

function safeFilterTerm(value: string) {
  return value.replace(/[%,()]/g, " ").trim();
}

function eventText(row: StoredEvent) {
  return `${row.summary ?? ""} ${row.narrative ?? ""} ${row.category ?? ""}`.toLowerCase();
}

function compactStoredAnswer(question: string, rows: StoredEvent[], terms: string[]): AskAnswer | null {
  if (!rows.length) return null;

  const ranked = rows
    .map((row) => {
      const hay = eventText(row);
      const matches = terms.length ? terms.filter((term) => hay.includes(term)).length : 0;
      const coverage = terms.length ? matches / terms.length : 0;
      const ageHours = Math.max(0, (Date.now() - Date.parse(row.published_at ?? row.created_at)) / 3_600_000);
      const recency = Math.max(0, 1 - ageHours / (24 * 90));
      const confidence = typeof row.confidence === "number" ? row.confidence : 0.5;
      return { row, relevance: Math.min(1, coverage * 0.7 + recency * 0.2 + confidence * 0.1) };
    })
    .sort((a, b) => b.relevance - a.relevance);

  const selected = ranked.filter((item) => item.relevance >= 0.45).slice(0, 5);
  if (!selected.length) return null;

  const mean = selected.reduce((sum, item) => sum + item.relevance, 0) / selected.length;
  if (mean < 0.5) return null;

  const statements = selected
    .map(({ row }) => (row.summary ?? row.narrative ?? "").trim())
    .filter(Boolean);
  if (!statements.length) return null;

  const categories = Array.from(new Set(selected.map(({ row }) => row.category).filter(Boolean)));
  const newest = selected
    .map(({ row }) => row.published_at ?? row.created_at)
    .sort()
    .at(-1) ?? new Date().toISOString();

  return {
    summary: `Geomacro found ${selected.length} relevant internal intelligence records for your question${categories.length ? ` across ${categories.join(", ")}` : ""}.`,
    what_changed: statements.slice(0, 3).join(" "),
    why_it_matters: `These findings come from Geomacro's compact current intelligence layer. The newest matched record is dated ${newest}.`,
    geomacro_view: `The internal evidence is sufficiently relevant to answer this question without a new external retrieval.`,
    evidence: selected.map(({ row, relevance }) => ({
      eventId: row.id,
      title: (row.summary ?? row.narrative ?? "Geomacro finding").slice(0, 180),
      relevance: Math.round(relevance * 100),
    })),
    insufficient_evidence: false,
    mean_relevance: Number(mean.toFixed(3)),
    low_confidence: false,
    gri: null,
    generatedAt: new Date().toISOString(),
  };
}

function b2StoredRows(rows: Awaited<ReturnType<typeof readB2PublicIntelligence>>): StoredEvent[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    summary: row.summary ?? row.source_title,
    narrative: null,
    severity: row.severity,
    confidence: null,
    delta: row.delta,
    published_at: row.published_at,
    created_at: row.created_at,
  }));
}

async function permanentReader(input: { question: string }) {
  if (FRESHNESS_RE.test(input.question)) return { sufficient: false, data: null };

  const terms = termsOf(input.question);
  if (!terms.length) return { sufficient: false, data: null };

  // Independent read path first. This lets non-fresh Ask queries keep working
  // when Supabase is degraded or intentionally paused.
  const b2Rows = b2StoredRows(await readB2PublicIntelligence());
  const b2Answer = compactStoredAnswer(input.question, b2Rows, terms);
  if (b2Answer) return { sufficient: true, data: b2Answer };

  const db = getAppSupabase();
  if (!db) return { sufficient: false, data: null };

  const filters = terms.slice(0, 4).flatMap((term) => {
    const safe = safeFilterTerm(term);
    return [`summary.ilike.%${safe}%`, `narrative.ilike.%${safe}%`, `category.ilike.%${safe}%`];
  });

  const since = new Date(Date.now() - 90 * 24 * 3_600_000).toISOString();
  const { data, error } = await db
    .from("events")
    .select("id,category,summary,narrative,severity,confidence,delta,published_at,created_at")
    .gte("created_at", since)
    .or(filters.join(","))
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (error) {
    console.error("[hybridAsk] permanent reader unavailable", error.message);
    return { sufficient: false, data: null };
  }

  const answer = compactStoredAnswer(input.question, (data ?? []) as StoredEvent[], terms);
  return answer ? { sufficient: true, data: answer } : { sufficient: false, data: null };
}

function findingSentence(finding: PublicFinding) {
  const text = String(finding.summary ?? finding.title ?? "").trim();
  if (text) return text;
  if (finding.metric && finding.value_numeric !== null && finding.value_numeric !== undefined) {
    return `${finding.metric}: ${finding.value_numeric}${finding.unit ? ` ${finding.unit}` : ""}.`;
  }
  if (finding.metric && finding.value_text) return `${finding.metric}: ${finding.value_text}.`;
  return "";
}

function liveToAskAnswer(runtime: HybridRuntimeAnswer): HybridAskAnswer {
  if (runtime.data_mode === "permanent" && runtime.data) {
    return {
      ...runtime.data,
      data_mode: runtime.data_mode,
      cache_status: runtime.cache_status,
      source_identity_exposed: false,
      durable_live_storage_write: false,
    };
  }

  const groups = runtime.findings ?? [];
  const preferred = groups.filter((group) => group.verified || group.corroborated);
  const usable = preferred.length ? preferred : groups;
  const flattened = usable.flatMap((group) =>
    (group.findings ?? []).map((finding) => ({ finding, group })),
  ).slice(0, 5);
  const sentences = flattened.map(({ finding }) => findingSentence(finding)).filter(Boolean);
  const confidences = flattened
    .map(({ finding }) => finding.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const mean = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : runtime.insufficient_evidence ? 0 : 0.75;
  const independent = Math.max(0, ...usable.map((group) => Number(group.independent_source_count ?? 0)));
  const insufficient = Boolean(runtime.insufficient_evidence) || !sentences.length;

  return {
    summary: runtime.message,
    what_changed: sentences.length
      ? sentences.slice(0, 3).join(" ")
      : "Geomacro did not find enough independently verified real-time evidence to make a stronger claim.",
    why_it_matters: insufficient
      ? "Geomacro is withholding a stronger conclusion until the live evidence is sufficient."
      : `Geomacro cross-checked the live findings internally${independent ? ` across up to ${independent} independent source paths` : ""} before producing this structured answer.`,
    geomacro_view: insufficient
      ? "No stronger interpretation is produced when real-time evidence is insufficient."
      : "These are real-time structured findings generated for this question. Source identities remain private and are not exposed in the public response.",
    evidence: flattened.map(({ finding }, index) => ({
      eventId: `live:${index + 1}`,
      title: (findingSentence(finding) || "Geomacro real-time finding").slice(0, 180),
      relevance: Math.max(0, Math.min(100, Math.round((finding.confidence ?? mean) * 100))),
    })),
    insufficient_evidence: insufficient,
    mean_relevance: flattened.length ? Number(mean.toFixed(3)) : null,
    low_confidence: insufficient || mean < 0.5,
    gri: null,
    generatedAt: runtime.generated_at,
    data_mode: runtime.data_mode,
    cache_status: runtime.cache_status,
    source_identity_exposed: false,
    durable_live_storage_write: false,
    real_time_message: runtime.message,
  };
}

export async function answerQuestion(question: string): Promise<HybridAskAnswer> {
  // JS runtime is intentionally shared with machine/API delivery so the storage,
  // cache and source-redaction policy has one canonical implementation.
  // @ts-expect-error The runtime is authored as ESM JavaScript and has no TS declaration file.
  const runtimeModule = await import("../../global-intelligence/engine/intelligence-engine.mjs") as {
    answerQuestion: (
      question: string,
      options?: {
        permanentReader?: typeof permanentReader;
        options?: Record<string, unknown>;
      },
    ) => Promise<HybridRuntimeAnswer>;
  };

  const runtime = await runtimeModule.answerQuestion(question, {
    permanentReader,
    options: {
      forceLive: FRESHNESS_RE.test(question),
      cacheTtlMs: 5 * 60 * 1000,
      cacheMaxEntries: 128,
      maxFindingsPerGroup: 3,
    },
  });

  return liveToAskAnswer(runtime);
}
