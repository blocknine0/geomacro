import { z } from "zod";

import { agenticDemoRequestSchema } from "./agentic-demo-contract";

export const A2A_PROTOCOL_VERSION = "1.0" as const;
export const GEOMACRO_A2A_AGENT_VERSION = "1.0.0" as const;
export const GEOMACRO_A2A_ENDPOINT = "https://geomacro.live/a2a" as const;
export const GEOMACRO_A2A_DISCOVERY =
  "https://geomacro.live/.well-known/agent-card.json" as const;
export const GEOMACRO_A2A_EXTENSION =
  "https://geomacro.live/extensions/risk-preflight/v1" as const;

export const A2A_TASK_STATES = [
  "TASK_STATE_SUBMITTED",
  "TASK_STATE_WORKING",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_REJECTED",
  "TASK_STATE_AUTH_REQUIRED",
] as const;

export type A2ATaskState = (typeof A2A_TASK_STATES)[number];

const jsonRpcIdSchema = z.union([z.string().max(160), z.number().finite().safe()]);

const dataPartSchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
    mediaType: z.string().trim().max(128).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const a2aMessageSchema = z
  .object({
    role: z.enum(["ROLE_USER", "ROLE_AGENT"]),
    messageId: z.string().trim().min(4).max(160),
    contextId: z.string().trim().min(4).max(160).optional(),
    taskId: z.string().trim().min(4).max(160).optional(),
    referenceTaskIds: z.array(z.string().trim().min(4).max(160)).max(20).optional(),
    parts: z.array(dataPartSchema).min(1).max(8),
    metadata: z.record(z.string(), z.unknown()).optional(),
    extensions: z.array(z.string().url()).max(16).optional(),
  })
  .strict();

export const a2aClientMessageSchema = a2aMessageSchema.extend({
  role: z.literal("ROLE_USER"),
});

const authenticationSchema = z
  .object({
    schemes: z.array(z.string().trim().min(1).max(32)).min(1).max(4),
    credentials: z.string().max(2048).optional(),
  })
  .strict();

export const a2aPushConfigSchema = z
  .object({
    id: z.string().trim().min(4).max(160).optional(),
    taskId: z.string().trim().min(4).max(160).optional(),
    url: z.string().url().max(2048),
    token: z.string().min(8).max(512).optional(),
    authentication: authenticationSchema.optional(),
  })
  .strict();

const sendConfigurationSchema = z
  .object({
    acceptedOutputModes: z.array(z.string().trim().min(1).max(128)).max(16).optional(),
    historyLength: z.number().int().min(0).max(100).optional(),
    returnImmediately: z.boolean().optional(),
    taskPushNotificationConfig: a2aPushConfigSchema.optional(),
  })
  .strict()
  .optional();

export const a2aSendMessageParamsSchema = z
  .object({
    message: a2aClientMessageSchema,
    configuration: sendConfigurationSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const a2aTaskIdParamsSchema = z
  .object({
    id: z.string().trim().min(4).max(160),
    historyLength: z.number().int().min(0).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const a2aListTasksParamsSchema = z
  .object({
    pageSize: z.number().int().min(1).max(100).default(20),
    pageToken: z.string().trim().max(256).optional(),
    contextId: z.string().trim().min(4).max(160).optional(),
    status: z.enum(A2A_TASK_STATES).optional(),
    historyLength: z.number().int().min(0).max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const a2aCreatePushConfigParamsSchema = a2aPushConfigSchema.extend({
  taskId: z.string().trim().min(4).max(160),
});

export const a2aPushConfigLookupSchema = z
  .object({
    taskId: z.string().trim().min(4).max(160),
    id: z.string().trim().min(4).max(160).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const a2aDeletePushConfigParamsSchema = z
  .object({
    taskId: z.string().trim().min(4).max(160),
    id: z.string().trim().min(4).max(160),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const a2aJsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: jsonRpcIdSchema,
    method: z.string().trim().min(1).max(96),
    params: z.unknown().optional(),
  })
  .strict();

export const a2aRiskPreflightDataSchema = agenticDemoRequestSchema.extend({
  skill: z.literal("risk_preflight").default("risk_preflight"),
});

export type A2ARiskPreflightData = z.infer<typeof a2aRiskPreflightDataSchema>;
export type A2AMessage = z.infer<typeof a2aMessageSchema>;
export type A2AClientMessage = z.infer<typeof a2aClientMessageSchema>;
export type A2APushConfig = z.infer<typeof a2aPushConfigSchema>;

export function riskPreflightFromMessage(message: A2AClientMessage): A2ARiskPreflightData {
  if (message.parts.length !== 1) throw new Error("A2A_RISK_PREFLIGHT_REQUIRES_ONE_DATA_PART");
  const part = message.parts[0];
  if (part.mediaType && part.mediaType !== "application/json") {
    throw new Error("A2A_RISK_PREFLIGHT_REQUIRES_APPLICATION_JSON");
  }
  return a2aRiskPreflightDataSchema.parse(part.data);
}

export function geomacroA2AAgentCard(origin = "https://geomacro.live") {
  const normalized = origin.replace(/\/$/, "");
  return {
    name: "Geomacro Risk Intelligence Agent",
    description:
      "Machine-readable geopolitical and macro risk pre-flight for AI agents and financial software. Geomacro returns evidence-backed risk context and recommendations; it never authorizes execution.",
    supportedInterfaces: [
      { url: `${normalized}/a2a`, protocolBinding: "JSONRPC", protocolVersion: A2A_PROTOCOL_VERSION },
    ],
    provider: { organization: "Geomacro", url: normalized },
    version: GEOMACRO_A2A_AGENT_VERSION,
    documentationUrl: `${normalized}/docs`,
    capabilities: {
      streaming: false,
      pushNotifications: true,
      extendedAgentCard: false,
      extensions: [
        {
          uri: GEOMACRO_A2A_EXTENSION,
          description:
            "Geomacro risk_preflight structured-data contract. Arc Testnet x402 may be used only as a separate technical-proof payment path.",
          required: false,
        },
      ],
    },
    securitySchemes: {
      commercialBearer: {
        httpAuthSecurityScheme: {
          scheme: "Bearer",
          bearerFormat: "Geomacro API key",
          description: "Commercial/private-pilot Geomacro API credential obtained out of band.",
        },
      },
    },
    securityRequirements: [{ schemes: { commercialBearer: { list: [] } } }],
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "risk_preflight",
        name: "Risk pre-flight",
        description:
          "Evaluate a country or directional corridor against a bounded policy and return a signed Risk Object, Risk Gate recommendation, governed structural context where available, and canonical GRI context where eligible.",
        tags: ["geopolitical-risk", "macro-risk", "risk-gate", "treasury", "payments"],
        examples: [
          "Check geopolitical and macro risk before a treasury payment to a country.",
          "Check a directional country corridor before an autonomous financial agent proceeds.",
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
        securityRequirements: [{ schemes: { commercialBearer: { list: [] } } }],
      },
    ],
  } as const;
}

export function a2aJsonRpcSuccess(id: string | number, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

export function a2aJsonRpcError(id: string | number | null, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}
