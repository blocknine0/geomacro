import { createHmac } from "node:crypto";
import { getAppSupabase } from "./supabase-app.server";

export type AgentRequestContext = {
  requestId: string | null;
  externalAgentId: string | null;
  /** Existing request with a settled payment; delivery may be retried without charging again. */
  paymentSettled: boolean;
  /** Existing request was already successfully delivered after settlement. */
  delivered: boolean;
};

function hashIdentity(value: string): string | null {
  const secret = process.env.AGENT_IDENTITY_SECRET;
  if (!secret || !value) return null;
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** Stable, keyed identity. Raw IP and auth/payment headers are never persisted. */
export function deriveExternalAgentId(request: Request, ip: string | null): string | null {
  const supplied = request.headers.get("x-agent-id")?.trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 240) ?? "unknown";
  return hashIdentity(supplied ? `agent:${supplied}` : `ua:${userAgent}|ip:${ip ?? "unknown"}`);
}

/**
 * Starts or resumes an idempotent request.
 *
 * Security property: reuse of an Idempotency-Key NEVER grants intelligence merely
 * because a request row already exists. Only a row with payment_id is entitled to
 * skip settlement, and only status=delivered is a completed idempotent replay.
 */
export async function startAgentRequest(input: {
  capability: string;
  eventId: string | null;
  idempotencyKey: string | null;
  externalAgentId: string | null;
}): Promise<AgentRequestContext> {
  const supabase = getAppSupabase();
  if (!supabase) {
    return {
      requestId: null,
      externalAgentId: input.externalAgentId,
      paymentSettled: false,
      delivered: false,
    };
  }

  if (input.idempotencyKey && input.externalAgentId) {
    const existing = await supabase
      .from("agent_api_requests")
      .select("id,status,payment_id")
      .eq("external_agent_id", input.externalAgentId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (!existing.error && existing.data) {
      const paymentSettled = Boolean(existing.data.payment_id);
      return {
        requestId: String(existing.data.id),
        externalAgentId: input.externalAgentId,
        paymentSettled,
        delivered: paymentSettled && existing.data.status === "delivered",
      };
    }
  }

  const inserted = await supabase
    .from("agent_api_requests")
    .insert({
      capability: input.capability,
      event_id: input.eventId,
      idempotency_key: input.idempotencyKey,
      external_agent_id: input.externalAgentId,
      status: "started",
    })
    .select("id")
    .maybeSingle();

  if (inserted.error) {
    console.error("[agent-telemetry] request write failed", inserted.error.message);
    return {
      requestId: null,
      externalAgentId: input.externalAgentId,
      paymentSettled: false,
      delivered: false,
    };
  }

  return {
    requestId: inserted.data?.id ? String(inserted.data.id) : null,
    externalAgentId: input.externalAgentId,
    paymentSettled: false,
    delivered: false,
  };
}

export async function finishAgentRequest(input: {
  requestId: string | null;
  status: "payment_required" | "payment_failed" | "delivered" | "delivery_failed" | "not_found";
  httpStatus: number;
  paymentId?: string | null;
  responseCode?: string | null;
}) {
  if (!input.requestId) return;
  const supabase = getAppSupabase();
  if (!supabase) return;

  const update: Record<string, unknown> = {
    status: input.status,
    http_status: input.httpStatus,
    response_code: input.responseCode ?? null,
    completed_at: new Date().toISOString(),
  };
  // Never erase an already-linked settlement during a delivery retry.
  if (input.paymentId !== undefined) update.payment_id = input.paymentId;

  const { error } = await supabase
    .from("agent_api_requests")
    .update(update)
    .eq("id", input.requestId);

  if (error) console.error("[agent-telemetry] request update failed", error.message);
}

export async function recordAgentPayment(input: {
  requestId: string | null;
  requirement: { amount: string; asset: string; network: string; rail: string };
  status: "settled" | "failed";
  providerReference: string | null;
}) {
  const supabase = getAppSupabase();
  if (!supabase || !input.requestId) return null;

  const { data, error } = await supabase
    .from("agent_payments")
    .insert({
      request_id: input.requestId,
      provider: "x402",
      status: input.status,
      amount: input.requirement.amount,
      asset: input.requirement.asset,
      network: input.requirement.network,
      rail: input.requirement.rail,
      provider_reference: input.providerReference,
      settled_at: input.status === "settled" ? new Date().toISOString() : null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[agent-telemetry] payment write failed", error.message);
    return null;
  }
  return data?.id ? String(data.id) : null;
}
