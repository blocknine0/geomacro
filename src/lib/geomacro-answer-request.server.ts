import {
  COUNTRIES_195,
  country195ByIso3,
} from "./canonical-country-registry-195";
import {
  AGENT_QUERY_SCHEMA_VERSION,
  AGENT_QUERY_TOPICS,
  agentAdaptiveQuerySchema,
  buildAgentQueryPlan,
  inferAgentQueryTopics,
} from "./agent-query-plan";

const MAX_QUESTION_CHARS = 1_000;
const AMBIGUOUS_NAMES = new Set([
  "chad", "georgia", "jordan", "guinea", "dominica", "congo", "samoa", "turkey",
]);
const norm = (value: string) => value.normalize("NFKC")
  .replace(/[\u2019\u02bc\u02bb]/gu, "'").replace(/\s+/gu, " ").trim();
const esc = (value: string) => [...value]
  .map((character) => (".*+?^$()|[]{}\\".includes(character) ? "\\" + character : character))
  .join("");

const MATCHERS = COUNTRIES_195.flatMap((country) =>
  [country.name, ...country.aliases].map(norm).filter((label) => label.length >= 4).map((label) => ({
    iso3: country.iso3,
    label,
    ambiguous: AMBIGUOUS_NAMES.has(label.toLowerCase()),
    re: new RegExp("(?<![\\p{L}\\p{M}\\p{N}])" + esc(label) + "(?![\\p{L}\\p{M}\\p{N}])", "giu"),
  })),
);

export function countriesInAnswerQuestion(text: string): { iso3s: string[]; ambiguous: boolean } {
  const normalized = norm(text);
  const hits: Array<{ iso3: string; start: number; end: number; ambiguous: boolean }> = [];
  for (const matcher of MATCHERS) {
    matcher.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.re.exec(normalized)) !== null) {
      hits.push({ iso3: matcher.iso3, start: match.index, end: match.index + match[0].length, ambiguous: matcher.ambiguous });
    }
  }
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const chosen: typeof hits = [];
  for (const hit of hits) {
    if (chosen.some((entry) => hit.start >= entry.start && hit.end <= entry.end)) continue;
    if (chosen.some((entry) => hit.start < entry.end && entry.start < hit.end)) continue;
    chosen.push(hit);
  }
  return {
    iso3s: [...new Set(chosen.map((entry) => entry.iso3))].sort(),
    ambiguous: chosen.some((entry) => entry.ambiguous),
  };
}

export type AnswerQuestionNormalization =
  | { ok: true; value: unknown; normalized: boolean }
  | { ok: false; code: string; detail?: Record<string, unknown> };

/**
 * Adds deterministic question -> country/topic planning to the existing
 * production API. The resulting request still passes canonical Geomacro
 * deliverability, commercial-rights, signed-proof and x402 gates.
 * This is only request planning, never an evidence source or payment authority.
 */
export function normalizeAnswerQuestionRequest(raw: unknown): AnswerQuestionNormalization {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: true, value: raw, normalized: false };
  }
  const input = raw as Record<string, unknown>;
  if (Object.hasOwn(input, "subjects") || typeof input.question !== "string") {
    return { ok: true, value: raw, normalized: false };
  }
  const allowed = new Set(["question", "max_age_seconds", "client_request_id"]);
  const extra = Object.keys(input).filter((key) => !allowed.has(key));
  if (extra.length) return { ok: false, code: "QUESTION_ONLY_FIELDS_UNSUPPORTED", detail: { fields: extra.sort() } };
  const question = input.question;
  if (!question.trim() || question.length > MAX_QUESTION_CHARS) {
    return { ok: false, code: "QUESTION_INVALID_OR_TOO_LONG" };
  }

  const found = countriesInAnswerQuestion(question);
  if (found.ambiguous) return { ok: false, code: "AMBIGUOUS_SUBJECT", detail: { hint: "Use an explicit ISO3 country code or structured subjects." } };
  if (found.iso3s.length === 0) return { ok: false, code: "SUBJECT_REQUIRED" };
  if (found.iso3s.some((iso3) => !country195ByIso3(iso3))) return { ok: false, code: "UNKNOWN_SUBJECT" };

  const topics = [...new Set(inferAgentQueryTopics(question))].sort();
  if (topics.length === 0) return { ok: false, code: "TOPIC_REQUIRED" };
  const invalid = topics.filter((topic) => !(AGENT_QUERY_TOPICS as readonly string[]).includes(topic));
  if (invalid.length) return { ok: false, code: "INVALID_TOPIC", detail: { invalid } };
  // These products have separate request schemas and proof requirements. Never
  // disguise them as a general Intelligence Query or silently select a price.
  if (topics.some((topic) => ["risk_gate", "risk_object", "gri_context"].includes(topic))) {
    return { ok: false, code: "STRUCTURED_PRODUCT_REQUIRED", detail: { hint: "Use an explicit product query for Risk Gate, signed Risk Object or GRI context." } };
  }

  const variant = found.iso3s.length === 1 && topics.length === 1 ? "focused"
    : found.iso3s.length === 1 && topics.length <= 3 ? "standard" : "complex_multi_source";
  const query: Record<string, unknown> = {
    schema_version: AGENT_QUERY_SCHEMA_VERSION,
    question,
    subjects: found.iso3s.map((country_iso3) => ({ type: "country", country_iso3 })),
    topics,
    product: { capability: "intelligence_query", variant },
    evidence: "required",
    detail: variant === "focused" ? "compact" : variant === "standard" ? "standard" : "full",
    fulfillment_mode: "published_only",
    delivery_tier: "signed_risk_intelligence",
    ...(typeof input.max_age_seconds === "number" ? { max_age_seconds: input.max_age_seconds } : {}),
    ...(typeof input.client_request_id === "string" ? { client_request_id: input.client_request_id } : {}),
  };
  try {
    const parsed = agentAdaptiveQuerySchema.parse(query);
    // Check semantic intent and exact product scope before a payment challenge
    // can be constructed. The canonical route repeats this validation.
    buildAgentQueryPlan(parsed);
    return { ok: true, value: parsed, normalized: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof Error ? error.message : "QUESTION_PLAN_INVALID",
    };
  }
}
