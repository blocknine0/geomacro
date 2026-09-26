import { createHash, randomUUID } from "node:crypto";
import { verifyMessage } from "ethers";
import { ARC_TESTNET, getArcReadProvider } from "./arc";
import { demoPolicyFromPreset } from "./agentic-demo-contract";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import {
  TAMEION_AGENT_VERSION,
  TAMEION_DECISION_TTL_SECONDS,
  amountUsdcToAtomic,
  decideTameionAction,
  tameionApprovalMessage,
  tameionApprovalRequestSchema,
  tameionConfirmRequestSchema,
  tameionDecisionRequestSchema,
  type TameionApprovalRequest,
  type TameionConfirmRequest,
  type TameionDecisionRequest,
} from "./tameion-agent-contract";

const TABLE = "tameion_agent_decisions" as const;

type DecisionRow = {
  id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  client_request_id: string | null;
  subject: TameionDecisionRequest["subject"];
  action_type: TameionDecisionRequest["action_type"];
  policy_preset: TameionDecisionRequest["policy_preset"];
  risk_object_id: string;
  risk_score: number | string;
  risk_gate_decision: "CONTINUE" | "REDUCE_LIMIT" | "REQUIRE_APPROVAL" | "PAUSE";
  risk_gate_recommended_action: "ALLOW" | "REDUCE_EXPOSURE" | "REQUIRE_HUMAN_APPROVAL" | "BLOCK";
  risk_gate_execution_authorized: false;
  agent_action: "AUTO_EXECUTE" | "REQUIRE_APPROVAL" | "BLOCK";
  decision_reason_codes: string[];
  status:
    | "AUTO_EXECUTE_READY"
    | "AWAITING_APPROVAL"
    | "HUMAN_APPROVED"
    | "BLOCKED"
    | "EXECUTED"
    | "EXPIRED";
  amount_usdc: number | string;
  amount_atomic: number | string;
  recipient_address: string;
  approval_message: string | null;
  approved_at: string | null;
  approver_reference_hash: string | null;
  tx_hash: string | null;
  payer_reference_hash: string | null;
  block_number: number | string | null;
  confirmed_at: string | null;
  audit_snapshot: Record<string, unknown>;
};

function hashAddress(value: string) {
  return createHash("sha256")
    .update(value.trim().toLowerCase(), "utf8")
    .digest("hex");
}

function expiresAtFromNow(now = new Date()) {
  return new Date(now.getTime() + TAMEION_DECISION_TTL_SECONDS * 1000).toISOString();
}

function assertNotExpired(row: DecisionRow) {
  if (Date.now() >= new Date(row.expires_at).getTime()) {
    throw new Error("TAMEION_DECISION_EXPIRED");
  }
}

