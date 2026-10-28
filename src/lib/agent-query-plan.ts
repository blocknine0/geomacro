import { createHash } from "node:crypto";
import { resolveMultilingualQueryVocabulary } from "./multilingual-query-dictionary";
import { z } from "zod";
import { storeProductSelectionSchema, assertStoreProductScope, isStructuralStoreProduct,
  type StoreProductSelection } from "./store-product-selection";

export const AGENT_QUERY_SCHEMA_VERSION = "geomacro.agent-query.v1" as const;

export const AGENT_QUERY_TOPICS = [
  "sovereign_risk", "macro_risk", "fx_external_risk", "sanctions_restrictions",
  "conflict_geopolitics", "trade_corridor", "energy_commodities", "critical_minerals",
  "political_governance", "banking_financial_system", "food_agriculture", "natural_hazards",
  "hot_topics", "risk_gate", "risk_object", "gri_context",
] as const;
export type AgentQueryTopic = (typeof AGENT_QUERY_TOPICS)[number];

export const AGENT_QUERY_INTENTS = [
  "single_subject",
  "comparison",
  "ranking_filter",
  "corridor",
  "change_since",
  "audit",
  "risk_gate",
] as const;
export type AgentQueryIntent = (typeof AGENT_QUERY_INTENTS)[number];

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const country = z.object({ type: z.literal("country"), country_iso3: iso3 });
const corridor = z.object({
  type: z.literal("corridor"), origin_country_iso3: iso3, destination_country_iso3: iso3,
}).superRefine((value, ctx) => {
  if (value.origin_country_iso3 === value.destination_country_iso3) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Corridor endpoints must differ" });
  }
});

const riskGateContext = z.object({
  policy_preset: z.enum(["balanced", "cautious", "strict"]).default("balanced"),
  action_type: z.enum(["treasury_payment", "vendor_payment", "agent_payment", "exposure_review"]),
  amount_usdc: z.number().finite().positive().max(1_000_000_000).optional(),
}).strict();

const rankingSpec = z.object({
  metric: z.literal("risk_object_score"),
  order: z.enum(["high_to_low", "low_to_high"]).default("high_to_low"),
  limit: z.number().int().positive().max(25).optional(),
}).strict();

const changeSpec = z.object({
  baseline: z.literal("previous_published"),
}).strict();

export const agentAdaptiveQuerySchema = z.object({
  product: storeProductSelectionSchema.optional(),
  schema_version: z.literal(AGENT_QUERY_SCHEMA_VERSION).default(AGENT_QUERY_SCHEMA_VERSION),
  question: z.string().trim().min(3).max(2_000).optional(),
  // Optional language is included in a NEW request hash only when explicitly
  // selected; all historical x402 query fingerprints remain unchanged.
  response_locale: z.enum(["en","bn","hi"]).optional(),
  subjects: z.array(z.union([country, corridor])).min(1).max(25),
  topics: z.array(z.enum(AGENT_QUERY_TOPICS)).max(16).default([]),
  intent: z.enum(AGENT_QUERY_INTENTS).optional(),
  ranking: rankingSpec.optional(),
  change: changeSpec.optional(),
  as_of: z.string().datetime({ offset: true }).optional(),
  // Optional request-wide freshness override. It can only make the built-in
  // module SLA stricter, never relax it. Structural and live-event data have
  // deliberately different publication cadences.
  max_age_seconds: z.number().int().positive().max(94_608_000).optional(),
  evidence: z.enum(["required", "summary"]).default("required"),
  detail: z.enum(["compact", "standard", "full"]).default("standard"),
  // Explicit opt-in; legacy signed-GRO queries retain original delivery contract.
  fulfillment_mode: z.enum(["published_only", "live_on_demand"]).default("published_only"),
  // A deliberately narrow, separately payment-hashed earnings pilot. This
  // is original-dated structural research, NOT a current signed risk object.
  // Legacy callers retain their pre-existing payment query hashes byte-for-byte.
  delivery_tier: z.enum(["signed_risk_intelligence", "structural_baseline"])
    .default("signed_risk_intelligence"),
  risk_gate_context: riskGateContext.optional(),
  client_request_id: z.string().trim().min(4).max(128).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.question && value.topics.length === 0 && !value.intent) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["topics"], message: "Provide at least one explicit topic, intent, or a question that can be deterministically classified" });
  }
});
export type AgentAdaptiveQuery = z.infer<typeof agentAdaptiveQuerySchema>;

