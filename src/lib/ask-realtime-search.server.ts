import { createHash } from "node:crypto";

import { groqClassifyJson } from "./groq.server";
import type { AskAnswer } from "./ask-intelligence.server";
import type { HybridAskAnswer } from "./hybrid-ask-intelligence.server";

const GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const SEARCH_TIMEOUT_MS = 7_000;
const GROQ_TIMEOUT_MS = 9_000;
const MAX_RESULTS_PER_QUERY = 12;
const MAX_PUBLIC_EVIDENCE = 5;

const BROAD_CURRENT_RE =
  /\b(what changed|what happened|today|latest|current developments?|recent developments?|what is happening|what's happening|right now)\b/i;

const CATEGORY_QUERIES = [
  {
    category: "GEOPOLITICS",
    query: "conflict OR sanctions OR military OR election OR diplomatic OR tariff OR shipping OR border",
  },
  {
    category: "MACRO",
    query: 'inflation OR "central bank" OR "interest rate" OR currency OR recession OR GDP OR trade',
  },
  {
    category: "CRITICAL_MINERALS",
    query: '"critical minerals" OR "rare earth" OR lithium OR cobalt OR nickel OR graphite OR copper',
  },
] as const;

type SearchHit = {
  category: string;
  title: string;
  publishedAt: string | null;
  domain: string;
};

type GroundedShape = {
  summary?: string;
  what_changed?: string;
  why_it_matters?: string;
  geomacro_view?: string;
  source_indexes?: number[];
};

function normalizeQuestion(value: string) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function articleDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(
    /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2}).*$/,
    "$1-$2-$3T$4:$5:$6Z",
  );
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function hostname(value: unknown): string {
  try {
    return new URL(String(value ?? "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

async function searchGdelt(query: string, category: string, timespan: string): Promise<SearchHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      query,
      mode: "ArtList",
      format: "json",
      maxrecords: String(MAX_RESULTS_PER_QUERY),
      sort: "HybridRel",
      timespan,
    });
    const response = await fetch(`${GDELT_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`GDELT_HTTP_${response.status}`);
    const payload = (await response.json()) as { articles?: Array<Record<string, unknown>> };
    return (payload.articles ?? [])
      .map((article) => ({
        category,
        title: String(article.title ?? "").replace(/\s+/g, " ").trim(),
        publishedAt: articleDate(article.seendate),
        domain: hostname(article.url),
      }))
      .filter((item) => item.title.length >= 12);
  } finally {
    clearTimeout(timer);
  }
}

function dedupeAndRank(hits: SearchHit[], maxAgeHours: number): SearchHit[] {
  const now = Date.now();
  const byTitle = new Map<string, SearchHit>();
  for (const hit of hits) {
    const ageHours = hit.publishedAt
      ? (now - Date.parse(hit.publishedAt)) / 3_600_000
      : Number.POSITIVE_INFINITY;
    if (ageHours < -0.25 || ageHours > maxAgeHours) continue;
    const key = hit.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || byTitle.has(key)) continue;
    byTitle.set(key, hit);
  }

  const ordered = [...byTitle.values()].sort((a, b) =>
    Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""),
  );

  // Keep current coverage broad where possible instead of letting one publisher
  // or one risk domain dominate a broad realtime answer.
  const selected: SearchHit[] = [];
  const domains = new Set<string>();
  const categories = new Set<string>();
  for (const hit of ordered) {
    const independent = hit.domain === "unknown" || !domains.has(hit.domain);
    const newCategory = !categories.has(hit.category);
    if ((independent || newCategory) && selected.length < 8) {
      selected.push(hit);
      domains.add(hit.domain);
      categories.add(hit.category);
    }
  }
  for (const hit of ordered) {
    if (selected.length >= 8) break;
    if (!selected.includes(hit)) selected.push(hit);
  }
  return selected;
}

async function currentSearch(question: string): Promise<SearchHit[]> {
  const clean = normalizeQuestion(question);
  const broad = BROAD_CURRENT_RE.test(question) || clean.split(" ").length <= 3;
  const maxAgeHours = broad ? 48 : 7 * 24;
  const timespan = broad ? "2d" : "7d";

  if (broad) {
    const batches = await Promise.allSettled(
      CATEGORY_QUERIES.map((spec) => searchGdelt(spec.query, spec.category, timespan)),
    );
    return dedupeAndRank(
      batches.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
      maxAgeHours,
    );
  }

  const category = /mineral|rare earth|lithium|cobalt|nickel|graphite|copper/i.test(question)
    ? "CRITICAL_MINERALS"
    : /inflation|rate|central bank|currency|gdp|recession|trade|macro/i.test(question)
      ? "MACRO"
      : "GEOPOLITICS";
  return dedupeAndRank(await searchGdelt(clean, category, timespan), maxAgeHours);
}

function deterministicStructuredAnswer(hits: SearchHit[]): GroundedShape {
  const selected = hits.slice(0, 3);
  const points = selected.map((hit, index) => `${index + 1}) ${hit.title}`);
  const domains = new Set(hits.map((hit) => hit.domain).filter((domain) => domain !== "unknown"));
  const categories = new Set(hits.map((hit) => hit.category));
  return {
    summary: points.join("; "),
    what_changed: points.join("; "),
    why_it_matters: `Current public evidence spans ${categories.size} risk ${categories.size === 1 ? "domain" : "domains"}${domains.size ? ` across ${domains.size} independent publication paths` : ""}.`,
    geomacro_view: "This is a current-evidence brief, not a synthetic risk score or forecast.",
    source_indexes: selected.map((_, index) => index),
  };
}

async function structureWithGroundedModel(question: string, hits: SearchHit[]): Promise<GroundedShape> {
  try {
    return await groqClassifyJson<GroundedShape>({
      system:
        "You are Ask Geomacro's realtime evidence formatter. Answer ONLY from the supplied current search findings. " +
        "Do not invent facts, dates, numbers, causes, sources or URLs. Do not name publishers or search providers. " +
        "For broad current-change questions, put the 2 to 4 most material supported developments in what_changed using compact '1) ...; 2) ...' form. " +
        "Keep summary to one short sentence. Keep why_it_matters and geomacro_view concise and analytical, not generic. " +
        "If support is thin, phrase cautiously rather than fabricating certainty. Return JSON with summary, what_changed, why_it_matters, geomacro_view, source_indexes.",
      user: JSON.stringify({
        question,
        findings: hits.map((hit, index) => ({
          index,
          category: hit.category,
          title: hit.title,
          published_at: hit.publishedAt,
        })),
      }),
      temperature: 0.1,
      timeoutMs: GROQ_TIMEOUT_MS,
    });
  } catch (error) {
    console.error(
      "[ask-realtime-search] grounded formatter unavailable; using deterministic structure",
      error instanceof Error ? error.message : "unknown error",
    );
    return deterministicStructuredAnswer(hits);
  }
}

function safeIndexes(indexes: number[] | undefined, length: number) {
  const cleaned = Array.from(
    new Set((indexes ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value < length)),
  );
  return (cleaned.length ? cleaned : Array.from({ length: Math.min(3, length) }, (_, index) => index))
    .slice(0, MAX_PUBLIC_EVIDENCE);
}

function fallbackId(hit: SearchHit, index: number) {
  return `web:realtime:${createHash("sha256")
    .update(`${hit.category}\0${hit.title}\0${hit.publishedAt ?? ""}\0${index}`)
    .digest("hex")
    .slice(0, 16)}`;
}

export async function realtimeSearchAnswer(
  question: string,
  prior: HybridAskAnswer,
): Promise<HybridAskAnswer | null> {
  const hits = await currentSearch(question);
  if (!hits.length) return null;

  const grounded = await structureWithGroundedModel(question, hits);
  const indexes = safeIndexes(grounded.source_indexes, hits.length);
  const evidence = indexes.map((index) => ({
    eventId: fallbackId(hits[index], index),
    title: hits[index].title.slice(0, 180),
    relevance: Math.max(70, 100 - index * 5),
  }));
  if (!evidence.length) return null;

  const independentDomains = new Set(
    hits
      .filter((_, index) => indexes.includes(index))
      .map((hit) => hit.domain)
      .filter((domain) => domain !== "unknown"),
  ).size;
  const lowConfidence = independentDomains < 2 || evidence.length < 2;

  const answer: AskAnswer = {
    summary: String(grounded.summary ?? grounded.what_changed ?? "Current evidence was found.").trim(),
    what_changed: String(grounded.what_changed ?? grounded.summary ?? "Current evidence was found.").trim(),
    why_it_matters: String(
      grounded.why_it_matters ??
        "These are current externally observed developments and should be read as evidence, not as a synthetic risk score.",
    ).trim(),
    geomacro_view: String(
      grounded.geomacro_view ??
        "Geomacro is presenting the current evidence directly without inventing unsupported certainty.",
    ).trim(),
    evidence,
    insufficient_evidence: false,
    mean_relevance: lowConfidence ? 0.65 : 0.85,
    low_confidence: lowConfidence,
    gri: prior.gri,
    generatedAt: new Date().toISOString(),
  };

  return {
    ...answer,
    data_mode: "ephemeral_live",
    cache_status: "bypassed",
    source_identity_exposed: false,
    durable_live_storage_write: false,
    real_time_message: "Stored evidence was insufficient, so Geomacro checked current public evidence in real time.",
  };
}
