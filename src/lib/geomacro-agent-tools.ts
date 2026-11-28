import { z } from "zod";
import {
  AGENT_QUERY_SCHEMA_VERSION, AGENT_QUERY_TOPICS,
  agentAdaptiveQuerySchema, buildAgentQueryPlan,
  type AgentAdaptiveQuery,
  type AgentQueryTopic,
  inferAgentQueryTopics,
} from "./agent-query-plan";
import { publicQueryOpenApiSchema } from "./public-api-openapi.server";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples";
import { normalizeAnswerQuestionRequest } from "./geomacro-answer-request.server";
import {interpretMultilingualIntelligenceQuery} from "./multilingual-query-intent";
import {publicCapabilityNewSalesAllowed} from "./capability-pricing-catalog";

export const GEOMACRO_MCP_PROTOCOL_VERSION = "2026-07-28" as const;
export const GEOMACRO_MCP_SERVER_VERSION = "geomacro-mcp-v1" as const;
export const GEOMACRO_MCP_PATH = "/api/mcp" as const;

export const GEOMACRO_AGENT_TOOL_NAMES = [
  "store_product_query",
  "paid_structured_answer",
  "answer_question",
  "geopolitics_query",
  "macro_fx_query",
  "critical_minerals_query",
  "country_risk",
  "corridor_risk",
  "change_since_last_verified",
  "why_changed",
  "three_domain_state",
  "risk_gate_decision_context",
  "verify_risk_object",
] as const;

export type GeomacroAgentToolName = (typeof GEOMACRO_AGENT_TOOL_NAMES)[number];

export const GEOMACRO_AGENT_DOMAINS = [
  "geopolitics",
  "macro",
  "critical_minerals",
] as const;
export type GeomacroAgentDomain = (typeof GEOMACRO_AGENT_DOMAINS)[number];

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const domains = z.array(z.enum(GEOMACRO_AGENT_DOMAINS)).min(1).max(3).default([...GEOMACRO_AGENT_DOMAINS]);
const detail = z.enum(["compact", "standard", "full"]).default("standard");
const clientRequestId = z.string().trim().min(4).max(128).optional();
const maxAgeSeconds = z.number().int().positive().max(94_608_000).optional();

export const answerQuestionToolSchema = z.object({
  question: z.string().trim().min(3).max(1_000),
  max_age_seconds: maxAgeSeconds,
  client_request_id: clientRequestId,
}).strict();

export const categoryQuestionToolSchema = z.object({
  country_iso3: iso3,
  question: z.string().trim().min(3).max(2_000),
  fulfillment_mode: z.enum(["live_on_demand", "published_only"]).default("live_on_demand"),
  max_age_seconds: maxAgeSeconds,
  detail,
  client_request_id: clientRequestId,
}).strict();

export const GEOMACRO_CATEGORY_AGENT_PROFILES = [
  { id: "geopolitics", name: "Geomacro Geopolitics Agent", tool: "geopolitics_query",
    api: "/api/v1/intelligence/geopolitics", topics: ["conflict_geopolitics"] },
  { id: "macro-fx", name: "Geomacro Macro / FX Agent", tool: "macro_fx_query",
    api: "/api/v1/intelligence/macro-fx", topics: ["macro_risk", "fx_external_risk"] },
  { id: "critical-minerals", name: "Geomacro Critical Minerals Agent", tool: "critical_minerals_query",
    api: "/api/v1/intelligence/critical-minerals", topics: ["critical_minerals"] },
] as const;

const countrySubject = z.object({
  country_iso3: iso3,
});

const corridorSubject = z.object({
  origin_country_iso3: iso3,
  destination_country_iso3: iso3,
});

function rejectSameCountryCorridor(
  value: { origin_country_iso3: string; destination_country_iso3: string },
  ctx: z.RefinementCtx,
) {
  if (value.origin_country_iso3 === value.destination_country_iso3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["destination_country_iso3"],
      message: "Corridor endpoints must differ",
    });
  }
}

const genericSubject = z.discriminatedUnion("type", [
  z.object({ type: z.literal("country"), country_iso3: iso3 }),
  z.object({
    type: z.literal("corridor"),
    origin_country_iso3: iso3,
    destination_country_iso3: iso3,
  }),
]).superRefine((value, ctx) => {
  if (value.type === "corridor") rejectSameCountryCorridor(value, ctx);
});