const BASELINE_TOPICS = new Set<AgentQueryTopic>([
  "sovereign_risk", "macro_risk", "fx_external_risk",
  "critical_minerals", "conflict_geopolitics",
]);
const LIVE_OR_SIGNED_QUESTION = /\b(?:current|latest|real[- ]?time|today|tonight|yesterday|now|this week|this month|forecast|predict|signed|risk object|risk score|risk index|gri|change|movement|what happened|risk gate|should .* (?:pay|proceed))\b/i;

/**
 * The first paid pilot may sell an actually available governed STRUCTURAL
 * module (annual/monthly original observations) without requiring or
 * pretending to issue current signed GRO/GRI. Buyer must explicitly opt in
 * and no cross-product risk claim is silently reinterpreted.
 */
export function assertStructuralBaselinePilot(input: AgentAdaptiveQuery) {
  if (input.delivery_tier !== "structural_baseline") return;
  if (isStructuralStoreProduct(input.product)) {
    assertStoreProductScope(input);
    if (input.question && (LIVE_OR_SIGNED_QUESTION.test(input.question) ||
        inferAgentQueryTopics(input.question).some(topic => !input.topics.includes(topic)) ||
        inferAgentQueryIntent(input.question) !== null))
      throw Error("STORE_STRUCTURAL_QUESTION_SCOPE_UNSUPPORTED");
    return;
  }
  if (input.fulfillment_mode !== "published_only" ||
      input.subjects.length !== 1 || input.subjects[0]?.type !== "country" ||
      input.topics.length !== 1 || !BASELINE_TOPICS.has(input.topics[0]) ||
      input.as_of !== undefined || input.risk_gate_context !== undefined ||
      input.change !== undefined || input.ranking !== undefined ||
      (input.intent && input.intent !== "single_subject") ||
      (input.question && (LIVE_OR_SIGNED_QUESTION.test(input.question) ||
        !input.question.replace(/\s+/g," ").trim() ||
        // Explicit pilot topic is an exact buyer contract: a request asking
        // about another domain cannot be silently billed as the selected one.
        inferAgentQueryTopics(input.question).some(topic => topic !== input.topics[0]) ||
        inferAgentQueryIntent(input.question) !== null))) {
    throw Error("STRUCTURAL_BASELINE_PILOT_SCOPE_UNSUPPORTED");
  }
}

/** An explicit single-country structural digest describes ONE measured module,
 * never an entire multi-dimensional country risk state. The current signed
 * intelligence tier retains the wider original module requirements and plan
 * hashes without modification. This is scope reduction, NOT rights waiver. */
const BASELINE_MODULE_BY_TOPIC: Partial<Record<AgentQueryTopic, string>> = {
  sovereign_risk:"sovereign_fiscal",
  macro_risk:"macro_monetary",
  fx_external_risk:"external_fx",
  conflict_geopolitics:"geopolitical_security",
  critical_minerals:"critical_minerals",
};
const TOPIC_MODULES: Record<AgentQueryTopic, readonly string[]> = {
  sovereign_risk: ["sovereign_fiscal", "political_governance"],
  macro_risk: ["macro_monetary", "sovereign_fiscal"],
  fx_external_risk: ["macro_monetary", "external_fx"],
  sanctions_restrictions: ["sanctions_restrictions"],
  conflict_geopolitics: ["geopolitical_security"],
  trade_corridor: ["trade_corridor"],
  energy_commodities: ["energy_commodities"],
  critical_minerals: ["critical_minerals"],
  political_governance: ["political_governance"],
  banking_financial_system: ["banking_financial_system"],
  food_agriculture: ["food_agriculture"],
  natural_hazards: ["natural_hazards"],
  hot_topics: ["hot_topics"],
  risk_gate: ["signed_risk_object", "risk_gate"],
  risk_object: ["signed_risk_object"],
  gri_context: ["gri_context"],
};

