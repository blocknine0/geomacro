import { createHash } from "node:crypto";
import { z } from "zod";

import {
  DEMO_ACTION_TYPES,
  DEMO_POLICY_PRESETS,
} from "./agentic-demo-contract";
import { GEOMACRO_CREDIT_COSTS } from "./commercial-access-contract";

export const GEOMACRO_A2A_PROTOCOL_VERSION = "geomacro-a2a/1" as const;
export const GEOMACRO_A2A_CAPABILITIES = ["risk_preflight"] as const;
export const GEOMACRO_A2A_PAYMENT_MODES = [
  "commercial_credit",
  "x402_testnet",
] as const;
export const GEOMACRO_A2A_CALLBACK_MODES = ["poll", "https_push"] as const;
export const GEOMACRO_A2A_MAX_BODY_BYTES = 16 * 1024;
export const GEOMACRO_A2A_SIGNATURE_TTL_SECONDS = 300;

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

export const a2aRiskSubjectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("country"),
    country_iso3: iso3,
  }),
  z
    .object({
      type: z.literal("corridor"),
      origin_country_iso3: iso3,
      destination_country_iso3: iso3,
    })
    .superRefine((value, ctx) => {
      if (value.origin_country_iso3 === value.destination_country_iso3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destination_country_iso3"],
          message: "Corridor endpoints must be different countries",
        });
      }
    }),
]);

export const ed25519PublicJwkSchema = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: z.string().trim().min(40).max(80),
});

export const a2aIdentityRegistrationSchema = z.object({
  agent_id: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._:-]{2,63}$/),
  public_key_jwk: ed25519PublicJwkSchema,
  callback_origins: z.array(z.string().trim().url()).max(8).default([]),
});

export const a2aNegotiationRequestSchema = z.object({
  protocol_versions: z.array(z.string().trim().min(3).max(80)).min(1).max(8),
  capabilities: z.array(z.string().trim().min(2).max(80)).min(1).max(16),
  payment_modes: z.array(z.string().trim().min(2).max(80)).min(1).max(8),
  callback_modes: z.array(z.string().trim().min(2).max(80)).default(["poll"]),
});

export const a2aTaskRequestSchema = z.object({
  protocol_version: z.literal(GEOMACRO_A2A_PROTOCOL_VERSION),
  client_task_id: z.string().trim().min(8).max(160),
  capability: z.literal("risk_preflight"),
  subject: a2aRiskSubjectSchema,
  policy_preset: z.enum(DEMO_POLICY_PRESETS).default("balanced"),
  action_type: z.enum(DEMO_ACTION_TYPES).default("agent_payment"),
  amount_usdc: z.number().finite().positive().max(1_000_000_000).optional(),
  payment_mode: z.enum(GEOMACRO_A2A_PAYMENT_MODES),
  callback: z
    .object({
      mode: z.literal("https_push"),
      url: z.string().trim().url(),
    })
    .optional(),
});

export type A2ATaskRequest = z.infer<typeof a2aTaskRequestSchema>;
export type A2AIdentityRegistration = z.infer<typeof a2aIdentityRegistrationSchema>;

export function sha256A2A(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalA2ASigningPayload(input: {
  method: string;
  pathname: string;
  timestamp: string;
  nonce: string;
  bodySha256: string;
}) {
  return [
    GEOMACRO_A2A_PROTOCOL_VERSION,
    input.method.trim().toUpperCase(),
    input.pathname.trim() || "/",
    input.timestamp.trim(),
    input.nonce.trim(),
    input.bodySha256.trim().toLowerCase(),
  ].join("\n");
}

export function geomacroA2AManifest(origin = "https://geomacro.live") {
  const base = origin.replace(/\/$/, "");
  return {
    protocol: {
      id: "geomacro-a2a",
      version: GEOMACRO_A2A_PROTOCOL_VERSION,
      transport: "https_json",
      request_signing: "ed25519_detached",
      replay_protection: "timestamp_plus_one_time_nonce",
    },
    agent: {
      id: "geomacro",
      name: "Geomacro Risk Agent",
      mode: "read_and_recommend",
      execution_authorized: false,
    },
    endpoints: {
      discovery: `${base}/.well-known/geomacro-a2a.json`,
      manifest: `${base}/api/a2a/manifest`,
      negotiate: `${base}/api/a2a/negotiate`,
      identity: `${base}/api/a2a/identity`,
      tasks: `${base}/api/a2a/tasks`,
      task_status_template: `${base}/api/a2a/tasks/{task_id}`,
    },
    capabilities: [
      {
        id: "risk_preflight",
        credit_capability: "risk_gate_bundle",
        credit_cost: GEOMACRO_CREDIT_COSTS.risk_gate_bundle,
        subject_types: ["country", "corridor"],
        result:
          "Signed Risk Object + Risk Gate decision + structural context + canonical GRI context",
      },
    ],
    payment_modes: {
      commercial_credit: {
        production_capable: true,
        requires_entitlement: true,
      },
      x402_testnet: {
        production_capable: false,
        technical_proof_only: true,
        asset: "USDC",
        network: "Arc Testnet",
      },
    },
    task_lifecycle: [
      "accepted",
      "payment_required",
      "processing",
      "completed",
      "failed",
    ],
    callback_modes: ["poll", "https_push"],
    boundaries: {
      financial_advice: false,
      autonomous_execution: false,
      transaction_signing: false,
      wallet_custody: false,
      raw_data_delivery: false,
      execution_authorized: false,
    },
  } as const;
}
