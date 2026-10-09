import { z } from "zod";
import {
  AGENT_QUERY_SCHEMA_VERSION,
  type AgentAdaptiveQuery,
  type AgentQueryTopic,
} from "./agent-query-plan";

export const GEOMACRO_MCP_PROTOCOL_VERSION = "2026-07-28" as const;
export const GEOMACRO_MCP_SERVER_VERSION = "geomacro-mcp-v1" as const;
export const GEOMACRO_MCP_PATH = "/api/mcp" as const;

export const GEOMACRO_AGENT_TOOL_NAMES = [
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
  risk_object: z.record(z.unknown()),
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

const iso3Json = { type: "string", pattern: "^[A-Z]{3}$", description: "ISO 3166-1 alpha-3 country code." };
const domainsJson = {
  type: "array",
  minItems: 1,
  maxItems: 3,
  uniqueItems: true,
  items: { type: "string", enum: [...GEOMACRO_AGENT_DOMAINS] },
  default: [...GEOMACRO_AGENT_DOMAINS],
};
const commonProperties = {
  domains: domainsJson,
  max_age_seconds: { type: "integer", minimum: 1, maximum: 94_608_000 },
  detail: { type: "string", enum: ["compact", "standard", "full"], default: "standard" },
  client_request_id: { type: "string", minLength: 4, maxLength: 128 },
};
const genericSubjectJson = {
  oneOf: [
    {
      type: "object",
      properties: { type: { const: "country" }, country_iso3: iso3Json },
      required: ["type", "country_iso3"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { const: "corridor" },
        origin_country_iso3: iso3Json,
        destination_country_iso3: iso3Json,
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
    name: "country_risk",
    description: "Return current derived Geomacro country risk across selected commercial domains. Never returns raw upstream data or source identity.",
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
    description: "Return directional derived corridor risk using the canonical Geomacro intelligence layer.",
    paid: true,
    inputSchema: objectSchema(
      {
        origin_country_iso3: iso3Json,
        destination_country_iso3: iso3Json,
        ...commonProperties,
      },
      ["origin_country_iso3", "destination_country_iso3"],
    ),
    outputSchema: intelligenceOutputSchema,
    example: { origin_country_iso3: "USA", destination_country_iso3: "CHN", domains: [...GEOMACRO_AGENT_DOMAINS] },
  },
  {
    name: "change_since_last_verified",
    description: "Explain material change since the previous published verified Geomacro state for a country or directional corridor.",
    paid: true,
    inputSchema: objectSchema({ subject: genericSubjectJson, ...commonProperties }, ["subject"]),
    outputSchema: intelligenceOutputSchema,
    example: { subject: { type: "country", country_iso3: "DEU" }, domains: [...GEOMACRO_AGENT_DOMAINS] },
  },
  {
    name: "why_changed",
    description: "Return the derived Geomacro cause and drivers behind the latest verified risk-state change.",
    paid: true,
    inputSchema: objectSchema({ subject: genericSubjectJson, ...commonProperties }, ["subject"]),
    outputSchema: intelligenceOutputSchema,
    example: { subject: { type: "country", country_iso3: "BRA" }, domains: [...GEOMACRO_AGENT_DOMAINS] },
  },
  {
    name: "three_domain_state",
    description: "Return current geopolitical, macro/FX and critical-minerals state from one canonical Geomacro truth.",
    paid: true,
    inputSchema: objectSchema({ subject: genericSubjectJson, ...commonProperties }, ["subject"]),
    outputSchema: intelligenceOutputSchema,
    example: { subject: { type: "country", country_iso3: "ZAF" } },
  },
  {
    name: "risk_gate_decision_context",
    description: "Return non-executing Risk Gate decision context grounded in current verified Geomacro intelligence.",
    paid: true,
    inputSchema: objectSchema(
      {
        subject: genericSubjectJson,
        ...commonProperties,
        policy_preset: { type: "string", enum: ["balanced", "cautious", "strict"], default: "balanced" },
        action_type: { type: "string", enum: ["treasury_payment", "vendor_payment", "agent_payment", "exposure_review"] },
        amount_usdc: { type: "number", exclusiveMinimum: 0, maximum: 1_000_000_000 },
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
    description: "Verify a caller-supplied signed Geomacro Risk Object against the current public trust/key lifecycle. This verifies integrity only and does not authorize execution.",
    paid: false,
    inputSchema: objectSchema(
      { risk_object: { type: "object", description: "Complete signed Geomacro Risk Object supplied by the caller." } },
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