// Freshness is a data-contract SLA, not one arbitrary global window. Annual
// official structural series remain usable under bounded age windows while
// sanctions/hot-topic data must be substantially fresher.
export const AGENT_MODULE_MAX_AGE_SECONDS: Readonly<Record<string, number>> = {
  sovereign_fiscal: 800 * 86_400,
  political_governance: 800 * 86_400,
  macro_monetary: 400 * 86_400,
  external_fx: 400 * 86_400,
  sanctions_restrictions: 7 * 86_400,
  geopolitical_security: 45 * 86_400,
  trade_corridor: 400 * 86_400,
  energy_commodities: 120 * 86_400,
  critical_minerals: 400 * 86_400,
  banking_financial_system: 400 * 86_400,
  food_agriculture: 180 * 86_400,
  natural_hazards: 30 * 86_400,
  // Live event intelligence is stale after two hours, independent of slower structural baselines.
  hot_topics: 2 * 3_600,
};

// The current structural serving views and public GRI reader are latest-state
// products. Only signed historical Risk Objects and their Risk Gate evaluation
// use an at-or-before contract today. Historical requests for other modules are
// rejected rather than silently substituting current data.
const HISTORICAL_COMPATIBLE_MODULES = new Set(["signed_risk_object", "risk_gate"]);

const QUESTION_TOPIC_RULES: ReadonlyArray<{ topic: AgentQueryTopic; patterns: RegExp[] }> = [
  { topic: "sovereign_risk", patterns: [/\bsovereign\b/i, /\bdebt\b/i, /\bfiscal\b/i, /\bdefault\b/i, /\bbond\b/i] },
  { topic: "macro_risk", patterns: [/\bmacro/i, /\binflation\b/i, /\bgdp\b/i, /\bgrowth\b/i, /\brate\b/i, /\bcentral bank\b/i] },
  { topic: "fx_external_risk", patterns: [/\bfx\b/i, /\bcurrenc/i, /\bforeign exchange\b/i, /\breserves?\b/i, /\bbalance of payments\b/i, /\bexternal\b/i] },
  { topic: "sanctions_restrictions", patterns: [/\bsanction/i, /\brestriction/i, /\bembargo\b/i, /\bexport control/i, /\bofac\b/i] },
  { topic: "conflict_geopolitics", patterns: [/\bwar\b/i, /\bconflict\b/i, /\bgeopolit/i, /\bmilitary\b/i, /\bescalat/i, /\bsecurity\b/i] },
  { topic: "trade_corridor", patterns: [/\btrade\b/i, /\bcorridor\b/i, /\bsupply chain\b/i, /\bshipping\b/i, /\broute\b/i, /\btariff/i] },
  { topic: "energy_commodities", patterns: [/\benergy\b/i, /\boil\b/i, /\bgas\b/i, /\bcommodity/i, /\bpower\b/i] },
  { topic: "critical_minerals", patterns: [/\bcritical mineral/i, /\blithium\b/i, /\bcobalt\b/i, /\bnickel\b/i, /\bgraphite\b/i, /\bcopper\b/i, /\brare[- ]earths?\b/i] },
  { topic: "political_governance", patterns: [/\bgovernance\b/i, /\belection/i, /\bcoup\b/i, /\bpolitical\b/i, /\binstitution/i] },
  { topic: "banking_financial_system", patterns: [/\bbank/i, /\bfinancial system\b/i, /\bliquidity\b/i, /\bcredit\b/i] },
  { topic: "food_agriculture", patterns: [/\bfood\b/i, /\bagricultur/i, /\bwheat\b/i, /\bcrop/i, /\bfertilizer/i] },
  { topic: "natural_hazards", patterns: [/\bearthquake\b/i, /\bflood\b/i, /\bcyclone\b/i, /\bhurricane\b/i, /\bwildfire\b/i, /\bnatural hazard/i] },
  { topic: "hot_topics", patterns: [/\bhot topic/i, /\blatest\b/i, /\bcurrent event/i, /\btoday\b/i, /\bright now\b/i, /\bwhat changed\b/i] },
  { topic: "risk_gate", patterns: [/\brisk gate\b/i, /\bpre[- ]?flight\b/i, /\bshould .* proceed\b/i, /\b(?:allow|block|caution)\b/i] },
  { topic: "risk_object", patterns: [/\brisk object\b/i, /\bsigned object\b/i, /\bmachine[- ]readable\b/i] },
  { topic: "gri_context", patterns: [/\bgri\b/i, /\bglobal risk index\b/i, /\bglobal risk\b/i] },
];

