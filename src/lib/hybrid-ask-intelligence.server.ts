import { readB2PublicIntelligence, readB2PublicRisk } from "./b2-live.server";
import { riskIndicesFromGlobalRisk } from "./risk-indices-from-global-risk";
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
const RISK_INDEX_RE = /\b(risk\s+indices?|risk\s+index|geopolitical\s+risk|macro(?:economic)?\s+risk|critical[- ]minerals?\s+risk)\b/i;

function termsOf(question: string) {
  return Array.from(new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !STOPWORDS.has(term)),
  )).slice(0, 6);
}

function eventText(row: StoredEvent) {
  return `${row.summary ?? ""} ${row.narrative ?? ""} ${row.category ?? ""}`.toLowerCase();
}

function freshnessMaxAgeHours(question: string): number | null {
  if (!FRESHNESS_RE.test(question)) return null;
  if (/\b(now|latest|current|currently|real[ -]?time|breaking)\b/i.test(question)) return 6;
  return 24;
}

function compactStoredAnswer(
  question: string,
  rows: StoredEvent[],
  terms: string[],
  maxAgeHours: number | null,
): AskAnswer | null {
  if (!rows.length) return null;
  const now = Date.now();
  const eligible = maxAgeHours === null
    ? rows
    : rows.filter((row) => {
        const at = Date.parse(row.published_at ?? row.created_at);
        return Number.isFinite(at) && at <= now + 5 * 60_000 && now - at <= maxAgeHours * 3_600_000;
      });
  if (!eligible.length) return null;

  const ranked = eligible
    .map((row) => {
      const hay = eventText(row);
      const matches = terms.length ? terms.filter((term) => hay.includes(term)).length : 0;
      const coverage = terms.length ? matches / terms.length : 0;
      const ageHours = Math.max(0, (now - Date.parse(row.published_at ?? row.created_at)) / 3_600_000);
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
    summary: `Geomacro found ${selected.length} relevant verified intelligence records for your question${categories.length ? ` across ${categories.join(", ")}` : ""}.`,
    what_changed: statements.slice(0, 3).join(" "),
    why_it_matters: `These findings come from Geomacro's verified B2 intelligence continuity layer. The newest matched record is dated ${newest}.`,
    geomacro_view: "The stored evidence is sufficiently relevant to answer this question without a new external retrieval.",
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

async function riskIndexAnswer(question: string): Promise<AskAnswer | null> {
  if (!RISK_INDEX_RE.test(question)) return null;
  const risk = await readB2PublicRisk();
  if (!risk) return null;

  const projected = riskIndicesFromGlobalRisk(risk);
  const q = question.toLowerCase();
  const requested = projected.indices.filter((index) => {
    if (/geopolit/.test(q)) return index.key === "geopolitics";
    if (/macro/.test(q)) return index.key === "macro";
    if (/critical|minerals?/.test(q)) return index.key === "critical_minerals";
    return true;
  });
  const available = requested.filter((index) => index.status === "available" && index.score !== null);
  if (!available.length) return null;

  const levels = available.map((index) =>
    `${index.name}: ${index.score}/100${index.readingStatus === "last_verified" ? " (last verified)" : ""}`,
  );
  const leadingEvents = available
    .map((index) => index.topEvent?.title)
    .filter((value): value is string => Boolean(value));

  return {
    summary: `Geomacro's latest verified Risk Indices package shows ${levels.join("; ")}.`,
    what_changed: /\b(changed|change|movement|moved)\b/i.test(question)
      ? "The B2 continuity package preserves the verified current category levels but does not contain standalone per-index score-to-score change history. Geomacro therefore does not infer a movement from the historical combined-index attribution."
      : `Verified category levels: ${levels.join("; ")}.`,
    why_it_matters: leadingEvents.length
      ? `Leading verified context includes: ${leadingEvents.slice(0, 3).join("; ")}.`
      : "The category readings remain independently visible so geopolitical, macroeconomic and critical-mineral risk are not compressed into one headline score.",
    geomacro_view: projected.indices.some((index) => index.readingStatus === "last_verified")
      ? `This is a last-verified continuity reading from ${projected.snapshotAsOf}, not a claim of live freshness.`
      : `The package is verified as of ${projected.snapshotAsOf}.`,
    evidence: [],
    insufficient_evidence: false,
    mean_relevance: 1,
    low_confidence: false,
    gri: null,
    generatedAt: new Date().toISOString(),
  };
}

async function permanentReader(input: { question: string }) {
  // Risk-index questions have their own verified B2 package and should never be
  // forced through keyword matching over event rows.
  const riskAnswer = await riskIndexAnswer(input.question);
  if (riskAnswer) return { sufficient: true, data: riskAnswer };

  const terms = termsOf(input.question);
  if (!terms.length) return { sufficient: false, data: null };

  // Production permanent reads are B2-only. Freshness-sensitive questions may
  // use stored evidence only when the matched rows are themselves recent; stale
  // evidence falls through to bounded ephemeral retrieval instead.
  const b2Rows = b2StoredRows(await readB2PublicIntelligence());
  const b2Answer = compactStoredAnswer(
    input.question,
    b2Rows,
    terms,
    freshnessMaxAgeHours(input.question),
  );
  return b2Answer ? { sufficient: true, data: b2Answer } : { sufficient: false, data: null };
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
      // Let the permanent reader first prove that any B2 match satisfies the
      // freshness window. If it cannot, the engine proceeds to live retrieval.
      forceLive: false,
      cacheTtlMs: 5 * 60 * 1000,
      cacheMaxEntries: 128,
      maxFindingsPerGroup: 3,
    },
  });

  return liveToAskAnswer(runtime);
}