export const countryRiskToolSchema = countrySubject.extend({
  domains,
  max_age_seconds: maxAgeSeconds,
  detail,
  client_request_id: clientRequestId,
}).strict();

export const corridorRiskToolSchema = corridorSubject.extend({
  domains,
  max_age_seconds: maxAgeSeconds,
  detail,
  client_request_id: clientRequestId,
}).strict().superRefine(rejectSameCountryCorridor);

export const subjectIntelligenceToolSchema = z.object({
  subject: genericSubject,
  domains,
  max_age_seconds: maxAgeSeconds,
  detail,
  client_request_id: clientRequestId,
}).strict();

export const riskGateDecisionToolSchema = z.object({
  subject: genericSubject,
  domains,
  policy_preset: z.enum(["balanced", "cautious", "strict"]).default("balanced"),
  action_type: z.enum([
    "treasury_payment",
    "vendor_payment",
    "agent_payment",
    "exposure_review",
  ]),
  amount_usdc: z.number().finite().positive().max(1_000_000_000).optional(),
  max_age_seconds: maxAgeSeconds,
  detail,
  client_request_id: clientRequestId,
}).strict();

export const verifyRiskObjectToolSchema = z.object({
  risk_object: z.record(z.string(), z.unknown()),
}).strict();

function domainTopics(selected: readonly GeomacroAgentDomain[]): AgentQueryTopic[] {
  const topics = new Set<AgentQueryTopic>();
  for (const domain of selected) {
    if (domain === "geopolitics") topics.add("conflict_geopolitics");
    if (domain === "macro") {
      topics.add("macro_risk");
      topics.add("fx_external_risk");
    }
    if (domain === "critical_minerals") topics.add("critical_minerals");
  }
  return [...topics];
}

function commonQuery(input: {
  subjects: AgentAdaptiveQuery["subjects"];
  topics: AgentQueryTopic[];
  intent: AgentAdaptiveQuery["intent"];
  question: string;
  max_age_seconds?: number;
  detail: AgentAdaptiveQuery["detail"];
  client_request_id?: string;
  change?: AgentAdaptiveQuery["change"];
  risk_gate_context?: AgentAdaptiveQuery["risk_gate_context"];
}): AgentAdaptiveQuery {
  return {
    schema_version: AGENT_QUERY_SCHEMA_VERSION,
    question: input.question,
    subjects: input.subjects,
    topics: [...new Set(input.topics)],
    intent: input.intent,
    evidence: "required",
    detail: input.detail,
    // Match canonical Zod defaults for legacy paid signed-risk tool calls.
    fulfillment_mode: "published_only",
    delivery_tier: "signed_risk_intelligence",
    ...(input.max_age_seconds ? { max_age_seconds: input.max_age_seconds } : {}),
    ...(input.client_request_id ? { client_request_id: input.client_request_id } : {}),
    ...(input.change ? { change: input.change } : {}),
    ...(input.risk_gate_context ? { risk_gate_context: input.risk_gate_context } : {}),
  };
}

function subjectFromInput(input: z.infer<typeof subjectIntelligenceToolSchema>) {
  return input.subject.type === "country"
    ? { type: "country" as const, country_iso3: input.subject.country_iso3 }
    : {
        type: "corridor" as const,
        origin_country_iso3: input.subject.origin_country_iso3,
        destination_country_iso3: input.subject.destination_country_iso3,
      };
}

