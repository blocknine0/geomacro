import type { CircleX402Settlement } from "./circle-x402.server";
import type { VerifiedA2AIdentity } from "./a2a-signature.server";
import { A2AProtocolError } from "./a2a-signature.server";
import { recordA2AAudit } from "./a2a-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";

export function persistedA2AX402Settlement(value: unknown): CircleX402Settlement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.settled !== true) return null;
  if (String(row.network ?? "") !== "eip155:5042002") return null;
  if (String(row.amount_atomic ?? "") !== "1000") return null;
  if (String(row.amount_usdc ?? "") !== "0.001") return null;

  return {
    payer: row.payer ? String(row.payer) : null,
    settlement_reference: row.settlement_reference
      ? String(row.settlement_reference)
      : null,
    amount_atomic: "1000",
    amount_usdc: "0.001",
    network: "eip155:5042002",
  };
}

export async function persistA2AX402Settlement(input: {
  taskId: string;
  identity: VerifiedA2AIdentity;
  settlement: CircleX402Settlement;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const paymentJson = {
    settled: true,
    provider: "circle_gateway_x402",
    payer: input.settlement.payer,
    settlement_reference: input.settlement.settlement_reference,
    amount_atomic: input.settlement.amount_atomic,
    amount_usdc: input.settlement.amount_usdc,
    network: input.settlement.network,
    settled_at: now,
    technical_proof_only: true,
  };

  const result = await db
    .from("a2a_tasks")
    .update({
      payment_reference: input.settlement.settlement_reference,
      payment_json: paymentJson,
      updated_at: now,
    })
    .eq("id", input.taskId)
    .eq("agent_identity_id", input.identity.id)
    .eq("principal_id", input.identity.principal_id);

  if (result.error) {
    throw new A2AProtocolError(
      503,
      "A2A_PAYMENT_STATE_UNAVAILABLE",
      "A2A x402 settlement state could not be persisted.",
    );
  }

  await recordA2AAudit({
    taskId: input.taskId,
    principalId: input.identity.principal_id,
    identityId: input.identity.id,
    eventType: "payment.x402_settled",
    details: {
      provider: "circle_gateway_x402",
      network: input.settlement.network,
      amount_atomic: input.settlement.amount_atomic,
      technical_proof_only: true,
    },
  });

  return paymentJson;
}
