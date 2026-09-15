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

export const agentAdaptiveQuerySchema = z.object({
  schema_version: z.literal(AGENT_QUERY_SCHEMA_VERSION).default(AGENT_QUERY_SCHEMA_VERSION),
  question: z.string().trim().min(3).max(2_000).optional(),
  subjects: z.array(z.union([country, corridor])).min(1).max(25),
  topics: z.array(z.enum(AGENT_QUERY_TOPICS)).min(1).max(16),
  as_of: z.string().datetime({ offset: true }).optional(),
  max_age_seconds: z.number().int().positive().max(31_536_000).default(86_400),
  evidence: z.enum(["required", "summary"]).default("required"),
  detail: z.enum(["compact", "standard", "full"]).default("standard"),
  client_request_id: z.string().trim().min(4).max(128).optional(),
}).strict();

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
  subjects: AgentAdaptiveQuery["subjects"];
  topics: AgentQueryTopic[];
  required_modules: string[];
  max_age_seconds: number;
  evidence: AgentAdaptiveQuery["evidence"];
  detail: AgentAdaptiveQuery["detail"];
  as_of: string | null;
  query_plan_hash: string;
};

export function buildAgentQueryPlan(raw: unknown): AgentQueryPlan {
  const parsed = agentAdaptiveQuerySchema.parse(raw);
  const topics = [...new Set(parsed.topics)].sort() as AgentQueryTopic[];
  const requiredModules = [...new Set(topics.flatMap((topic) => TOPIC_MODULES[topic]))].sort();
  const normalized = {
    schema_version: AGENT_QUERY_SCHEMA_VERSION,
    subjects: parsed.subjects,
    topics,
    required_modules: requiredModules,
    max_age_seconds: parsed.max_age_seconds,
    evidence: parsed.evidence,
    detail: parsed.detail,
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