export function geomacroAgentToolToCanonicalQuery(
  toolName: Exclude<GeomacroAgentToolName, "verify_risk_object">,
  rawArguments: unknown,
): AgentAdaptiveQuery {
  if (toolName === "answer_question") {
    const input = answerQuestionToolSchema.parse(rawArguments);
    const normalized = normalizeAnswerQuestionRequest(input);
    if (!normalized.ok) throw Error(normalized.code);
    const query = agentAdaptiveQuerySchema.parse(normalized.value);
    buildAgentQueryPlan(query);
    return query;
  }
  if (toolName === "paid_structured_answer") {
    const selected=interpretMultilingualIntelligenceQuery(rawArguments);
    if(!publicCapabilityNewSalesAllowed(selected.selected_product.capability))
      throw Error("PAID_STRUCTURED_PRODUCT_COMING_SOON");
    return selected.canonical_request;
  }
  if (toolName === "store_product_query") {
    const input = agentAdaptiveQuerySchema.parse(rawArguments);
    if (!input.product) throw Error("STORE_PRODUCT_SELECTION_REQUIRED");
    buildAgentQueryPlan(input);
    return input;
  }
  const category = GEOMACRO_CATEGORY_AGENT_PROFILES.find(profile => profile.tool === toolName);
  if (category) {
    const input = categoryQuestionToolSchema.parse(rawArguments);
    const topics: readonly AgentQueryTopic[] = category.topics;
    if (inferAgentQueryTopics(input.question).some(topic => !topics.includes(topic)))
      throw new Error("CATEGORY_QUESTION_SCOPE_MISMATCH");
    return {
      schema_version: AGENT_QUERY_SCHEMA_VERSION,
      subjects: [{ type: "country", country_iso3: input.country_iso3 }],
      question: input.question, topics: [...topics], intent: "single_subject",
      evidence: "required", detail: input.detail,
      fulfillment_mode: input.fulfillment_mode, delivery_tier: "signed_risk_intelligence",
      ...(input.max_age_seconds ? { max_age_seconds: input.max_age_seconds } : {}),
      ...(input.client_request_id ? { client_request_id: input.client_request_id } : {}),
    };
  }
  // Narrow explicitly after the profile lookup so future names cannot fall
  // through into a generic subject tool or silently lose the buyer's question.
  if (toolName === "geopolitics_query" || toolName === "macro_fx_query" ||
      toolName === "critical_minerals_query") throw new Error("CATEGORY_TOOL_PROFILE_MISSING");
  if (toolName === "country_risk") {
    const input = countryRiskToolSchema.parse(rawArguments);
    return commonQuery({
      subjects: [{ type: "country", country_iso3: input.country_iso3 }],
      topics: domainTopics(input.domains),
      intent: "single_subject",
      question: `Current three-domain Geomacro risk state for ${input.country_iso3}`,
      max_age_seconds: input.max_age_seconds,
      detail: input.detail,
      client_request_id: input.client_request_id,
    });
  }

  if (toolName === "corridor_risk") {
    const input = corridorRiskToolSchema.parse(rawArguments);
    return commonQuery({
      subjects: [{
        type: "corridor",
        origin_country_iso3: input.origin_country_iso3,
        destination_country_iso3: input.destination_country_iso3,
      }],
      topics: ["trade_corridor", ...domainTopics(input.domains)],
      intent: "corridor",
      question: `Current directional corridor risk from ${input.origin_country_iso3} to ${input.destination_country_iso3}`,
      max_age_seconds: input.max_age_seconds,
      detail: input.detail,
      client_request_id: input.client_request_id,
    });
  }

  if (toolName === "risk_gate_decision_context") {
    const input = riskGateDecisionToolSchema.parse(rawArguments);
    const subject = subjectFromInput({
      subject: input.subject,
      domains: input.domains,
      detail: input.detail,
      max_age_seconds: input.max_age_seconds,
      client_request_id: input.client_request_id,
    });
    return commonQuery({
      subjects: [subject],
      topics: ["risk_gate", "risk_object", ...domainTopics(input.domains)],
      intent: "risk_gate",
      question: "Provide non-executing Risk Gate decision context from current verified Geomacro intelligence",
      max_age_seconds: input.max_age_seconds,
      detail: input.detail,
      client_request_id: input.client_request_id,
      risk_gate_context: {
        policy_preset: input.policy_preset,
        action_type: input.action_type,
        ...(input.amount_usdc ? { amount_usdc: input.amount_usdc } : {}),
      },
    });
  }

  const input = subjectIntelligenceToolSchema.parse(rawArguments);
  const subject = subjectFromInput(input);
  const topics = domainTopics(input.domains);
  const subjectLabel = subject.type === "country"
    ? subject.country_iso3
    : `${subject.origin_country_iso3}>${subject.destination_country_iso3}`;

  if (toolName === "change_since_last_verified") {
    return commonQuery({
      subjects: [subject],
      topics,
      intent: "change_since",
      question: `What changed since the previous published verified Geomacro state for ${subjectLabel}?`,
      max_age_seconds: input.max_age_seconds,
      detail: input.detail,
      client_request_id: input.client_request_id,
      change: { baseline: "previous_published" },
    });
  }

  if (toolName === "why_changed") {
    return commonQuery({
      subjects: [subject],
      topics,
      intent: "change_since",
      question: `Why did the verified Geomacro risk state change for ${subjectLabel}?`,
      max_age_seconds: input.max_age_seconds,
      detail: input.detail,
      client_request_id: input.client_request_id,
      change: { baseline: "previous_published" },
    });
  }

  if (toolName === "three_domain_state") {
    return commonQuery({
      subjects: [subject],
      topics: domainTopics(GEOMACRO_AGENT_DOMAINS),
      intent: subject.type === "country" ? "single_subject" : "corridor",
      question: `Current geopolitics, macro/FX and critical-minerals state for ${subjectLabel}`,
      max_age_seconds: input.max_age_seconds,
      detail: input.detail,
      client_request_id: input.client_request_id,
    });
  }

  const unreachable: never = toolName;
  throw new Error(`UNSUPPORTED_GEOMACRO_AGENT_TOOL:${unreachable}`);
}

