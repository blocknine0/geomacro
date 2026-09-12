import { z } from "zod";

import {
  DEMO_ACTION_TYPES,
  DEMO_POLICY_PRESETS,
} from "./agentic-demo-contract";
import {
  GEOMACRO_CREDIT_COSTS,
  type GeomacroCreditCapability,
} from "./commercial-access-contract";

export const TESTNET_INTELLIGENCE_API_VERSION =
  "testnet-intelligence-v1.0.0" as const;

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

export const TESTNET_INTELLIGENCE_OUTPUT_BOUNDARIES = {
  machine_readable: true,
  raw_data_included: false,
  private_warehouse_access: false,
  upstream_news_source_identity_exposed: false,
  structured_delivery_only: true,
  execution_authorized: false,
} as const;

type TestnetCapabilityCatalogEntry = {
  description: string;
  subject_types: readonly ("query" | "global" | "country" | "corridor")[];
  signed_output: boolean;
  risk_gate_output: boolean;
  full_product_bundle: boolean;
  includes: readonly string[];
  request_example: Record<string, unknown>;
};

export const TESTNET_INTELLIGENCE_CAPABILITY_CATALOG = {
  intelligence_query: {
    description:
      "Ask a natural-language geopolitical or macro question against Geomacro stored intelligence.",
    subject_types: ["query"],
    signed_output: false,
    risk_gate_output: false,
    full_product_bundle: false,
    includes: [
      "summary",
      "what_changed",
      "why_it_matters",
      "geomacro_view",
      "confidence_flags",
      "GRI context",
      "bounded evidence references",
      "provenance",
    ],
    request_example: {
      request_id: "example-query-0001",
      capability: "intelligence_query",
      question: "What changed in global geopolitical risk today?",
    },
  },
  gri_read: {
    description:
      "Read the canonical global GRI with exact score lineage, proof hashes and mathematical change attribution.",
    subject_types: ["global"],
    signed_output: false,
    risk_gate_output: false,
    full_product_bundle: false,
    includes: [
      "current and previous display/raw score",
      "score delta",
      "coverage and weighted confidence",
      "event/source/story counts",
      "methodology and proof versions",
      "proof/evidence/calculation/input/methodology/disposition/change hashes",
      "reconciliation residuals",
      "change attribution drivers",
      "top driver",
      "freshness age",
    ],
    request_example: {
      request_id: "example-gri-0001",
      capability: "gri_read",
      subject: { type: "global" },
    },
  },
  structural_country_digest: {
    description:
      "Compact country structural intelligence with current Testnet live severity, provenance and coverage.",
    subject_types: ["country"],
    signed_output: false,
    risk_gate_output: false,
    full_product_bundle: false,
    includes: [
      "live severity",
      "up to 3 structural observations",
      "source and record provenance IDs",
      "retrieval/publish/observation timestamps",
      "normalized hashes",
      "coverage",
      "methodology and quality status",
    ],
    request_example: {
      request_id: "example-country-digest-0001",
      capability: "structural_country_digest",
      subject: { type: "country", country_iso3: "IND" },
    },
  },
  structural_corridor_digest: {
    description:
      "Compact origin-to-destination corridor structural intelligence with provenance and coverage.",
    subject_types: ["corridor"],
    signed_output: false,
    risk_gate_output: false,
    full_product_bundle: false,
    includes: [
      "live severity",
      "up to 3 structural observations",
      "corridor composition context",
      "source and record provenance IDs",
      "retrieval/publish/observation timestamps",
      "normalized hashes",
      "coverage",
      "methodology and quality status",
    ],
    request_example: {
      request_id: "example-corridor-digest-0001",
      capability: "structural_corridor_digest",
      subject: {
        type: "corridor",
        origin_country_iso3: "IND",
        destination_country_iso3: "SGP",
      },
    },
  },
  structural_country_profile: {
    description:
      "Expanded country structural intelligence profile with bounded machine-readable observations and provenance.",
    subject_types: ["country"],
    signed_output: false,
    risk_gate_output: false,
    full_product_bundle: false,
    includes: [
      "live severity",
      "up to the Testnet tier observation limit",
      "source and record provenance IDs",
      "timestamps and normalized hashes",
      "coverage",
      "serving/composition metadata",
      "methodology and quality status",
    ],
    request_example: {
      request_id: "example-country-profile-0001",
      capability: "structural_country_profile",
      subject: { type: "country", country_iso3: "IND" },
    },
  },
  structural_corridor_profile: {
    description:
      "Expanded corridor structural intelligence profile with bounded observations, provenance and composition context.",
    subject_types: ["corridor"],
    signed_output: false,
    risk_gate_output: false,
    full_product_bundle: false,
    includes: [
      "live severity",
      "up to the Testnet tier observation limit",
      "corridor composition context",
      "source and record provenance IDs",
      "timestamps and normalized hashes",
      "coverage",
      "serving/composition metadata",
      "methodology and quality status",
    ],
    request_example: {
      request_id: "example-corridor-profile-0001",
      capability: "structural_corridor_profile",
      subject: {
        type: "corridor",
        origin_country_iso3: "IND",
        destination_country_iso3: "SGP",
      },
    },
  },
  signed_risk_object: {
    description:
      "Return the latest compatible cryptographically verified Geomacro Risk Object for a country or corridor.",
    subject_types: ["country", "corridor"],
    signed_output: true,
    risk_gate_output: false,
    full_product_bundle: false,
    includes: [
      "canonical signed Risk Object",
      "evidence/confidence/freshness fields embedded in the Risk Object",
      "country or corridor context",
      "integrity/signature material",
      "public verification result",
    ],
    request_example: {
      request_id: "example-risk-object-0001",
      capability: "signed_risk_object",
      subject: { type: "country", country_iso3: "IND" },
    },
  },
  risk_gate_bundle: {
    description:
      "Full machine-decision bundle combining Risk Gate output, signed Risk Object, structural intelligence and canonical GRI context.",
    subject_types: ["country", "corridor"],
    signed_output: true,
    risk_gate_output: true,
    full_product_bundle: true,
    includes: [
      "Risk Gate decision and reasons",
      "policy preset and resolved policy",
      "action context",
      "canonical signed Risk Object and verification",
      "structural country/corridor profile",
      "live severity",
      "provenance and coverage",
      "canonical GRI",
      "GRI change attribution and proof hashes",
      "execution boundary",
    ],
    request_example: {
      request_id: "example-risk-gate-0001",
      capability: "risk_gate_bundle",
      subject: {
        type: "corridor",
        origin_country_iso3: "IND",
        destination_country_iso3: "SGP",
      },
      policy_preset: "balanced",
      action_type: "agent_payment",
      amount_usdc: 1000,
    },
  },
} as const satisfies Record<
  TestnetIntelligenceCapability,
  TestnetCapabilityCatalogEntry
>;