async function loadDecision(auditId: string): Promise<DecisionRow> {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("id", auditId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("TAMEION_DECISION_NOT_FOUND");
  return data as DecisionRow;
}

async function markExpired(row: DecisionRow) {
  if (["EXECUTED", "BLOCKED", "EXPIRED"].includes(row.status)) return;
  const db = requireRiskSupabase();
  await db
    .from(TABLE)
    .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .in("status", ["AUTO_EXECUTE_READY", "AWAITING_APPROVAL", "HUMAN_APPROVED"]);
}

function subjectKey(subject: TameionDecisionRequest["subject"]) {
  return subject.type === "country"
    ? subject.country_iso3
    : `${subject.origin_country_iso3}>${subject.destination_country_iso3}`;
}

export async function createTameionDecision(raw: unknown) {
  const input = tameionDecisionRequestSchema.parse(raw);
  const auditId = randomUUID();
  const expiresAt = expiresAtFromNow();
  const riskPolicy = demoPolicyFromPreset(input.policy_preset);
  const amountNumber = Number(input.amount_usdc);
  const actionContext = {
    action_type: input.action_type,
    amount: amountNumber,
    currency: "USDC",
    destination: input.recipient.toLowerCase(),
    metadata: {
      workflow: TAMEION_AGENT_VERSION,
      network: "arc-testnet",
    },
  };

  const riskResult =
    input.subject.type === "corridor"
      ? await evaluateCorridorRiskGate({
          request_id: auditId,
          origin_country_iso3: input.subject.origin_country_iso3,
          destination_country_iso3: input.subject.destination_country_iso3,
          action_context: actionContext,
          policy: riskPolicy,
          risk_object_profile: "CANONICAL",
        })
      : await evaluateCountryRiskGate({
          request_id: auditId,
          country_iso3: input.subject.country_iso3,
          action_context: actionContext,
          policy: riskPolicy,
          risk_object_profile: "CANONICAL",
        });

  const gate = riskResult.response;
  if (gate.execution_authorized !== false) {
    throw new Error("RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
  }

  const businessDecision = decideTameionAction({
    preset: input.policy_preset,
    amount_usdc: input.amount_usdc,
    risk_gate: gate,
  });
  const amountAtomic = amountUsdcToAtomic(input.amount_usdc);
  const recipient = input.recipient.toLowerCase();
  const approvalMessage =
    businessDecision.action === "REQUIRE_APPROVAL"
      ? tameionApprovalMessage({
          audit_id: auditId,
          recipient,
          amount_usdc: input.amount_usdc,
          expires_at: expiresAt,
        })
      : null;
  const status =
    businessDecision.action === "AUTO_EXECUTE"
      ? "AUTO_EXECUTE_READY"
      : businessDecision.action === "REQUIRE_APPROVAL"
        ? "AWAITING_APPROVAL"
        : "BLOCKED";

  const auditSnapshot = {
    version: TAMEION_AGENT_VERSION,
    subject: input.subject,
    subject_key: subjectKey(input.subject),
    action_type: input.action_type,
    amount_usdc: input.amount_usdc,
    amount_atomic: amountAtomic,
    recipient,
    policy_preset: input.policy_preset,
    business_policy: businessDecision.policy,
    agent_action: businessDecision.action,
    decision_reason_codes: businessDecision.reason_codes,
    risk_gate: {
      decision: gate.decision,
      recommended_action: gate.recommended_action,
      reason_codes: gate.reason_codes,
      risk: gate.risk,
      top_drivers: gate.top_drivers,
      execution_authorized: false,
    },
    network: {
      name: ARC_TESTNET.chainName,
      chain_id: ARC_TESTNET.chainIdDec,
      chain_id_hex: ARC_TESTNET.chainIdHex,
    },
  };

  const db = requireRiskSupabase();
  const { data, error } = await db
    .from(TABLE)
    .insert({
      id: auditId,
      expires_at: expiresAt,
      client_request_id: input.client_request_id ?? null,
      subject: input.subject,
      action_type: input.action_type,
      policy_preset: input.policy_preset,
      risk_object_id: gate.risk.object_id,
      risk_score: gate.risk.score,
      risk_gate_decision: gate.decision,
      risk_gate_recommended_action: gate.recommended_action,
      risk_gate_execution_authorized: false,
      agent_action: businessDecision.action,
      decision_reason_codes: businessDecision.reason_codes,
      status,
      amount_usdc: input.amount_usdc,
      amount_atomic: amountAtomic,
      recipient_address: recipient,
      approval_message: approvalMessage,
      audit_snapshot: auditSnapshot,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("TAMEION_AUDIT_PERSIST_FAILED");
  }

  return {
    ok: true as const,
    version: TAMEION_AGENT_VERSION,
    audit_id: auditId,
    expires_at: expiresAt,
    status,
    subject: input.subject,
    action_context: {
      action_type: input.action_type,
      amount_usdc: input.amount_usdc,
      recipient,
    },
    risk_gate: gate,
    agent_decision: businessDecision,
    human_approval: {
      required: businessDecision.action === "REQUIRE_APPROVAL",
      message: approvalMessage,
    },
    payment_intent:
      businessDecision.action === "BLOCK"
        ? null
        : {
            network: ARC_TESTNET.chainName,
            chain_id: ARC_TESTNET.chainIdDec,
            chain_id_hex: ARC_TESTNET.chainIdHex,
            currency: "USDC" as const,
            native_asset: true as const,
            recipient,
            amount_usdc: input.amount_usdc,
            amount_atomic: amountAtomic,
            explorer: ARC_TESTNET.explorer,
          },
    boundaries: {
      risk_gate_execution_authorized: false as const,
      testnet_only: true as const,
      custody: false as const,
      wallet_private_key_storage: false as const,
    },
  };
}

export async function approveTameionDecision(raw: unknown) {
  const input: TameionApprovalRequest = tameionApprovalRequestSchema.parse(raw);
  const row = await loadDecision(input.audit_id);

  if (row.status === "HUMAN_APPROVED") {
    return {
      ok: true as const,
      audit_id: row.id,
      status: row.status,
      idempotent_replay: true as const,
    };
  }
  if (row.status !== "AWAITING_APPROVAL" || !row.approval_message) {
    throw new Error("TAMEION_APPROVAL_NOT_ALLOWED");
  }

  try {
    assertNotExpired(row);
  } catch (error) {
    await markExpired(row);
    throw error;
  }

  let recovered: string;
  try {
    recovered = verifyMessage(row.approval_message, input.signature);
  } catch {
    throw new Error("TAMEION_APPROVAL_SIGNATURE_INVALID");
  }

  if (recovered.toLowerCase() !== input.approver_address.toLowerCase()) {
    throw new Error("TAMEION_APPROVAL_SIGNER_MISMATCH");
  }

  const now = new Date().toISOString();
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from(TABLE)
    .update({
      status: "HUMAN_APPROVED",
      approved_at: now,
      approver_reference_hash: hashAddress(recovered),
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("status", "AWAITING_APPROVAL")
    .select("id,status,approved_at")
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error("TAMEION_APPROVAL_RACE");
  }

  return {
    ok: true as const,
    audit_id: row.id,
    status: "HUMAN_APPROVED" as const,
    approved_at: now,
    idempotent_replay: false as const,
  };
}

export async function confirmTameionPayment(raw: unknown) {
  const input: TameionConfirmRequest = tameionConfirmRequestSchema.parse(raw);
  const row = await loadDecision(input.audit_id);

  if (row.status === "EXECUTED") {
    if (row.tx_hash?.toLowerCase() !== input.tx_hash.toLowerCase()) {
      throw new Error("TAMEION_ALREADY_EXECUTED_WITH_DIFFERENT_TX");
    }
    return {
      ok: true as const,
      audit_id: row.id,
      status: row.status,
      tx_hash: row.tx_hash,
      block_number: row.block_number,
      explorer_url: `${ARC_TESTNET.explorer}/tx/${row.tx_hash}`,
      idempotent_replay: true as const,
    };
  }

  if (!["AUTO_EXECUTE_READY", "HUMAN_APPROVED"].includes(row.status)) {
    throw new Error(
      row.status === "AWAITING_APPROVAL"
        ? "TAMEION_HUMAN_APPROVAL_REQUIRED"
        : "TAMEION_PAYMENT_CONFIRM_NOT_ALLOWED",
    );
  }

  try {
    assertNotExpired(row);
  } catch (error) {
    await markExpired(row);
    throw error;
  }

  const provider = getArcReadProvider(ARC_TESTNET);
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(input.tx_hash),
    provider.getTransactionReceipt(input.tx_hash),
  ]);

  if (!tx || !receipt) {
    throw new Error("TAMEION_ARC_TRANSACTION_PENDING_OR_NOT_FOUND");
  }
  if (receipt.status !== 1) {
    throw new Error("TAMEION_ARC_TRANSACTION_REVERTED");
  }
  if (!tx.to || tx.to.toLowerCase() !== row.recipient_address.toLowerCase()) {
    throw new Error("TAMEION_PAYMENT_RECIPIENT_MISMATCH");
  }
  if (tx.value.toString() !== String(row.amount_atomic)) {
    throw new Error("TAMEION_PAYMENT_AMOUNT_MISMATCH");
  }
  if (receipt.to && receipt.to.toLowerCase() !== row.recipient_address.toLowerCase()) {
    throw new Error("TAMEION_RECEIPT_RECIPIENT_MISMATCH");
  }

  const now = new Date().toISOString();
  const txHash = input.tx_hash.toLowerCase();
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from(TABLE)
    .update({
      status: "EXECUTED",
      tx_hash: txHash,
      payer_reference_hash: hashAddress(tx.from),
      block_number: receipt.blockNumber,
      confirmed_at: now,
      updated_at: now,
    })
    .eq("id", row.id)
    .in("status", ["AUTO_EXECUTE_READY", "HUMAN_APPROVED"])
    .select("id,status,tx_hash,block_number,confirmed_at")
    .maybeSingle();

  if (error || !data) {
    throw error ?? new Error("TAMEION_CONFIRM_RACE_OR_TX_REUSE");
  }

  return {
    ok: true as const,
    audit_id: row.id,
    status: "EXECUTED" as const,
    tx_hash: txHash,
    block_number: receipt.blockNumber,
    confirmed_at: now,
    explorer_url: `${ARC_TESTNET.explorer}/tx/${txHash}`,
    idempotent_replay: false as const,
    boundaries: {
      risk_gate_execution_authorized: false as const,
      transaction_verified_on_arc_testnet: true as const,
    },
  };
}