const iso3Json = {
  type: "string",
  pattern: "^[A-Z]{3}$",
  description: "Uppercase 3-letter ISO 3166-1 alpha-3 country code (for example, USA, IND, CHN, DEU).",
};
const domainsJson = {
  type: "array",
  minItems: 1,
  maxItems: 3,
  uniqueItems: true,
  items: { type: "string", enum: [...GEOMACRO_AGENT_DOMAINS] },
  default: [...GEOMACRO_AGENT_DOMAINS],
  description: "Risk domains to include: geopolitics, macro, and/or critical_minerals.",
};
const commonProperties = {
  domains: domainsJson,
  max_age_seconds: {
    type: "integer",
    minimum: 1,
    maximum: 94_608_000,
    description: "Optional maximum acceptable intelligence age in seconds before rejecting stale state.",
  },
  detail: {
    type: "string",
    enum: ["compact", "standard", "full"],
    default: "standard",
    description: "Response verbosity level: compact (summary), standard (default), or full (detailed drivers).",
  },
  client_request_id: {
    type: "string",
    minLength: 4,
    maxLength: 128,
    description: "Optional caller-supplied idempotency key (4 to 128 characters) for tracking or retries.",
  },
};
const genericSubjectJson = {
  description: "Target entity: either a single country (type=country + country_iso3) or a directional corridor (type=corridor + origin/destination ISO3).",
  oneOf: [
    {
      type: "object",
      properties: {
        type: { const: "country", description: "Selects single-country analysis." },
        country_iso3: iso3Json,
      },
      required: ["type", "country_iso3"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "corridor", description: "Selects directional cross-border corridor analysis." },
        origin_country_iso3: { ...iso3Json, description: "Origin ISO 3166-1 alpha-3 country code." },
        destination_country_iso3: { ...iso3Json, description: "Destination ISO 3166-1 alpha-3 country code (must differ from origin)." },
      },
      required: ["type", "origin_country_iso3", "destination_country_iso3"],
      additionalProperties: false,
    },
  ],
};

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

const intelligenceOutputSchema = {
  type: "object",
  properties: {
    schema_version: { const: "geomacro.adaptive-intelligence-response.v1" },
    product: { const: "geomacro_adaptive_risk_intelligence_v1" },
    delivered_product_hash: { type: "string", pattern: "^[0-9a-f]{64}$" },
    execution_authorized: { const: false },
  },
  required: ["schema_version", "product", "delivered_product_hash", "execution_authorized"],
};

