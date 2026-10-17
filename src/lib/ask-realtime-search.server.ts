import { createHash } from "node:crypto";

import { groqClassifyJson } from "./groq.server";
import { buildRealtimeSearchPlan } from "./ask-realtime-query-plan";
import { resolveAskCountry } from "./ask-on-demand-original.server";
import type { AskAnswer } from "./ask-intelligence.server";
import type { HybridAskAnswer } from "./hybrid-ask-intelligence.server";

const GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const SEARCH_TIMEOUT_MS = 7_000;
const GROQ_TIMEOUT_MS = 9_000;
const MAX_RESULTS_PER_QUERY = 12;
const MAX_PUBLIC_EVIDENCE = 5;

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
  observedAt: string | null;
  domain: string;
};

type GroundedShape = {
  summary?: string;
  what_changed?: string;
  why_it_matters?: string;
  geomacro_view?: string;
  source_indexes?: number[];
};

function indexedDate(value: unknown): string | null {
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

function categoryLabel(value: string) {
  if (value === "CRITICAL_MINERALS") return "critical minerals";
  return value.toLowerCase().replace(/_/g, " ");
}

function shortUtcDate(value: string | null) {
  if (!value) return "current";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "current";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
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
        // GDELT seendate is a provider INDEX observation, not a publisher-native original clock.
        observedAt: indexedDate(article.seendate),
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
    const ageHours = hit.observedAt
      ? (now - Date.parse(hit.observedAt)) / 3_600_000
      : Number.POSITIVE_INFINITY;
    if (ageHours < -0.25 || ageHours > maxAgeHours) continue;
    const key = hit.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || byTitle.has(key)) continue;
    byTitle.set(key, hit);
  }

  const ordered = [...byTitle.values()].sort((a, b) =>
    Date.parse(b.observedAt ?? "") - Date.parse(a.observedAt ?? ""),
  );

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

/**
 * The discovery index receives ONLY fixed sector vocabulary and a canonical
 * country name, never the user's freeform research text. This allows
 * country-specific global search without leaking a private question or
 * accidentally substituting unrelated worldwide search hits.
 *
 * These GDELT observations remain UNVERIFIED index leads: no original page,
 * native publication clock, numeric observation or paid rights are inferred.
 */
export function planSafeRealtimeIndexQueries(question: string) {
  const plan = buildRealtimeSearchPlan(question);
  const country = resolveAskCountry(question);
  const countryPrefix = country
    ? '"' + country.name.replace(/"/g, "") + '" AND '
    : "";
  return {
    maxAgeHours: plan.maxAgeHours,
    timespan: plan.timespan,
    country_iso3: country?.iso3 ?? null,
    queries: CATEGORY_QUERIES
      .filter(spec => plan.broadCategories.includes(spec.category))
      .map(spec => ({
        category: spec.category,
        query: countryPrefix + "(" + spec.query + ")",
      })),
  };
}

async function currentSearch(question: string): Promise<SearchHit[]> {
  const plan = planSafeRealtimeIndexQueries(question);
  // Independent search failures cannot erase a reachable category.
  // At most three fixed-identifier index calls share the seven-second
  // deadline; no raw question or third-party article is served to customers.
  const batches = await Promise.allSettled(
    plan.queries.map(spec => searchGdelt(spec.query, spec.category, plan.timespan)),
  );
  return dedupeAndRank(
    batches.flatMap(result => result.status === "fulfilled" ? result.value : []),
    plan.maxAgeHours,
  );
}

function deterministicStructuredAnswer(hits: SearchHit[]): GroundedShape {
  const grouped = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    const rows = grouped.get(hit.category) ?? [];
    rows.push(hit);
    grouped.set(hit.category, rows);
  }
  const points = [...grouped.entries()].slice(0, 3).map(([category, rows], index) => {
    const newest = rows[0]?.observedAt ?? null;
    return `${index + 1}) ${categoryLabel(category)}: ${rows.length} recently indexed observations, latest ${shortUtcDate(newest)} UTC`;
  });
  const domains = new Set(hits.map((hit) => hit.domain).filter((domain) => domain !== "unknown"));
  return {
    summary: `Current search found activity across ${grouped.size} Geomacro risk ${grouped.size === 1 ? "domain" : "domains"}.`,
    what_changed: points.join("; "),
    why_it_matters: `${hits.length} recently indexed observations were checked${domains.size ? ` across ${domains.size} independent publication paths` : ""}; raw source headlines and provider identity remain private.`,
    geomacro_view: "This is a current-evidence brief, not a synthetic risk score or forecast.",
    source_indexes: Array.from({ length: Math.min(3, hits.length) }, (_, index) => index),
  };
}

