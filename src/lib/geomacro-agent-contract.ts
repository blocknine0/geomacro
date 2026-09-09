import { z } from "zod";

export const GEOMACRO_AGENT_VERSION = "geomacro-agent-v1" as const;

export const GEOMACRO_AGENT_CAPABILITIES = [
  "intelligence_query",
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

export type AgentIntelligenceQuery = z.infer<
  typeof agentIntelligenceQuerySchema
>;

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
        id: "risk_preflight",
        access: "x402_technical_proof_or_private_pilot",
        method: "POST",
        request:
          "Country or directional corridor subject plus policy/action context.",
        response:
          "Signed Risk Object, Risk Gate recommendation, structural context where available and canonical GRI context where eligible.",
        execution_authorized: false,
      },
    ],
    boundaries: {
      financial_advice: false,
      autonomous_execution: false,
      wallet_custody: false,
      transaction_signing: false,
      sanctions_screening_replacement: false,
      corridor_model: "directional endpoint-composed pilot",
    },
    commercial: {
      public_read: "available",
      risk_api: "private_pilot",
      institutional_sla: "not_generally_available",
      x402_price_note:
        "Current Arc Testnet x402 pricing is technical proof only and is not institutional pricing.",
    },
  } as const;
}
