import { z } from "zod";
import {
  GEOMACRO_CREDIT_CONTRACT_VERSION,
  GEOMACRO_CREDIT_COSTS,
} from "./commercial-access-contract";
import {
  STRUCTURED_DATA_REGISTRY_VERSION,
} from "./structured-data-entitlement-registry";

export const GEOMACRO_AGENT_VERSION = "geomacro-agent-v1" as const;

export const GEOMACRO_AGENT_CAPABILITIES = [
  "risk_preflight",
] as const;

export type GeomacroAgentCapability =
  (typeof GEOMACRO_AGENT_CAPABILITIES)[number];

const INJECTION_RE =
  /(ignore (all|previous|prior)|disregard (all|previous)|system prompt|you are now|act as|jailbreak|<\|.*\|>)/i;

// Retained as reusable schemas for paid commercial surfaces. They are not
// anonymous/free capabilities of POST /api/agent/risk.
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
        "Grounded geopolitical and macro risk intelligence for software and AI agents through paid/private-pilot access.",
      mode: "read_and_recommend",
      execution_authorized: false,
    },
    endpoint: `${origin}/api/agent/risk`,
    discovery: `${origin}/.well-known/geomacro-agent.json`,
    capabilities: [
      {
        id: "risk_preflight",
        access: "x402_technical_proof_or_paid_private_pilot",
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
      free_api_access: false,
      free_structured_download: false,
      financial_advice: false,
      autonomous_execution: false,
      wallet_custody: false,
      transaction_signing: false,
      sanctions_screening_replacement: false,
      raw_data_delivery: false,
      corridor_model: "directional endpoint-composed pilot",
    },
    commercial: {
      structured_data_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
      credit_contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
      free_web: "public_website_dashboard_only",
      public_api: "not_available",
      public_structured_data_download: "not_available",
      commercial_structured_api: "/api/commercial/structural",
      risk_api: "paid_private_pilot",
      institutional_sla: "not_generally_available",
      x402_price_note:
        "Current Arc Testnet x402 pricing is technical proof only and is not institutional pricing or commercial revenue.",
    },
  } as const;
}
