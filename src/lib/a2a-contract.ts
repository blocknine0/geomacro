import { z } from "zod";

import {
  DEMO_ACTION_TYPES,
  DEMO_POLICY_PRESETS,
} from "./agentic-demo-contract";
import { testnetPaymentProofSchema } from "./testnet-intelligence-contract";

export const GEOMACRO_A2A_PROTOCOL_VERSION = "1.0" as const;
export const GEOMACRO_A2A_AGENT_VERSION = "geomacro-a2a-v1" as const;
export const GEOMACRO_A2A_SKILL_ID = "risk_preflight" as const;

export const A2A_TASK_STATES = [
  "TASK_STATE_SUBMITTED",
  "TASK_STATE_WORKING",
  "TASK_STATE_INPUT_REQUIRED",
  "TASK_STATE_AUTH_REQUIRED",
  "TASK_STATE_COMPLETED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_FAILED",
  "TASK_STATE_REJECTED",
] as const;

export type A2ATaskState = (typeof A2A_TASK_STATES)[number];

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

export const a2aRiskPreflightInputSchema = z
  .object({
    subject: z.discriminatedUnion("type", [
      z.object({ type: z.literal("country"), country_iso3: iso3 }),
      z.object({
        type: z.literal("corridor"),
        origin_country_iso3: iso3,
        destination_country_iso3: iso3,
      }),
    ]),
    policy_preset: z.enum(DEMO_POLICY_PRESETS).default("balanced"),
    action_type: z.enum(DEMO_ACTION_TYPES).default("agent_payment"),
    amount_usdc: z.number().finite().positive().max(1_000_000_000).optional(),
    payment: testnetPaymentProofSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.subject.type === "corridor" &&
      value.subject.origin_country_iso3 === value.subject.destination_country_iso3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject", "destination_country_iso3"],
        message: "Corridor endpoints must be different countries",
      });
    }
  });

export const a2aSkillEnvelopeSchema = z.object({
  skillId: z.literal(GEOMACRO_A2A_SKILL_ID),
  input: a2aRiskPreflightInputSchema,
});

export const a2aPartSchema = z
  .object({
    text: z.string().max(4_000).optional(),
    data: z.unknown().optional(),
    raw: z.string().max(256 * 1024).optional(),
    url: z.string().url().max(2_048).optional(),
    mediaType: z.string().trim().min(1).max(160).optional(),
    filename: z.string().trim().min(1).max(255).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const contentFields = [
      value.text !== undefined,
      value.data !== undefined,
      value.raw !== undefined,
      value.url !== undefined,
    ].filter(Boolean).length;
    if (contentFields !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each A2A part must contain exactly one content field: text, data, raw or url",
      });
    }
  });

export const a2aMessageSchema = z.object({
  messageId: z.string().trim().min(1).max(160),
  taskId: z.string().uuid().optional(),
  contextId: z.string().trim().min(1).max(160).optional(),
  role: z.enum(["ROLE_USER", "ROLE_AGENT"]),
  parts: z.array(a2aPartSchema).min(1).max(8),
  metadata: z.record(z.unknown()).optional(),
  extensions: z.array(z.string().url().max(2_048)).max(16).optional(),
  referenceTaskIds: z.array(z.string().trim().min(1).max(160)).max(16).optional(),
});

export const a2aPushAuthenticationSchema = z
  .object({
    scheme: z.string().trim().min(1).max(80),
    credentials: z.string().max(2_048).optional(),
  })
  .strict();

export const a2aPushNotificationConfigSchema = z.object({
  tenant: z.string().trim().max(120).optional(),
  id: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  url: z.string().url().max(2_048),
  token: z.string().trim().min(8).max(256).optional(),
  authentication: a2aPushAuthenticationSchema.optional(),
});

export const a2aSendMessageRequestSchema = z.object({
  tenant: z.string().trim().max(120).optional(),
  message: a2aMessageSchema,
  configuration: z
    .object({
      acceptedOutputModes: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
      taskPushNotificationConfig: a2aPushNotificationConfigSchema.optional(),
      historyLength: z.number().int().min(0).max(50).optional(),
      returnImmediately: z.boolean().optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type A2ASendMessageRequest = z.infer<typeof a2aSendMessageRequestSchema>;
export type A2AMessage = z.infer<typeof a2aMessageSchema>;
export type A2ARiskPreflightInput = z.infer<typeof a2aRiskPreflightInputSchema>;
export type A2APushNotificationConfig = z.infer<typeof a2aPushNotificationConfigSchema>;

export function extractA2ARiskPreflightInput(message: A2AMessage): A2ARiskPreflightInput {
  const dataParts = message.parts.filter((part) => part.data !== undefined);
  if (dataParts.length !== 1) {
    throw new Error("A2A_RISK_PREFLIGHT_REQUIRES_ONE_DATA_PART");
  }
  return a2aSkillEnvelopeSchema.parse(dataParts[0].data).input;
}

const emptyScopes = { list: [] as string[] };

export function geomacroA2AAgentCard(origin = "https://geomacro.live") {
  const normalized = origin.replace(/\/$/, "");
  return {
    name: "Geomacro Agent",
    description:
      "Geopolitical and macro risk intelligence for AI agents, including a bounded Risk Gate preflight skill with signed Risk Objects and machine-readable decision context.",
    supportedInterfaces: [
      {
        url: `${normalized}/api/a2a`,
        protocolBinding: "HTTP+JSON",
        protocolVersion: GEOMACRO_A2A_PROTOCOL_VERSION,
      },
    ],
    provider: {
      organization: "Geomacro",
      url: normalized,
    },
    version: GEOMACRO_A2A_AGENT_VERSION,
    documentationUrl: `${normalized}/docs`,
    capabilities: {
      streaming: false,
      pushNotifications: true,
      extendedAgentCard: true,
    },
    securitySchemes: {
      geomacroBearer: {
        httpAuthSecurityScheme: {
          scheme: "Bearer",
          bearerFormat: "opaque",
          description: "Geomacro commercial API bearer credential.",
        },
      },
      geomacroTestnetKey: {
        apiKeySecurityScheme: {
          location: "header",
          name: "X-Geomacro-Api-Key",
          description: "Geomacro Testnet developer API key.",
        },
      },
      geomacroTestnetSecret: {
        apiKeySecurityScheme: {
          location: "header",
          name: "X-Geomacro-Api-Secret",
          description:
            "Geomacro Testnet developer API secret. Required together with the Testnet API key.",
        },
      },
    },
    securityRequirements: [
      { schemes: { geomacroBearer: emptyScopes } },
      {
        schemes: {
          geomacroTestnetKey: emptyScopes,
          geomacroTestnetSecret: emptyScopes,
        },
      },
    ],
    defaultInputModes: ["application/json", "text/plain"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: GEOMACRO_A2A_SKILL_ID,
        name: "Risk preflight",
        description:
          "Evaluate a country or directional corridor before an agent payment or exposure action. Returns Risk Gate decision context, a verified signed Risk Object, structural context and canonical GRI context. Geomacro never authorizes execution.",
        tags: ["geopolitical-risk", "macro-risk", "risk-gate", "treasury", "payments"],
        examples: [
          "Assess India before a treasury payment.",
          "Evaluate the India to Singapore corridor before an agent payment.",
        ],
        inputModes: ["application/json"],
        outputModes: ["application/json"],
        securityRequirements: [
          { schemes: { geomacroBearer: emptyScopes } },
          {
            schemes: {
              geomacroTestnetKey: emptyScopes,
              geomacroTestnetSecret: emptyScopes,
            },
          },
        ],
      },
    ],
  } as const;
}
