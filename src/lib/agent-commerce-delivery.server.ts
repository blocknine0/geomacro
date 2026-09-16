import { createHash } from "node:crypto";
import { requireRiskSupabase } from "./risk-supabase.server";

export type AgentCommerceProvider = "coinbase_x402" | "goat_x402" | "nevermined" | (string & {});

export type AgentCommerceDeliveryClaim = {
  disposition: "CLAIMED" | "REPLAY" | "IN_PROGRESS" | "CONFLICT" | "MANUAL_REVIEW";
  claim_token: string | null;
  response_payload: unknown | null;
  response_sha256: string | null;
  settlement_reference: string | null;
  settlement_network: string | null;
};

export function commerceSha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableCommerceJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableCommerceJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableCommerceJson(object[key])}`)
    .join(",")}}`;
}

export function commerceFingerprint(value: unknown) {
  return commerceSha256(stableCommerceJson(value));
}

export function commerceReferenceHash(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized ? commerceSha256(normalized) : null;
}

function normalizeBounded(value: string | null | undefined, max: number) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new Error("AGENT_COMMERCE_REFERENCE_TOO_LONG");
  return normalized;
}

export async function claimAgentCommerceDelivery(input: {
  provider: AgentCommerceProvider;
  providerEnvironment: string;
  paymentFingerprint: string;
  requestFingerprint: string;
  productId: string;
  clientRequestId?: string | null;
  sourceChannel?: string | null;
  rail?: string | null;
  network?: string | null;
  asset?: string | null;
  amountAtomic?: string | number | bigint | null;
  recipientReference?: string | null;
}) {
  const db = requireRiskSupabase();
  const amount = input.amountAtomic == null ? null : String(input.amountAtomic);
  const { data, error } = await db.rpc("claim_agent_commerce_delivery", {
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_payment_fingerprint: input.paymentFingerprint,
    p_request_fingerprint: input.requestFingerprint,
    p_product_id: input.productId,
    p_client_request_id: normalizeBounded(input.clientRequestId, 128),
    p_source_channel: normalizeBounded(input.sourceChannel, 96),
    p_rail: normalizeBounded(input.rail, 96),
    p_network: normalizeBounded(input.network, 128),
    p_asset: normalizeBounded(input.asset, 128),
    p_amount_atomic: amount,
    p_recipient_hash: commerceReferenceHash(input.recipientReference),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("AGENT_COMMERCE_DELIVERY_CLAIM_EMPTY");
  return row as AgentCommerceDeliveryClaim;
}

export async function prepareAgentCommerceDelivery(input: {
  provider: AgentCommerceProvider;
  providerEnvironment: string;
  paymentFingerprint: string;
  claimToken: string;
  responsePayload: unknown;
}) {
  const db = requireRiskSupabase();
  const responseSha256 = commerceFingerprint(input.responsePayload);
  const { data, error } = await db.rpc("prepare_agent_commerce_delivery", {
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_response_payload: input.responsePayload,
    p_response_sha256: responseSha256,
  });
  if (error) throw error;
  if (data !== true) throw new Error("AGENT_COMMERCE_DELIVERY_PREPARE_LOST_CLAIM");
  return { responseSha256 };
}

export async function completeAgentCommerceDelivery(input: {
  provider: AgentCommerceProvider;
  providerEnvironment: string;
  paymentFingerprint: string;
  claimToken: string;
  payerReference?: string | null;
  settlementReference: string;
  settlementNetwork?: string | null;
}) {
  const db = requireRiskSupabase();
  const settlementReference = normalizeBounded(input.settlementReference, 256);
  if (!settlementReference) throw new Error("AGENT_COMMERCE_SETTLEMENT_REFERENCE_REQUIRED");
  const { data, error } = await db.rpc("complete_agent_commerce_delivery", {
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_payer_hash: commerceReferenceHash(input.payerReference),
    p_settlement_reference: settlementReference,
    p_settlement_network: normalizeBounded(input.settlementNetwork, 128),
  });
  if (error) throw error;
  if (data !== true) throw new Error("AGENT_COMMERCE_DELIVERY_COMPLETE_LOST_CLAIM");
}

export async function releaseAgentCommerceDelivery(input: {
  provider: AgentCommerceProvider;
  providerEnvironment: string;
  paymentFingerprint: string;
  claimToken: string;
  failureCode: string;
  manualReview?: boolean;
}) {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("release_agent_commerce_delivery", {
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_failure_code: String(input.failureCode || "UNKNOWN").slice(0, 160),
    p_manual_review: input.manualReview ?? false,
  });
  if (error) throw error;
  if (data !== true) throw new Error("AGENT_COMMERCE_DELIVERY_RELEASE_LOST_CLAIM");
}
