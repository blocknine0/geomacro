import { z } from "zod";
import { agenticDemoRequestSchema } from "./agentic-demo-contract";

export const GEOMACRO_A2A_PROTOCOL_VERSION = "geomacro-a2a/1.0" as const;
export const GEOMACRO_A2A_CAPABILITIES = ["risk_preflight"] as const;
export const GEOMACRO_A2A_PAYMENT_MODES = [
  "commercial_credit",
  "x402_testnet",
] as const;
export const GEOMACRO_A2A_TRANSPORTS = ["poll", "callback"] as const;
export const GEOMACRO_A2A_OPERATIONS = [
  "negotiate",
  "submit_task",
  "task_status",
  "callback",
] as const;

export type GeomacroA2ACapability = (typeof GEOMACRO_A2A_CAPABILITIES)[number];
export type GeomacroA2APaymentMode = (typeof GEOMACRO_A2A_PAYMENT_MODES)[number];

const safeId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const nonce = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/);
const timestamp = z.string().datetime({ offset: true });
const callbackUrl = z
  .string()
  .url()
  .max(512)
  .refine((value) => value.startsWith("https://"), "callback_url must use https");
const boundedMetadata = z
  .record(z.string(), z.string().max(256))
  .refine((value) => Object.keys(value).length <= 16, {
    message: "client_metadata may contain at most 16 entries",
  });

export const a2aSignedEnvelopeBaseSchema = z.object({
  protocol_version: z.literal(GEOMACRO_A2A_PROTOCOL_VERSION),
  agent_id: safeId,
  key_id: safeId,
  nonce,
  issued_at: timestamp,
  expires_at: timestamp,
  signature: z.string().trim().min(40).max(512),
});

export const a2aNegotiationPayloadSchema = z.object({
  desired_capabilities: z.array(z.enum(GEOMACRO_A2A_CAPABILITIES)).min(1).max(8),
  payment_modes: z.array(z.enum(GEOMACRO_A2A_PAYMENT_MODES)).min(1).max(4),
  transports: z.array(z.enum(GEOMACRO_A2A_TRANSPORTS)).min(1).max(4),
  callback_url: callbackUrl.optional(),
  client_metadata: boundedMetadata.optional(),
});

export const a2aNegotiationEnvelopeSchema = a2aSignedEnvelopeBaseSchema.extend({
  payload: a2aNegotiationPayloadSchema,
});

export const a2aTaskPayloadSchema = z.object({
  external_task_id: safeId,
  capability: z.enum(GEOMACRO_A2A_CAPABILITIES),
  payment_mode: z.enum(GEOMACRO_A2A_PAYMENT_MODES),
  input: agenticDemoRequestSchema,
  callback_url: callbackUrl.optional(),
});

export const a2aTaskEnvelopeSchema = a2aSignedEnvelopeBaseSchema.extend({
  payload: a2aTaskPayloadSchema,
});

export const a2aStatusPayloadSchema = z.object({
  task_id: z.string().uuid(),
});

export const a2aStatusEnvelopeSchema = a2aSignedEnvelopeBaseSchema.extend({
  payload: a2aStatusPayloadSchema,
});

export const a2aCallbackPayloadSchema = z.object({
  external_task_id: safeId,
  remote_task_id: z.string().max(128).optional(),
  status: z.enum(["completed", "failed", "cancelled"]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string().max(128),
      message: z.string().max(1024),
    })
    .optional(),
});

export const a2aCallbackEnvelopeSchema = a2aSignedEnvelopeBaseSchema.extend({
  payload: a2aCallbackPayloadSchema,
});

export type A2ANegotiationEnvelope = z.infer<typeof a2aNegotiationEnvelopeSchema>;
export type A2ATaskEnvelope = z.infer<typeof a2aTaskEnvelopeSchema>;
export type A2AStatusEnvelope = z.infer<typeof a2aStatusEnvelopeSchema>;
export type A2ACallbackEnvelope = z.infer<typeof a2aCallbackEnvelopeSchema>;

export type A2ASignature = {
  key_id: string;
  scheme: "Ed25519";
  canonicalization: "geomacro-a2a-json-v1";
  payload_hash: string;
  signature: string;
};

export function geomacroA2AManifest(origin = "https://geomacro.live") {
  const endpoint = `${origin}/api/agent/a2a`;
  return {
    protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
    agent: {
      id: "geomacro",
      name: "Geomacro Agent",
      mode: "read_and_recommend",
      execution_authorized: false,
    },
    discovery: `${origin}/.well-known/geomacro-a2a.json`,
    verification_keys: `${origin}/api/risk-object-keys`,
    endpoint,
    operations: GEOMACRO_A2A_OPERATIONS,
    endpoints: {
      negotiate: endpoint,
      tasks: endpoint,
      status: endpoint,
      callback: endpoint,
    },
    capabilities: [
      {
        id: "risk_preflight",
        input: "country_or_directional_corridor_plus_policy_context",
        output: "signed_risk_object_plus_risk_gate_recommendation",
      },
    ],
    payment_modes: GEOMACRO_A2A_PAYMENT_MODES,
    transports: GEOMACRO_A2A_TRANSPORTS,
    security: {
      request_signatures: "Ed25519",
      response_signatures: "Ed25519",
      replay_protection: "nonce_registry_plus_expiry",
      callbacks: "registered_https_hosts_only",
    },
    boundaries: {
      execution_authorized: false,
      autonomous_execution: false,
      wallet_custody: false,
      transaction_signing: false,
      outbound_x402_auto_payment: false,
    },
  } as const;
}