const QUESTION_INTENT_RULES: ReadonlyArray<{ intent: AgentQueryIntent; patterns: RegExp[] }> = [
  { intent: "ranking_filter", patterns: [/\brank(?:ing)?\b/i, /\bhighest risk\b/i, /\blowest risk\b/i, /\bmost risky\b/i, /\bleast risky\b/i] },
  { intent: "comparison", patterns: [/\bcompare\b/i, /\bcomparison\b/i, /\bversus\b/i, /\bvs\.?\b/i, /\bdifference between\b/i] },
  { intent: "change_since", patterns: [/\bchange(?:d)? since\b/i, /\bdelta since\b/i, /\bchange attribution\b/i, /\bwhat changed since\b/i] },
  { intent: "audit", patterns: [/\baudit\b/i, /\bprovenance\b/i, /\btrace(?:ability)?\b/i, /\bverify\b/i, /\bmethodology\b/i] },
  { intent: "risk_gate", patterns: [/\brisk gate\b/i, /\bpre[- ]?flight\b/i, /\bshould .* proceed\b/i] },
];

function normalizeQuestion(question: string | undefined) {
  return question ? question.trim().replace(/\s+/g, " ").toLowerCase() : null;
}

export function inferAgentQueryTopics(question: string | undefined): AgentQueryTopic[] {
  if (!question) return [];
  const matches = QUESTION_TOPIC_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(question)))
    .map((rule) => rule.topic);
  return [...new Set([...matches, ...resolveMultilingualQueryVocabulary(question).topics])].sort() as AgentQueryTopic[];
}

export function inferAgentQueryIntent(question: string | undefined): AgentQueryIntent | null {
  if (!question) return null;
  const multilingual = resolveMultilingualQueryVocabulary(question).intents;
  const matches = [...new Set([
    ...multilingual,
    ...QUESTION_INTENT_RULES
      .filter((rule) => rule.patterns.some((pattern) => pattern.test(question)))
      .map((rule) => rule.intent),
  ])];
  if (matches.length > 1) throw new Error("AMBIGUOUS_QUERY_INTENT");
  return matches[0] ?? null;
}

function subjectKey(subject: AgentAdaptiveQuery["subjects"][number]) {
  return subject.type === "country"
    ? `country:${subject.country_iso3}`
    : `corridor:${subject.origin_country_iso3}>${subject.destination_country_iso3}`;
}

function canonicalSubjects(subjects: AgentAdaptiveQuery["subjects"]) {
  const unique = new Map<string, AgentAdaptiveQuery["subjects"][number]>();
  for (const subject of subjects) unique.set(subjectKey(subject), subject);
  return [...unique.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, subject]) => subject);
}

function defaultIntent(
  subjects: AgentAdaptiveQuery["subjects"],
  topics: AgentQueryTopic[],
): AgentQueryIntent {
  if (topics.includes("risk_gate") && subjects.length === 1) return "risk_gate";
  if (subjects.length > 1) return "comparison";
  if (subjects[0]?.type === "corridor") return "corridor";
  return "single_subject";
}

function resolveIntent(
  parsed: AgentAdaptiveQuery,
  subjects: AgentAdaptiveQuery["subjects"],
  topics: AgentQueryTopic[],
) {
  const inferred = inferAgentQueryIntent(parsed.question);
  if (parsed.intent && inferred && parsed.intent !== inferred) {
    throw new Error("QUERY_INTENT_CONFLICT");
  }
  return parsed.intent ?? inferred ?? defaultIntent(subjects, topics);
}

