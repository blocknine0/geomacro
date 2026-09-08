import { z } from "zod";
import type { RiskGatePolicy } from "./risk-gate-contract";

export const DEMO_POLICY_PRESETS = ["balanced", "cautious", "strict"] as const;
export type DemoPolicyPreset = (typeof DEMO_POLICY_PRESETS)[number];

export const DEMO_ACTION_TYPES = [
  "treasury_payment",
  "vendor_payment",
  "agent_payment",
  "exposure_review",
] as const;
export type DemoActionType = (typeof DEMO_ACTION_TYPES)[number];

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

const countrySubject = z.object({
  type: z.literal("country"),
  country_iso3: iso3,
});

const corridorSubject = z
  .object({
    type: z.literal("corridor"),
    origin_country_iso3: iso3,
    destination_country_iso3: iso3,
  })
  .superRefine((value, ctx) => {
    if (value.origin_country_iso3 === value.destination_country_iso3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Corridor origin and destination must differ",
        path: ["destination_country_iso3"],
      });
    }
  });

export const agenticDemoRequestSchema = z.object({
  subject: z.union([countrySubject, corridorSubject]),
  policy_preset: z.enum(DEMO_POLICY_PRESETS).default("balanced"),
  action_type: z.enum(DEMO_ACTION_TYPES).default("agent_payment"),
  amount_usdc: z.number().finite().positive().max(1_000_000_000).optional(),
  client_request_id: z.string().trim().min(4).max(128).optional(),
});

export type AgenticDemoRequest = z.infer<typeof agenticDemoRequestSchema>;

export type DemoStructuralObservation = {
  observation_id: string;
  dimension: string;
  country_iso3: string | null;
  partner_country_iso3: string | null;
  observed_at: string | null;
  published_at: string | null;
  metric: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  signal_type: string | null;
  source_id: string;
  source_url: string | null;
  normalized_hash: string;
};

export type DemoStructuralContext = {
  status: "AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED";
  methodology_status: "EVIDENCE_ONLY_NOT_IN_GRI_V1_2";
  observations: DemoStructuralObservation[];
  note: string;
};

export function demoPolicyFromPreset(preset: DemoPolicyPreset): RiskGatePolicy {
  const shared = {
    policy_id: `geomacro-demo-${preset}`,
    policy_version: "1.0.0",
    require_commercial_verification_for_continue: true,
  } as const;

  if (preset === "strict") {
    return {
      ...shared,
      continue_max_score: 15,
      reduce_limit_max_score: 30,
      require_approval_max_score: 50,
      minimum_confidence_for_auto_continue: 0.8,
      max_positive_delta_for_auto_continue: 5,
    };
  }

  if (preset === "cautious") {
    return {
      ...shared,
      continue_max_score: 20,
      reduce_limit_max_score: 40,
      require_approval_max_score: 60,
      minimum_confidence_for_auto_continue: 0.75,
      max_positive_delta_for_auto_continue: 7.5,
    };
  }

  return {
    ...shared,
    continue_max_score: 30,
    reduce_limit_max_score: 50,
    require_approval_max_score: 70,
    minimum_confidence_for_auto_continue: 0.65,
    max_positive_delta_for_auto_continue: 10,
  };
}
