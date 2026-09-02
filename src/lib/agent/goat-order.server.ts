import type {
  GoatFlowClient,
  Order,
  OrderProof,
  OrderProofResponse,
} from "goatflow-sdk-server";
import { getAppSupabase } from "@/lib/supabase-app.server";
import { getGoatFlowClient, getGoatFlowRuntimeConfig } from "./goat-flow.server";

export type GoatOrderIntent = {
  requestId: string;
  dappOrderId: string;
  payerAddress: string;
  amountWei: string;
};

export type GoatOrderValidation = {
  ok: boolean;
  reason?: string;
};

function normalizeAddress(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function isSuccessStatus(status: string): boolean {
  return status === "PAYMENT_CONFIRMED" || status === "INVOICED";
}

export function validateCreatedOrder(
  order: Order,
  intent: GoatOrderIntent,
): GoatOrderValidation {
  const config = getGoatFlowRuntimeConfig();

  if (
    !config.configured ||
    !config.chainId ||
    !config.tokenSymbol ||
    !config.receiveAddress
  ) {
    return { ok: false, reason: "GOAT_NOT_CONFIGURED" };
  }

  if (
    normalizeAddress(order.payToAddress) !==
    normalizeAddress(config.receiveAddress)
  ) {
    return { ok: false, reason: "RECIPIENT_MISMATCH" };
  }

  if (order.fromChainId !== config.chainId) {
    return { ok: false, reason: "CHAIN_MISMATCH" };
  }

  if (order.tokenSymbol.toUpperCase() !== config.tokenSymbol.toUpperCase()) {
    return { ok: false, reason: "TOKEN_MISMATCH" };
  }

  if (config.tokenContract) {
    if (normalizeAddress(order.tokenContract) !== normalizeAddress(config.tokenContract)) {
      return { ok: false, reason: "TOKEN_CONTRACT_MISMATCH" };
    }
  }

  if (order.amountWei !== intent.amountWei) {
    return { ok: false, reason: "AMOUNT_MISMATCH" };
  }

  return { ok: true };
}

export function validateConfirmedOrder(
  proof: OrderProof,
  proofRecord: OrderProofResponse,
  intent: GoatOrderIntent,
): GoatOrderValidation {
  const config = getGoatFlowRuntimeConfig();

  if (
    !config.configured ||
    !config.chainId ||
    !config.tokenSymbol ||
    !config.receiveAddress
  ) {
    return { ok: false, reason: "GOAT_NOT_CONFIGURED" };
  }

  if (!isSuccessStatus(proof.status)) {
    return { ok: false, reason: "NOT_CONFIRMED" };
  }

  if (proof.dappOrderId !== intent.dappOrderId) {
    return { ok: false, reason: "DAPP_ORDER_MISMATCH" };
  }

  if (proof.chainId !== config.chainId) {
    return { ok: false, reason: "CHAIN_MISMATCH" };
  }

  if (proof.tokenSymbol.toUpperCase() !== config.tokenSymbol.toUpperCase()) {
    return { ok: false, reason: "TOKEN_MISMATCH" };
  }

  if (config.tokenContract) {
    if (normalizeAddress(proof.tokenContract) !== normalizeAddress(config.tokenContract)) {
      return { ok: false, reason: "TOKEN_CONTRACT_MISMATCH" };
    }
  }

  if (normalizeAddress(proof.fromAddress) !== normalizeAddress(intent.payerAddress)) {
    return { ok: false, reason: "PAYER_MISMATCH" };
  }

  if (proof.amountWei !== intent.amountWei) {
    return { ok: false, reason: "AMOUNT_MISMATCH" };
  }

  if (!proof.txHash) {
    return { ok: false, reason: "MISSING_TX_HASH" };
  }

  if (proofRecord.payload.order_id !== proof.orderId) {
    return { ok: false, reason: "PROOF_ORDER_MISMATCH" };
  }

  if (
    normalizeAddress(proofRecord.payload.from_addr) !==
    normalizeAddress(intent.payerAddress)
  ) {
    return { ok: false, reason: "PROOF_PAYER_MISMATCH" };
  }

  if (
    normalizeAddress(proofRecord.payload.to_addr) !==
    normalizeAddress(config.receiveAddress)
  ) {
    return { ok: false, reason: "PROOF_RECIPIENT_MISMATCH" };
  }

  if (proofRecord.payload.amount_wei !== intent.amountWei) {
    return { ok: false, reason: "PROOF_AMOUNT_MISMATCH" };
  }

  if (
    !isSuccessStatus(proofRecord.payload.status) ||
    proofRecord.payload.status !== proof.status
  ) {
    return { ok: false, reason: "PROOF_STATUS_MISMATCH" };
  }

  if (proofRecord.payload.from_chain_id !== config.chainId) {
    return { ok: false, reason: "PROOF_CHAIN_MISMATCH" };
  }

  if (
    normalizeAddress(proofRecord.payload.tx_hash) !==
    normalizeAddress(proof.txHash)
  ) {
    return { ok: false, reason: "PROOF_TX_MISMATCH" };
  }

  return { ok: true };
}

export async function createGoatOrder(
  intent: GoatOrderIntent,
  client: GoatFlowClient | null = getGoatFlowClient(),
): Promise<Order | null> {
  const config = getGoatFlowRuntimeConfig();

  if (
    !client ||
    !config.configured ||
    !config.chainId ||
    !config.tokenSymbol
  ) {
    return null;
  }

  const order = await client.createOrder({
    dappOrderId: intent.dappOrderId,
    chainId: config.chainId,
    tokenSymbol: config.tokenSymbol,
    ...(config.tokenContract ? { tokenContract: config.tokenContract } : {}),
    fromAddress: intent.payerAddress,
    amountWei: intent.amountWei,
  });

  const validation = validateCreatedOrder(order, intent);
  if (!validation.ok) {
    throw new Error(`GOAT order validation failed: ${validation.reason}`);
  }

  return order;
}

export async function persistGoatOrder(input: {
  requestId: string;
  dappOrderId: string;
  payerAddress: string;
  order: Order;
}): Promise<void> {
  const supabase = getAppSupabase();
  if (!supabase) return;

  const { error } = await supabase
    .from("agent_goat_orders")
    .upsert(
      {
        request_id: input.requestId,
        goat_order_id: input.order.orderId,
        dapp_order_id: input.dappOrderId,
        payer_address: input.payerAddress,
        source_chain_id: input.order.fromChainId,
        token_symbol: input.order.tokenSymbol,
        token_contract: input.order.tokenContract || null,
        amount_wei: input.order.amountWei,
        pay_to_address: input.order.payToAddress || null,
        order_status: "CHECKOUT_VERIFIED",
        payment_flow: input.order.flow,
        expires_at: new Date(input.order.expiresAt * 1000).toISOString(),
      },
      { onConflict: "request_id" },
    );

  if (error) {
    throw new Error(`GOAT order persistence failed: ${error.message}`);
  }
}

export async function verifyGoatOrderSettlement(
  orderId: string,
  intent: GoatOrderIntent,
  client: GoatFlowClient | null = getGoatFlowClient(),
): Promise<{
  settled: boolean;
  proof?: OrderProof;
  proofRecord?: OrderProofResponse;
}> {
  if (!client) return { settled: false };

  const proof = await client.getOrderStatus(orderId);

  if (!isSuccessStatus(proof.status)) {
    return { settled: false, proof };
  }

  const proofRecord = await client.getOrderProof(orderId);
  const validation = validateConfirmedOrder(proof, proofRecord, intent);

  if (!validation.ok) {
    throw new Error(`GOAT settlement validation failed: ${validation.reason}`);
  }

  return { settled: true, proof, proofRecord };
}

export async function persistConfirmedGoatSettlement(input: {
  requestId: string;
  proof: OrderProof;
}): Promise<void> {
  if (
    !isSuccessStatus(input.proof.status) ||
    !input.proof.txHash
  ) {
    throw new Error("Cannot persist an unconfirmed GOAT settlement");
  }

  const supabase = getAppSupabase();
  if (!supabase) {
    throw new Error("GOAT settlement store unavailable");
  }

  const { data, error } = await supabase
    .from("agent_goat_orders")
    .update({
      order_status: input.proof.status,
      tx_hash: input.proof.txHash,
      confirmed_at:
        input.proof.confirmedAt ?? new Date().toISOString(),
    })
    .eq("request_id", input.requestId)
    .eq("goat_order_id", input.proof.orderId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `GOAT settlement persistence failed: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      "GOAT settlement persistence failed: order binding not found",
    );
  }
}

export type GoatOrderCreationClaim = {
  acquired: boolean;
  claimToken: string;
};

export async function claimGoatOrderCreation(input: {
  requestId: string;
  dappOrderId: string;
}): Promise<GoatOrderCreationClaim> {
  const supabase = getAppSupabase();

  if (!supabase) {
    return {
      acquired: false,
      claimToken: "",
    };
  }

  const claimToken = crypto.randomUUID();

  const { data, error } = await supabase.rpc(
    "claim_agent_goat_order_creation",
    {
      p_request_id: input.requestId,
      p_dapp_order_id: input.dappOrderId,
      p_claim_token: claimToken,
      p_lease_seconds: 45,
    },
  );

  if (error) {
    console.error(
      "[goat-order] creation claim failed",
      error.message,
    );

    return {
      acquired: false,
      claimToken: "",
    };
  }

  return {
    acquired: data === true,
    claimToken,
  };
}

export async function releaseGoatOrderCreation(input: {
  requestId: string;
  claimToken: string;
}): Promise<boolean> {
  if (!input.claimToken) return false;

  const supabase = getAppSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc(
    "release_agent_goat_order_creation",
    {
      p_request_id: input.requestId,
      p_claim_token: input.claimToken,
    },
  );

  if (error) {
    console.error(
      "[goat-order] creation claim release failed",
      error.message,
    );
    return false;
  }

  return data === true;
}

export async function markGoatOrderCreationAttempted(input: {
  requestId: string;
  claimToken: string;
}): Promise<boolean> {
  if (!input.claimToken) return false;

  const supabase = getAppSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc(
    "mark_agent_goat_order_creation_attempted",
    {
      p_request_id: input.requestId,
      p_claim_token: input.claimToken,
    },
  );

  if (error) {
    console.error(
      "[goat-order] provider creation-attempt mark failed",
      error.message,
    );
    return false;
  }

  return data === true;
}
