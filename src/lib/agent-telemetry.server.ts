import { createHmac } from "node:crypto";
import { getAppSupabase } from "./supabase-app.server";

export type AgentRequestContext = {
  requestId: string | null;
  externalAgentId: string | null;
  /**
   * Legacy telemetry only. This MUST NOT authorize GOAT paid delivery.
   * GOAT entitlement is determined exclusively by getGoatRequestEntitlement().
   */
  paymentSettled: boolean;
  /** Existing legacy delivery marker. Not sufficient for GOAT entitlement. */
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
      // payment_id belongs to the legacy x402 telemetry path.
      // Never convert it into GOAT entitlement here.
      return {
        requestId: String(existing.data.id),
        externalAgentId: input.externalAgentId,
        paymentSettled: false,
        delivered: false,
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

  // A successful external settlement must always have a durable provider
  // identity. Never create an entitlement from an anonymous settlement.
  if (input.status === "settled" && !input.providerReference) {
    console.error(
      "[agent-telemetry] refusing settled payment without provider reference",
    );
    return null;
  }

  const row = {
    request_id: input.requestId,
    provider: "x402",
    status: input.status,
    amount: input.requirement.amount,
    asset: input.requirement.asset,
    network: input.requirement.network,
    rail: input.requirement.rail,
    provider_reference: input.providerReference,
    settled_at:
      input.status === "settled" ? new Date().toISOString() : null,
  };

  const inserted = await supabase
    .from("agent_payments")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (!inserted.error) {
    return inserted.data?.id ? String(inserted.data.id) : null;
  }

  // PostgreSQL unique_violation. Another retry/concurrent request may already
  // have recorded this exact provider settlement.
  if (
    inserted.error.code === "23505" &&
    input.providerReference
  ) {
    const existing = await supabase
      .from("agent_payments")
      .select("id,request_id,status")
      .eq("provider", "x402")
      .eq("provider_reference", input.providerReference)
      .maybeSingle();

    if (
      !existing.error &&
      existing.data &&
      existing.data.status === "settled" &&
      String(existing.data.request_id) === input.requestId
    ) {
      return String(existing.data.id);
    }

    // Same external settlement bound to another request is never reusable.
    console.error(
      "[agent-telemetry] provider settlement identity collision",
    );
    return null;
  }

  console.error(
    "[agent-telemetry] payment write failed",
    inserted.error.message,
  );
  return null;
}

/**
 * Authoritative GOAT entitlement lookup.
 *
 * A legacy payment_id alone is not sufficient to prove a GOAT entitlement.
 * Paid delivery is authorized only when the request is bound to a GOAT order
 * that reached a terminal paid state and has an immutable transaction hash.
 */
export async function getGoatRequestEntitlement(
  requestId: string | null,
): Promise<{
  settled: boolean;
  goatOrderId: string | null;
  txHash: string | null;
}> {
  if (!requestId) {
    return { settled: false, goatOrderId: null, txHash: null };
  }

  const supabase = getAppSupabase();
  if (!supabase) {
    return { settled: false, goatOrderId: null, txHash: null };
  }

  const { data, error } = await supabase
    .from("agent_goat_orders")
    .select("goat_order_id,order_status,tx_hash")
    .eq("request_id", requestId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error(
        "[agent-telemetry] GOAT entitlement read failed",
        error.message,
      );
    }

    return { settled: false, goatOrderId: null, txHash: null };
  }

  const paid =
    (data.order_status === "PAYMENT_CONFIRMED" ||
      data.order_status === "INVOICED") &&
    typeof data.tx_hash === "string" &&
    data.tx_hash.length > 0;

  return {
    settled: paid,
    goatOrderId: paid ? String(data.goat_order_id) : null,
    txHash: paid ? String(data.tx_hash) : null,
  };
}

/**
 * Returns the durable GOAT order already bound to this request.
 * This is used before creating an order so an idempotent retry cannot
 * accidentally create a second chargeable order.
 */
export async function getGoatOrderForRequest(
  requestId: string | null,
): Promise<{
  goatOrderId: string;
  dappOrderId: string;
  payerAddress: string;
  amountWei: string;
  orderStatus: string;
  txHash: string | null;
} | null> {
  if (!requestId) return null;

  const supabase = getAppSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("agent_goat_orders")
    .select(
      "goat_order_id,dapp_order_id,payer_address,amount_wei,order_status,tx_hash",
    )
    .eq("request_id", requestId)
    .maybeSingle();

  if (error) {
    console.error(
      "[agent-telemetry] GOAT order lookup failed",
      error.message,
    );
    return null;
  }

  if (!data) return null;

  return {
    goatOrderId: String(data.goat_order_id),
    dappOrderId: String(data.dapp_order_id),
    payerAddress: String(data.payer_address),
    amountWei: String(data.amount_wei),
    orderStatus: String(data.order_status),
    txHash: data.tx_hash ? String(data.tx_hash) : null,
  };
}
