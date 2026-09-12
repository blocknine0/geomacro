import { z } from "zod";

import {
  DEMO_ACTION_TYPES,
  DEMO_POLICY_PRESETS,
} from "./agentic-demo-contract";
import {
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "./commercial-access-contract";

export const TESTNET_INTELLIGENCE_CAPABILITIES = [
  "intelligence_query",
  "gri_read",
  "structural_country_digest",
  "structural_corridor_digest",
  "structural_country_profile",
  "structural_corridor_profile",
  "signed_risk_object",
  "risk_gate_bundle",
] as const satisfies readonly GeomacroCreditCapability[];

export type TestnetIntelligenceCapability =
  (typeof TESTNET_INTELLIGENCE_CAPABILITIES)[number];

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

export const testnetIntelligenceSubjectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }),
  z.object({ type: z.literal("country"), country_iso3: iso3 }),
  z.object({
    type: z.literal("corridor"),
    origin_country_iso3: iso3,
    destination_country_iso3: iso3,
  }),
]);

export type TestnetIntelligenceSubject = z.infer<
  typeof testnetIntelligenceSubjectSchema
>;

export const testnetPaymentProofSchema = z.object({
  chain_key: z.string().trim().min(3).max(40),
  tx_hash: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/),
  payer_address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/),
});

export type TestnetPaymentProof = z.infer<typeof testnetPaymentProofSchema>;

export const testnetIntelligenceRequestSchema = z
  .object({
    request_id: z.string().trim().min(8).max(160),
    capability: z.enum(TESTNET_INTELLIGENCE_CAPABILITIES),
    question: z.string().trim().min(3).max(500).optional(),
    subject: testnetIntelligenceSubjectSchema.optional(),
    policy_preset: z.enum(DEMO_POLICY_PRESETS).default("balanced"),
    action_type: z.enum(DEMO_ACTION_TYPES).default("agent_payment"),
    amount_usdc: z.number().finite().positive().max(1_000_000_000).optional(),
    payment: testnetPaymentProofSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const subject = value.subject;

    if (
      subject?.type === "corridor" &&
      subject.origin_country_iso3 === subject.destination_country_iso3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject", "destination_country_iso3"],
        message: "Corridor origin and destination must differ",
      });
    }

    if (value.capability === "intelligence_query") {
      if (!value.question) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["question"],
          message: "question is required for intelligence_query",
        });
      }
      return;
    }

    if (value.capability === "gri_read") {
      if (subject && subject.type !== "global") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subject"],
          message: "gri_read currently serves the canonical global GRI",
        });
      }
      return;
    }

    if (!subject || subject.type === "global") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject"],
        message: "A country or corridor subject is required for this capability",
      });
      return;
    }

    if (
      value.capability.includes("country") &&
      subject.type !== "country"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject"],
        message: "This capability requires a country subject",
      });
    }

    if (
      value.capability.includes("corridor") &&
      subject.type !== "corridor"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject"],
        message: "This capability requires a corridor subject",
      });
    }
  });

export type TestnetIntelligenceRequest = z.infer<
  typeof testnetIntelligenceRequestSchema
>;

export const TESTNET_INTELLIGENCE_PRICE_TABLE = Object.fromEntries(
  TESTNET_INTELLIGENCE_CAPABILITIES.map((capability) => [
    capability,
    {
      credits: GEOMACRO_CREDIT_COSTS[capability],
      testnet_usdc: GEOMACRO_CREDIT_COSTS[capability] * 0.5,
    },
  ]),
) as Record<
  TestnetIntelligenceCapability,
  { credits: number; testnet_usdc: number }
>;