function validateIntent(
  parsed: AgentAdaptiveQuery,
  intent: AgentQueryIntent,
  subjects: AgentAdaptiveQuery["subjects"],
  topics: AgentQueryTopic[],
) {
  if (intent === "single_subject") {
    if (subjects.length !== 1 || subjects[0]?.type !== "country") {
      throw new Error("SINGLE_SUBJECT_INTENT_REQUIRES_ONE_COUNTRY");
    }
  }
  if (intent === "corridor") {
    if (subjects.length !== 1 || subjects[0]?.type !== "corridor") {
      throw new Error("CORRIDOR_INTENT_REQUIRES_ONE_DIRECTIONAL_CORRIDOR");
    }
  }
  if (intent === "comparison" && subjects.length < 2) {
    throw new Error("COMPARISON_INTENT_REQUIRES_MULTIPLE_SUBJECTS");
  }
  if (intent === "ranking_filter") {
    if (subjects.length < 2 || !parsed.ranking) {
      throw new Error("RANKING_FILTER_REQUIRES_MULTIPLE_SUBJECTS_AND_RANKING_SPEC");
    }
    if (!subjects.every((subject) => subject.type === subjects[0]?.type)) {
      throw new Error("RANKING_FILTER_REQUIRES_COMPARABLE_SUBJECT_TYPES");
    }
  } else if (parsed.ranking) {
    throw new Error("RANKING_SPEC_REQUIRES_RANKING_FILTER_INTENT");
  }
  if (intent === "change_since") {
    if (subjects.length !== 1 || !parsed.change) {
      throw new Error("CHANGE_SINCE_REQUIRES_ONE_SUBJECT_AND_BASELINE_SPEC");
    }
  } else if (parsed.change) {
    throw new Error("CHANGE_SPEC_REQUIRES_CHANGE_SINCE_INTENT");
  }
  if (intent === "risk_gate" && subjects.length !== 1) {
    throw new Error("RISK_GATE_INTENT_REQUIRES_ONE_SUBJECT");
  }
  if (topics.includes("risk_gate") && !parsed.risk_gate_context) {
    throw new Error("RISK_GATE_CONTEXT_REQUIRED");
  }
  if (parsed.risk_gate_context && !topics.includes("risk_gate")) {
    throw new Error("RISK_GATE_CONTEXT_WITHOUT_RISK_GATE");
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export type AgentQueryPlan = {
  product?: StoreProductSelection;
  schema_version: typeof AGENT_QUERY_SCHEMA_VERSION;
  question_key: string | null;
  response_locale?: AgentAdaptiveQuery["response_locale"];
  intent: AgentQueryIntent;
  subjects: AgentAdaptiveQuery["subjects"];
  topics: AgentQueryTopic[];
  required_modules: string[];
  ranking: AgentAdaptiveQuery["ranking"] | null;
  change: AgentAdaptiveQuery["change"] | null;
  requested_max_age_seconds: number | null;
  module_max_age_seconds: Record<string, number>;
  evidence: AgentAdaptiveQuery["evidence"];
  detail: AgentAdaptiveQuery["detail"];
  fulfillment_mode: AgentAdaptiveQuery["fulfillment_mode"];
  delivery_tier: AgentAdaptiveQuery["delivery_tier"];
  risk_gate_context: AgentAdaptiveQuery["risk_gate_context"] | null;
  as_of: string | null;
  query_plan_hash: string;
};

export function buildAgentQueryPlan(raw: unknown): AgentQueryPlan {
  const parsed = agentAdaptiveQuerySchema.parse(raw);
  assertStructuralBaselinePilot(parsed);
  const subjects = canonicalSubjects(parsed.subjects);
  const explicitTopics = parsed.topics.length > 0;
  const inferredTopics = explicitTopics ? [] : inferAgentQueryTopics(parsed.question);
  let topics = [...new Set([...parsed.topics, ...inferredTopics])].sort() as AgentQueryTopic[];
  const intent = resolveIntent(parsed, subjects, topics);
  if (parsed.product?.capability === "intelligence_query" && !topics.includes("risk_object"))
    topics = [...topics, "risk_object"].sort() as AgentQueryTopic[];

  // Ranking and previous-published change analysis are grounded in signed Risk
  // Objects, never guessed from heterogeneous structural observations.
  if (["ranking_filter", "change_since", "audit"].includes(intent) && !topics.includes("risk_object")) {
    topics = [...topics, "risk_object"].sort() as AgentQueryTopic[];
  }
  if (intent === "risk_gate" && !topics.includes("risk_gate")) {
    topics = [...topics, "risk_gate"].sort() as AgentQueryTopic[];
  }

  // A current natural-language intelligence request is answered from the
  // canonical risk state plus current structured developments. Historical
  // requests stay explicitly historical and do not silently mix live events.
  if (
    parsed.question &&
    !explicitTopics &&
    !parsed.as_of &&
    topics.length > 0 &&
    ["single_subject", "comparison", "corridor"].includes(intent)
  ) {
    if (parsed.fulfillment_mode === "published_only") {
      topics = [...new Set([...topics, "risk_object", "hot_topics"])].sort() as AgentQueryTopic[];
    }
  }

  if (topics.length === 0) throw new Error("UNSUPPORTED_OR_AMBIGUOUS_AGENT_QUESTION");
  validateIntent(parsed, intent, subjects, topics);

  const requiredModules = parsed.delivery_tier === "structural_baseline"
    ? [...new Set(topics.map(topic => BASELINE_MODULE_BY_TOPIC[topic]).filter((m):m is string=>typeof m==="string"))].sort()
    : [...new Set(topics.flatMap((topic) => TOPIC_MODULES[topic]))].sort();
  // The Store query contract includes a real live-pipeline check timestamp.
  // Qualify that module rather than inventing a timestamp from assembly time;
  // it is a prerequisite, not an extra buyer topic for price classification.
  if (parsed.product?.capability === "intelligence_query" && !requiredModules.includes("hot_topics")) {
    requiredModules.push("hot_topics");
    requiredModules.sort();
  }
  if(requiredModules.length===0)throw Error("STRUCTURAL_BASELINE_MODULE_NOT_AVAILABLE");
  assertStoreProductScope({...parsed, subjects, topics, intent});
  if (parsed.as_of && requiredModules.some((module) => !HISTORICAL_COMPATIBLE_MODULES.has(module))) {
    throw new Error("HISTORICAL_AS_OF_UNSUPPORTED_FOR_REQUESTED_MODULES");
  }
  const moduleMaxAge = Object.fromEntries(
    requiredModules
      .filter((module) => AGENT_MODULE_MAX_AGE_SECONDS[module])
      .map((module) => {
        const baseline = AGENT_MODULE_MAX_AGE_SECONDS[module];
        return [module, parsed.max_age_seconds ? Math.min(baseline, parsed.max_age_seconds) : baseline];
      }),
  );
  const normalized = {
    ...(parsed.product ? { product: parsed.product } : {}),
    schema_version: AGENT_QUERY_SCHEMA_VERSION,
    question_key: normalizeQuestion(parsed.question),
    ...(parsed.response_locale ? {response_locale:parsed.response_locale} : {}),
    intent,
    subjects,
    topics,
    required_modules: requiredModules,
    ranking: parsed.ranking ?? null,
    change: parsed.change ?? null,
    requested_max_age_seconds: parsed.max_age_seconds ?? null,
    module_max_age_seconds: moduleMaxAge,
    evidence: parsed.evidence,
    detail: parsed.detail,
    // Legacy x402 plan hashes are already payment-bound. Only newly opted-in
    // requests add this field to the hash input; published_only hashes remain
    // byte-for-byte identical to pre-migration production.
    ...(parsed.fulfillment_mode === "live_on_demand" ? {
      fulfillment_mode: parsed.fulfillment_mode,
    } : {}),
    ...(parsed.delivery_tier === "structural_baseline" ? {
      delivery_tier: parsed.delivery_tier,
    } : {}),
    risk_gate_context: parsed.risk_gate_context ?? null,
    as_of: parsed.as_of ?? null,
  };
  return { ...normalized, fulfillment_mode: parsed.fulfillment_mode,
    delivery_tier: parsed.delivery_tier,
    query_plan_hash: stableHash(normalized) };
}

export function paymentBindingForAgentQuery(input: {
  queryPlan: AgentQueryPlan;
  amountAtomic: string;
  network: string;
  asset: string;
  payTo: string;
}) {
  return stableHash({
    schema_version: input.queryPlan.schema_version,
    query_plan_hash: input.queryPlan.query_plan_hash,
    amount_atomic: input.amountAtomic,
    network: input.network,
    asset: input.asset.toLowerCase(),
    pay_to: input.payTo.toLowerCase(),
  });
}
