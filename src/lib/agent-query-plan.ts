import { createHash } from "node:crypto";
import { z } from "zod";

export const AGENT_QUERY_SCHEMA_VERSION = "geomacro.agent-query.v1" as const;

export const AGENT_QUERY_TOPICS = [
  "sovereign_risk",
  "macro_risk",
  "fx_external_risk",
  "sanctions_restrictions",
  "conflict_geopolitics",
  "trade_corridor",
  "energy_commodities",
  "critical_minerals",
  "political_governance",
  "banking_financial_system",
  "food_agriculture",
  "natural_hazards",
  "hot_topics",
  "risk_gate",
  "risk_object",
  "gri_context",
] as const;

export type AgentQueryTopic = (typeof AGENT_QUERY_TOPICS)[number];

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const country = z.object({ type: z.literal("country"), country_iso3: iso3 });
const corridor = z.object({
  type: z.literal("corridor"),
  origin_country_iso3: iso3,
  destination_country_iso3: iso3,
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

export const agentAdaptiveQuerySchema = z.object({
  schema_version: z.literal(AGENT_QUERY_SCHEMA_VERSION).default(AGENT_QUERY_SCHEMA_VERSION),
  question: z.string().trim().min(3).max(2_000).optional(),
  subjects: z.array(z.union([country, corridor])).min(1).max(25),
  topics: z.array(z.enum(AGENT_QUERY_TOPICS)).max(16).default([]),
  as_of: z.string().datetime({ offset: true }).optional(),
  max_age_seconds: z.number().int().positive().max(31_536_000).default(86_400),
  evidence: z.enum(["required", "summary"]).default("required"),
  detail: z.enum(["compact", "standard", "full"]).default("standard"),
  risk_gate_context: riskGateContext.optional(),
  client_request_id: z.string().trim().min(4).max(128).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.question && value.topics.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["topics"],
      message: "Provide at least one explicit topic or a question that can be deterministically classified",
    });
  }
});

export type AgentAdaptiveQuery = z.infer<typeof agentAdaptiveQuerySchema>;

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

const QUESTION_TOPIC_RULES: ReadonlyArray<{ topic: AgentQueryTopic; patterns: RegExp[] }> = [
  { topic: "sovereign_risk", patterns: [/\bsovereign\b/i, /\bdebt\b/i, /\bfiscal\b/i, /\bdefault\b/i, /\bbond\b/i] },
  { topic: "macro_risk", patterns: [/\bmacro/i, /\binflation\b/i, /\bgdp\b/i, /\bgrowth\b/i, /\brate\b/i, /\bcentral bank\b/i] },
  { topic: "fx_external_risk", patterns: [/\bfx\b/i, /\bcurrenc/i, /\bforeign exchange\b/i, /\breserves?\b/i, /\bbalance of payments\b/i, /\bexternal\b/i] },
  { topic: "sanctions_restrictions", patterns: [/\bsanction/i, /\brestriction/i, /\bembargo\b/i, /\bexport control/i, /\bofac\b/i] },
  { topic: "conflict_geopolitics", patterns: [/\bwar\b/i, /\bconflict\b/i, /\bgeopolit/i, /\bmilitary\b/i, /\bescalat/i, /\bsecurity\b/i] },
  { topic: "trade_corridor", patterns: [/\btrade\b/i, /\bcorridor\b/i, /\bsupply chain\b/i, /\bshipping\b/i, /\broute\b/i, /\btariff/i] },
  { topic: "energy_commodities", patterns: [/\benergy\b/i, /\boil\b/i, /\bgas\b/i, /\bcommodity/i, /\bpower\b/i] },
  { topic: "critical_minerals", patterns: [/\bcritical mineral/i, /\blithium\b/i, /\bcobalt\b/i, /\bnickel\b/i, /\brare earth/i] },
  { topic: "political_governance", patterns: [/\bgovernance\b/i, /\belection/i, /\bcoup\b/i, /\bpolitical\b/i, /\binstitution/i] },
  { topic: "banking_financial_system", patterns: [/\bbank/i, /\bfinancial system\b/i, /\bliquidity\b/i, /\bcredit\b/i] },
  { topic: "food_agriculture", patterns: [/\bfood\b/i, /\bagricultur/i, /\bwheat\b/i, /\bcrop/i, /\bfertilizer/i] },
  { topic: "natural_hazards", patterns: [/\bearthquake\b/i, /\bflood\b/i, /\bcyclone\b/i, /\bhurricane\b/i, /\bwildfire\b/i, /\bnatural hazard/i] },
  { topic: "hot_topics", patterns: [/\bhot topic/i, /\blatest\b/i, /\bcurrent event/i, /\btoday\b/i, /\bright now\b/i, /\bwhat changed\b/i] },
  { topic: "risk_gate", patterns: [/\brisk gate\b/i, /\bpre[- ]?flight\b/i, /\bshould .* proceed\b/i, /\b(?:allow|block|caution)\b/i] },
  { topic: "risk_object", patterns: [/\brisk object\b/i, /\bsigned object\b/i, /\bmachine[- ]readable\b/i] },
  { topic: "gri_context", patterns: [/\bgri\b/i, /\bglobal risk index\b/i, /\bglobal risk\b/i] },
];

function normalizeQuestion(question: string | undefined) {
  return question ? question.trim().replace(/\s+/g, " ").toLowerCase() : null;
}

export function inferAgentQueryTopics(question: string | undefined): AgentQueryTopic[] {
  if (!question) return [];
  const matches = QUESTION_TOPIC_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(question)))
    .map((rule) => rule.topic);
  return [...new Set(matches)].sort() as AgentQueryTopic[];
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
  schema_version: typeof AGENT_QUERY_SCHEMA_VERSION;
  question_key: string | null;
  subjects: AgentAdaptiveQuery["subjects"];
  topics: AgentQueryTopic[];
  required_modules: string[];
  max_age_seconds: number;
  evidence: AgentAdaptiveQuery["evidence"];
  detail: AgentAdaptiveQuery["detail"];
  risk_gate_context: AgentAdaptiveQuery["risk_gate_context"] | null;
  as_of: string | null;
  query_plan_hash: string;
};

export function buildAgentQueryPlan(raw: unknown): AgentQueryPlan {
  const parsed = agentAdaptiveQuerySchema.parse(raw);
  const inferred = inferAgentQueryTopics(parsed.question);
  const topics = [...new Set([...parsed.topics, ...inferred])].sort() as AgentQueryTopic[];
  if (topics.length === 0) throw new Error("UNSUPPORTED_OR_AMBIGUOUS_AGENT_QUESTION");
  if (topics.includes("risk_gate") && !parsed.risk_gate_context) {
    throw new Error("RISK_GATE_CONTEXT_REQUIRED");
  }
  const requiredModules = [...new Set(topics.flatMap((topic) => TOPIC_MODULES[topic]))].sort();
  const normalized = {
    schema_version: AGENT_QUERY_SCHEMA_VERSION,
    question_key: normalizeQuestion(parsed.question),
    subjects: parsed.subjects,
    topics,
    required_modules: requiredModules,
    max_age_seconds: parsed.max_age_seconds,
    evidence: parsed.evidence,
    detail: parsed.detail,
    risk_gate_context: parsed.risk_gate_context ?? null,
    as_of: parsed.as_of ?? null,
  };
  return { ...normalized, query_plan_hash: stableHash(normalized) };
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