async function structureWithGroundedModel(question: string, hits: SearchHit[]): Promise<GroundedShape> {
  try {
    return await groqClassifyJson<GroundedShape>({
      system:
        "You are Ask Geomacro's realtime evidence formatter. Answer ONLY from the supplied current search findings. " +
        "Do not invent facts, dates, numbers, causes, sources or URLs. Do not name publishers or search providers. " +
        "The supplied indexed_at is a search index timestamp, NOT the publisher original publication time. Do not claim the event was published today, verified, or independently corroborated. " +
        "Paraphrase the findings; do not reproduce source headlines verbatim. " +
        "For broad current-change questions, put the 2 to 4 most material supported developments in what_changed using compact '1) ...; 2) ...' form. " +
        "Keep summary to one short sentence. Keep why_it_matters and geomacro_view concise and analytical, not generic. " +
        "If support is thin, phrase cautiously rather than fabricating certainty. Return JSON with summary, what_changed, why_it_matters, geomacro_view, source_indexes.",
      user: JSON.stringify({
        question,
        findings: hits.map((hit, index) => ({
          index,
          category: hit.category,
          title: hit.title,
          indexed_at: hit.observedAt,
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
    .update(`${hit.category}\0${hit.title}\0${hit.observedAt ?? ""}\0${index}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function publicEvidenceLabel(hit: SearchHit, index: number) {
  return `Geomacro indexed lead ${index + 1} · ${categoryLabel(hit.category)} · seen ${shortUtcDate(hit.observedAt)} UTC`;
}

export async function realtimeSearchAnswer(
  question: string,
  prior: HybridAskAnswer,
  options: { deterministicOnly?: boolean } = {},
): Promise<HybridAskAnswer | null> {
  const hits = await currentSearch(question);
  if (!hits.length) return null;

  // Broad free-news discovery does not require an optional hosted formatter.
  const grounded = options.deterministicOnly
    ? deterministicStructuredAnswer(hits)
    : await structureWithGroundedModel(question, hits);
  const indexes = safeIndexes(grounded.source_indexes, hits.length);
  const evidence = indexes.map((index) => ({
    eventId: fallbackId(hits[index], index),
    title: publicEvidenceLabel(hits[index], index),
    relevance: Math.max(70, 100 - index * 5),
  }));
  if (!evidence.length) return null;

  // Independent domains do NOT prove independent same-event verification or
  // native publication clocks. An index lead is always unverified.
  const lowConfidence = true;

  const answer: AskAnswer = {
    summary: "An exact current answer is unavailable: search-index leads do not verify original publisher facts.",
    what_changed: "Indexed leads were observed, but original publisher dates and exact country/topic claims are unconfirmed.",
    why_it_matters: "Indexed observation dates are not original publisher release dates. " + String(
      grounded.why_it_matters ??
        "These are current externally observed developments and should be read as evidence, not as a synthetic risk score.",
    ).trim(),
    geomacro_view: "Search discovery does not certify an event, exact figure, risk score, source rights or signature.",
    evidence,
    insufficient_evidence: true,
    mean_relevance: null,
    low_confidence: lowConfidence,
    gri: null,
    generatedAt: new Date().toISOString(),
  };

  return {
    ...answer,
    data_mode: "ephemeral_live",
    cache_status: "bypassed",
    source_identity_exposed: false,
    durable_live_storage_write: false,
    real_time_message: "Stored/official evidence insufficient; recently indexed leads are unverified and not signed commercial intelligence.",
    intelligence_tier: "index_observation_unverified",
    signed_gro_generated: false,
    independent_same_event_verification: false,
  };
}