export const GEOMACRO_AGENT_TOOLS = [
  {
    name: "store_product_query",
    description: "Use when you already know the exact Geomacro Store SKU (capability + variant) and structured subjects. Do not use for free-form natural-language questions (use answer_question or paid_structured_answer instead). Paid via x402 USDC; read-only and never authorizes execution.",
    paid: true,
    inputSchema: { ...publicQueryOpenApiSchema(), required: ["subjects", "product"] },
    outputSchema: intelligenceOutputSchema,
    example: GEOMACRO_STORE_REQUEST_EXAMPLES.country_digest,
  },
  {
    name: "paid_structured_answer",
    description: "Use when you have a free-form multilingual question and want deterministic Store SKU selection with x402 USDC delivery. Do not use for free cryptographic signature verification (use verify_risk_object) or domain-locked single-country queries (use geopolitics_query, macro_fx_query, or critical_minerals_query). Read-only; never authorizes execution.",
    paid:true,
    inputSchema:objectSchema({
      question:{type:"string",minLength:3,maxLength:2000,description:"Natural-language risk intelligence question (3 to 2000 characters) in any supported language."},
      language:{type:"string",description:"Optional response query language BCP47 code (for example, en, es, fr)."},
      subjects:{type:"array",description:"Optional explicit country or corridor subjects; inferred from question when omitted.",items:{oneOf:[
        objectSchema({type:{const:"country",description:"Single-country subject type."},country_iso3:iso3Json},["type","country_iso3"]),
        objectSchema({type:{const:"corridor",description:"Directional corridor subject type."},origin_country_iso3:{...iso3Json,description:"Origin country ISO3 code."},destination_country_iso3:{...iso3Json,description:"Destination country ISO3 code."}},["type","origin_country_iso3","destination_country_iso3"]),
      ]}},
      topics:{type:"array",description:"Optional risk topic filters; inferred from question when omitted.",items:{type:"string",enum:[...AGENT_QUERY_TOPICS]}},
      product:{type:"object",additionalProperties:false,description:"Optional exact chosen Store SKU; otherwise inferred from question.",properties:{
        capability:{type:"string",description:"Target Geomacro capability identifier."},variant:{type:"string",description:"Target product variant (e.g. standard, complex)."},
        issued_after:{type:"string",format:"date-time",description:"Optional ISO 8601 lower bound timestamp for source freshness."},
      },required:["capability","variant"]},
      client_request_id:commonProperties.client_request_id,
      max_age_seconds:commonProperties.max_age_seconds,
    },["question"]),
    outputSchema:intelligenceOutputSchema,
    example:{question:"What is the potential market impact of critical minerals supply in India?"},
  },
  {
    name: "answer_question",
    description: "Use when asking a concise English natural-language question (up to 1000 chars) naming one or more unambiguous countries without choosing a specific SKU. Do not use for directional trade corridors (use corridor_risk) or decision-gate checks (use risk_gate_decision_context). Paid via x402 USDC; never charges when unavailable.",
    paid: true,
    inputSchema: objectSchema({
      question: { type: "string", minLength: 3, maxLength: 1_000, description: "Natural-language question naming one or more countries (3 to 1000 characters)." },
      max_age_seconds: commonProperties.max_age_seconds,
      client_request_id: commonProperties.client_request_id,
    }, ["question"]),
    outputSchema: intelligenceOutputSchema,
    example: { question: "What is the inflation risk in Brazil?" },
  },
  ...GEOMACRO_CATEGORY_AGENT_PROFILES.map(profile => ({
    name: profile.tool,
    description: `${profile.name}: use when asking a focused ${profile.id} question for a single country (ISO3). Do not use for cross-domain country summaries (use country_risk or three_domain_state) or cross-border corridors (use corridor_risk). Live retrieval is no-charge until commercially verified; published_only uses x402 USDC.`,
    paid: true,
    inputSchema: objectSchema({
      country_iso3: iso3Json,
      question: { type: "string", minLength: 3, maxLength: 2_000, description: `Focused ${profile.id} question for the specified country (3 to 2000 characters).` },
      fulfillment_mode: { type: "string", enum: ["live_on_demand", "published_only"], default: "live_on_demand", description: "Use live_on_demand (default) for fresh verified retrieval or published_only for cached signed intelligence." },
      max_age_seconds: commonProperties.max_age_seconds,
      detail: commonProperties.detail,
      client_request_id: commonProperties.client_request_id,
    }, ["country_iso3", "question"]),
    outputSchema: intelligenceOutputSchema,
    example: { country_iso3: "IND", question: `What are the current ${profile.id === "macro-fx" ? "macro and FX" : profile.id === "critical-minerals" ? "critical minerals" : "geopolitical"} risks for India?` },
  })),
  {
    name: "country_risk",
    description: "Use when you need the current derived risk state for a single country across selected domains without writing a free-form question. Do not use for bilateral corridors (use corridor_risk) or change attribution (use change_since_last_verified or why_changed). Paid via x402 USDC; never returns raw upstream data.",
    paid: true,
    inputSchema: objectSchema(
      { country_iso3: iso3Json, ...commonProperties },
      ["country_iso3"],
    ),
    outputSchema: intelligenceOutputSchema,
    example: { country_iso3: "IND", domains: [...GEOMACRO_AGENT_DOMAINS] },
  },
  {
    name: "corridor_risk",
    description: "Use when assessing directional cross-border risk from an origin country to a destination country (trade, supply chain, or settlement corridor). Do not use for single-country queries (use country_risk). Paid via x402 USDC; read-only.",
    paid: true,
    inputSchema: objectSchema(
      {
        origin_country_iso3: { ...iso3Json, description: "Origin ISO 3166-1 alpha-3 country code." },
        destination_country_iso3: { ...iso3Json, description: "Destination ISO 3166-1 alpha-3 country code (must differ from origin)." },
        ...commonProperties,
      },
      ["origin_country_iso3", "destination_country_iso3"],
    ),
    outputSchema: intelligenceOutputSchema,
    example: { origin_country_iso3: "USA", destination_country_iso3: "CHN", domains: [...GEOMACRO_AGENT_DOMAINS] },
  },
  {
    name: "change_since_last_verified",
    description: "Use when checking what materially changed since the previous published verified state for a country or corridor. Do not use if you only need the current baseline snapshot (use country_risk or three_domain_state) or causal drivers (use why_changed). Paid via x402 USDC.",
    paid: true,
    inputSchema: objectSchema({ subject: genericSubjectJson, ...commonProperties }, ["subject"]),
    outputSchema: intelligenceOutputSchema,
    example: { subject: { type: "country", country_iso3: "DEU" }, domains: [...GEOMACRO_AGENT_DOMAINS] },
  },
  {
    name: "why_changed",
    description: "Use when investigating the specific drivers and causes behind the latest verified risk-state change for a country or corridor. Do not use for current static risk levels (use country_risk) or pre-payment policy gates (use risk_gate_decision_context). Paid via x402 USDC.",
    paid: true,
    inputSchema: objectSchema({ subject: genericSubjectJson, ...commonProperties }, ["subject"]),
    outputSchema: intelligenceOutputSchema,
    example: { subject: { type: "country", country_iso3: "BRA" }, domains: [...GEOMACRO_AGENT_DOMAINS] },
  },
  {
    name: "three_domain_state",
    description: "Use when you want a unified snapshot across all three Geomacro domains (geopolitics, macro/FX, and critical minerals) for a country or corridor. Do not use when filtering to a single domain (use country_risk or a category *_query tool). Paid via x402 USDC.",
    paid: true,
    inputSchema: objectSchema({ subject: genericSubjectJson, ...commonProperties }, ["subject"]),
    outputSchema: intelligenceOutputSchema,
    example: { subject: { type: "country", country_iso3: "ZAF" } },
  },
  {
    name: "risk_gate_decision_context",
    description: "Use before a treasury, vendor, or agent payment or exposure review to obtain a policy-aware, non-executing Risk Gate decision context (CONTINUE, REDUCE_LIMIT, REQUIRE_APPROVAL, or PAUSE). Do not use for general news summaries. Paid via x402 USDC; execution_authorized is always false.",
    paid: true,
    inputSchema: objectSchema(
      {
        subject: genericSubjectJson,
        ...commonProperties,
        policy_preset: { type: "string", enum: ["balanced", "cautious", "strict"], default: "balanced", description: "Risk tolerance preset: balanced (default), cautious, or strict." },
        action_type: { type: "string", enum: ["treasury_payment", "vendor_payment", "agent_payment", "exposure_review"], description: "Intended downstream action type being evaluated by the Risk Gate." },
        amount_usdc: { type: "number", exclusiveMinimum: 0, maximum: 1_000_000_000, description: "Optional transaction exposure amount in USDC (positive number) for sizing context." },
      },
      ["subject", "action_type"],
    ),
    outputSchema: intelligenceOutputSchema,
    example: {
      subject: { type: "country", country_iso3: "IND" },
      action_type: "exposure_review",
      policy_preset: "balanced",
    },
  },
  {
    name: "verify_risk_object",
    description: "Use when verifying the Ed25519 signature and integrity of a signed Geomacro Risk Object already in your possession. Free (no payment required) and read-only; verifies cryptographic authenticity only and never authorizes execution.",
    paid: false,
    inputSchema: objectSchema(
      { risk_object: { type: "object", description: "Complete signed Geomacro Risk Object JSON payload supplied by the caller." } },
      ["risk_object"],
    ),
    outputSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        verification: { type: "object" },
        execution_authorized: { const: false },
      },
      required: ["ok", "verification", "execution_authorized"],
    },
    example: { risk_object: { schema_version: "geomacro-risk-object/1.1" } },
  },
] as const satisfies readonly {
  name: GeomacroAgentToolName;
  description: string;
  paid: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  example: Record<string, unknown>;
}[];

export function geomacroAgentTool(name: string) {
  return GEOMACRO_AGENT_TOOLS.find((tool) => tool.name === name) ?? null;
}
