import { z } from "zod";
import {
  GEOMACRO_ACCESS_TIERS,
  GEOMACRO_CREDIT_CONTRACT_VERSION,
  GEOMACRO_CREDIT_COSTS,
} from "./commercial-access-contract";

export const GEOMACRO_AGENT_VERSION = "geomacro-agent-v1" as const;

export const GEOMACRO_AGENT_CAPABILITIES = [
  "intelligence_query",
  "structural_query",
  "risk_preflight",
] as const;

export type GeomacroAgentCapability =
  (typeof GEOMACRO_AGENT_CAPABILITIES)[number];

const INJECTION_RE =
  /(ignore (all|previous|prior)|disregard (all|previous)|system prompt|you are now|act as|jailbreak|<\|.*\|>)/i;

export const agentIntelligenceQuerySchema = z.object({
  capability: z.literal("intelligence_query"),
  question: z
    .string()
    .trim()
    .min(4)
    .max(300)
    .refine((value) => !INJECTION_RE.test(value), { message: "Invalid input" }),
  client_request_id: z.string().trim().min(4).max(128).optional(),
});

const Iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

const StructuralSubjectSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("country"),
      country_iso3: Iso3,
    }),
    z.object({
      type: z.literal("corridor"),
      origin_country_iso3: Iso3,
      destination_country_iso3: Iso3,
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      value.type === "corridor" &&
      value.origin_country_iso3 === value.destination_country_iso3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination_country_iso3"],
        message: "Corridor endpoints must be different countries",
      });
    }
  });

export const agentStructuralQuerySchema = z.object({
  capability: z.literal("structural_query"),
  subject: StructuralSubjectSchema,
  client_request_id: z.string().trim().min(4).max(128).optional(),
});

export type AgentIntelligenceQuery = z.infer<
  typeof agentIntelligenceQuerySchema
>;
export type AgentStructuralQuery = z.infer<typeof agentStructuralQuerySchema>;

export function geomacroAgentManifest(origin = "https://geomacro.live") {
  return {
    agent: {
      id: "geomacro",
      name: "Geomacro Agent",
      version: GEOMACRO_AGENT_VERSION,
      description:
        "Grounded geopolitical and macro risk intelligence for humans, software and AI agents.",
      mode: "read_and_recommend",
      execution_authorized: false,
    },
    endpoint: `${origin}/api/agent/risk`,
    discovery: `${origin}/.well-known/geomacro-agent.json`,
    capabilities: [
      {
        id: "intelligence_query",
        access: "public_free",
        method: "POST",
        credit_cost: GEOMACRO_CREDIT_COSTS.intelligence_query,
        request: {
          capability: "intelligence_query",
          question: "string, 4-300 characters",
          client_request_id: "optional string",
        },
        response:
          "Grounded summary, what changed, why it matters, Geomacro view, evidence references, confidence flags and current verified GRI when available.",
        data_policy:
          "Uses Geomacro stored intelligence and the canonical public GRI contract. No external web search or synthetic fallback score is used.",
      },
      {
        id: "structural_query",
        access: "public_free",
        method: "POST",
        credit_cost: {
          country: GEOMACRO_CREDIT_COSTS.structural_country_digest,
          corridor: GEOMACRO_CREDIT_COSTS.structural_corridor_digest,
        },
        request: {
          capability: "structural_query",
          subject:
            "One country ISO3 or one directional origin/destination ISO3 corridor",
          client_request_id: "optional string",
        },
        response:
          "Governed structured digest with explicit availability, up to three latest eligible observations, coverage summary and corridor composition metadata where relevant.",
        data_policy:
          "Structured commercial serving views only. Raw/private warehouse data is never returned. Missing evidence is never converted to zero risk.",
      },
      {
        id: "risk_preflight",
        access: "x402_technical_proof_or_private_pilot",
        method: "POST",
        credit_cost: GEOMACRO_CREDIT_COSTS.risk_gate_bundle,
        request:
          "Country or directional corridor subject plus policy/action context.",
        response:
          "Signed Risk Object, Risk Gate recommendation, governed structural context where available and canonical GRI context where eligible.",
        execution_authorized: false,
      },
    ],
    boundaries: {
      financial_advice: false,
      autonomous_execution: false,
      wallet_custody: false,
      transaction_signing: false,
      sanctions_screening_replacement: false,
      raw_data_delivery: false,
      corridor_model: "directional endpoint-composed pilot",
    },
    commercial: {
      credit_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
      free_credits_per_30_days: GEOMACRO_ACCESS_TIERS.free.credits_per_30_days,
      public_read: "available",
      public_structured_data: "limited_governed_digest",
      risk_api: "private_pilot",
      institutional_sla: "not_generally_available",
      credit_enforcement:
        "The credit tariff is the commercial contract. Anonymous public endpoints remain rate-limited until durable account credit metering is activated.",
      x402_price_note:
        "Current Arc Testnet x402 pricing is technical proof only and is not institutional pricing.",
    },
  } as const;
}
