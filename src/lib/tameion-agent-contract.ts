import { parseUnits } from "ethers";
import { z } from "zod";
import type { RiskGateResponse } from "./risk-gate-contract";

export const TAMEION_AGENT_VERSION = "tameion-agent-v1" as const;
export const TAMEION_DECISION_TTL_SECONDS = 20 * 60;

export const TAMEION_POLICY_PRESETS = ["balanced", "cautious", "strict"] as const;
export type TameionPolicyPreset = (typeof TAMEION_POLICY_PRESETS)[number];

export const TAMEION_ACTION_TYPES = [
  "treasury_payment",
  "vendor_payment",
  "agent_payment",
] as const;
export type TameionActionType = (typeof TAMEION_ACTION_TYPES)[number];

export const TAMEION_AGENT_ACTIONS = [
  "AUTO_EXECUTE",
  "REQUIRE_APPROVAL",
  "BLOCK",
] as const;
export type TameionAgentAction = (typeof TAMEION_AGENT_ACTIONS)[number];

const iso3 = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const evmAddress = z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/);
const txHash = z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/);
const signature = z.string().trim().regex(/^0x[a-fA-F0-9]{130}$/);
const amountUsdc = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,18})?$/, "amount_usdc must be a positive decimal with at most 18 decimals")
  .refine((value) => {
    try {
      const atomic = parseUnits(value, 18);
      return atomic > 0n && atomic <= parseUnits("1000000", 18);
    } catch {
      return false;
    }
  }, "amount_usdc must be greater than 0 and at most 1,000,000");

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

export const tameionDecisionRequestSchema = z.object({
  subject: z.union([countrySubject, corridorSubject]),
  policy_preset: z.enum(TAMEION_POLICY_PRESETS).default("balanced"),
  action_type: z.enum(TAMEION_ACTION_TYPES).default("agent_payment"),
  amount_usdc: amountUsdc,
  recipient: evmAddress,
  client_request_id: z.string().trim().min(4).max(128).optional(),
});

export const tameionApprovalRequestSchema = z.object({
  audit_id: z.string().uuid(),
  approver_address: evmAddress,
  signature,
});

export const tameionConfirmRequestSchema = z.object({
  audit_id: z.string().uuid(),
  tx_hash: txHash,
});

export type TameionDecisionRequest = z.infer<typeof tameionDecisionRequestSchema>;
export type TameionApprovalRequest = z.infer<typeof tameionApprovalRequestSchema>;
export type TameionConfirmRequest = z.infer<typeof tameionConfirmRequestSchema>;

export type TameionBusinessPolicy = {
  preset: TameionPolicyPreset;
  auto_execute_max_usdc: number;
  human_approval_max_usdc: number;
};

export const TAMEION_BUSINESS_POLICIES: Record<TameionPolicyPreset, TameionBusinessPolicy> = {
  balanced: {
    preset: "balanced",
    auto_execute_max_usdc: 25,
    human_approval_max_usdc: 250,
  },
  cautious: {
    preset: "cautious",
    auto_execute_max_usdc: 10,
    human_approval_max_usdc: 100,
  },
  strict: {
    preset: "strict",
    auto_execute_max_usdc: 2,
    human_approval_max_usdc: 25,
  },
};

export type TameionPolicyDecision = {
  action: TameionAgentAction;
  reason_codes: string[];
  policy: TameionBusinessPolicy;
};

export function amountUsdcToAtomic(value: string): string {
  return parseUnits(value, 18).toString();
}

export function decideTameionAction(input: {
  preset: TameionPolicyPreset;
  amount_usdc: string;
  risk_gate: Pick<RiskGateResponse, "decision" | "recommended_action" | "execution_authorized">;
}): TameionPolicyDecision {
  if (input.risk_gate.execution_authorized !== false) {
    throw new Error("RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
  }

  const policy = TAMEION_BUSINESS_POLICIES[input.preset];
  const amount = Number(input.amount_usdc);
  const reasons: string[] = [];

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Invalid Tameion payment amount");
  }

  if (
    input.risk_gate.decision === "PAUSE" ||
    input.risk_gate.recommended_action === "BLOCK"
  ) {
    return {
      action: "BLOCK",
      reason_codes: ["risk_gate_blocked"],
      policy,
    };
  }

  if (amount > policy.human_approval_max_usdc) {
    return {
      action: "BLOCK",
      reason_codes: ["amount_above_human_approval_limit"],
      policy,
    };
  }

  if (
    input.risk_gate.decision === "REQUIRE_APPROVAL" ||
    input.risk_gate.recommended_action === "REQUIRE_HUMAN_APPROVAL"
  ) {
    reasons.push("risk_gate_requires_human_approval");
  }

  if (
    input.risk_gate.decision === "REDUCE_LIMIT" ||
    input.risk_gate.recommended_action === "REDUCE_EXPOSURE"
  ) {
    reasons.push("risk_gate_requires_reduced_exposure");
  }

  if (amount > policy.auto_execute_max_usdc) {
    reasons.push("amount_above_auto_execute_limit");
  }

  if (reasons.length > 0) {
    return {
      action: "REQUIRE_APPROVAL",
      reason_codes: reasons,
      policy,
    };
  }

  if (
    input.risk_gate.decision !== "CONTINUE" ||
    input.risk_gate.recommended_action !== "ALLOW"
  ) {
    return {
      action: "REQUIRE_APPROVAL",
      reason_codes: ["risk_gate_not_explicitly_allowing_auto_path"],
      policy,
    };
  }

  return {
    action: "AUTO_EXECUTE",
    reason_codes: ["risk_gate_allow_and_amount_within_auto_limit"],
    policy,
  };
}

export function tameionApprovalMessage(input: {
  audit_id: string;
  recipient: string;
  amount_usdc: string;
  expires_at: string;
}) {
  return [
    "Geomacro Tameion human approval",
    `Decision: ${input.audit_id}`,
    `Recipient: ${input.recipient.toLowerCase()}`,
    `Amount: ${input.amount_usdc} USDC`,
    `Network: Arc Testnet (5042002)`,
    `Expires: ${input.expires_at}`,
    "I approve only this exact testnet payment intent.",
  ].join("\n");
}
