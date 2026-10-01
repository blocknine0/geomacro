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

type CommerceLedgerBackend = "supabase" | "durable_object";

const DURABLE_LEDGER_TIMEOUT_MS = 3_500;
const CLAIM_DISPOSITIONS = new Set<AgentCommerceDeliveryClaim["disposition"]>([
  "CLAIMED",
  "REPLAY",
  "IN_PROGRESS",
  "CONFLICT",
  "MANUAL_REVIEW",
]);

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

function commerceLedgerBackend(): CommerceLedgerBackend {
  const raw = String(process.env.GEOMACRO_COMMERCE_LEDGER_BACKEND ?? "supabase")
    .trim()
    .toLowerCase();
  if (raw === "supabase" || raw === "durable_object") return raw;
  throw new Error("AGENT_COMMERCE_LEDGER_BACKEND_INVALID");
}

function durableLedgerConfig() {
  const rawUrl = String(process.env.GEOMACRO_COMMERCE_LEDGER_URL ?? "").trim();
  const token = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (!rawUrl || token.length < 32) throw new Error("AGENT_COMMERCE_DURABLE_LEDGER_CONFIG_REQUIRED");
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("AGENT_COMMERCE_DURABLE_LEDGER_URL_INVALID");
  }
  if (url.protocol !== "https:") throw new Error("AGENT_COMMERCE_DURABLE_LEDGER_HTTPS_REQUIRED");
  return { url: url.toString().replace(/\/$/, ""), token };
}

async function callDurableLedger<T>(
  action: "claim" | "prepare" | "complete" | "release",
  payload: Record<string, unknown>,
): Promise<T> {
  const cfg = durableLedgerConfig();
  const response = await fetch(`${cfg.url}/v1/delivery/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DURABLE_LEDGER_TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`AGENT_COMMERCE_DURABLE_LEDGER_HTTP_${response.status}`);
  }
  return body as T;
}

function assertDurableClaim(value: unknown): AgentCommerceDeliveryClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AGENT_COMMERCE_DURABLE_LEDGER_CLAIM_INVALID");
  }
  const row = value as Record<string, unknown>;
  const disposition = String(row.disposition ?? "") as AgentCommerceDeliveryClaim["disposition"];
  if (!CLAIM_DISPOSITIONS.has(disposition)) {
    throw new Error("AGENT_COMMERCE_DURABLE_LEDGER_DISPOSITION_INVALID");
  }
  return {
    disposition,
    claim_token: row.claim_token == null ? null : String(row.claim_token),
    response_payload: row.response_payload ?? null,
    response_sha256: row.response_sha256 == null ? null : String(row.response_sha256),
    settlement_reference: row.settlement_reference == null ? null : String(row.settlement_reference),
    settlement_network: row.settlement_network == null ? null : String(row.settlement_network),
  };
}

async function assertDurableMutation(action: "prepare" | "complete" | "release", payload: Record<string, unknown>) {
  const result = await callDurableLedger<{ ok?: unknown }>(action, payload);
  if (result?.ok !== true) throw new Error(`AGENT_COMMERCE_DELIVERY_${action.toUpperCase()}_LOST_CLAIM`);
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
  const amount = input.amountAtomic == null ? null : String(input.amountAtomic);
  const clientRequestId = normalizeBounded(input.clientRequestId, 128);
  const sourceChannel = normalizeBounded(input.sourceChannel, 96);
  const rail = normalizeBounded(input.rail, 96);
  const network = normalizeBounded(input.network, 128);
  const asset = normalizeBounded(input.asset, 128);
  const recipientHash = commerceReferenceHash(input.recipientReference);

  if (commerceLedgerBackend() === "durable_object") {
    const row = await callDurableLedger<unknown>("claim", {
      provider: input.provider,
      providerEnvironment: input.providerEnvironment,
      paymentFingerprint: input.paymentFingerprint,
      requestFingerprint: input.requestFingerprint,
      productId: input.productId,
      clientRequestId,
      sourceChannel,
      rail,
      network,
      asset,
      amountAtomic: amount,
      recipientHash,
    });
    return assertDurableClaim(row);
  }

  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("claim_agent_commerce_delivery", {
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_payment_fingerprint: input.paymentFingerprint,
    p_request_fingerprint: input.requestFingerprint,
    p_product_id: input.productId,
    p_client_request_id: clientRequestId,
    p_source_channel: sourceChannel,
    p_rail: rail,
    p_network: network,
    p_asset: asset,
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
  const responseSha256 = commerceFingerprint(input.responsePayload);

  if (commerceLedgerBackend() === "durable_object") {
    await assertDurableMutation("prepare", {
      provider: input.provider,
      providerEnvironment: input.providerEnvironment,
      paymentFingerprint: input.paymentFingerprint,
      claimToken: input.claimToken,
      responsePayload: input.responsePayload,
      responseSha256,
    });
    return { responseSha256 };
  }

  const db = requireRiskSupabase();
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
  const settlementReference = normalizeBounded(input.settlementReference, 256);
  if (!settlementReference) throw new Error("AGENT_COMMERCE_SETTLEMENT_REFERENCE_REQUIRED");
  const settlementNetwork = normalizeBounded(input.settlementNetwork, 128);
  const payerHash = commerceReferenceHash(input.payerReference);

  if (commerceLedgerBackend() === "durable_object") {
    await assertDurableMutation("complete", {
      provider: input.provider,
      providerEnvironment: input.providerEnvironment,
      paymentFingerprint: input.paymentFingerprint,
      claimToken: input.claimToken,
      payerHash,
      settlementReference,
      settlementNetwork,
    });
    return;
  }

  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("complete_agent_commerce_delivery", {
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_payer_hash: commerceReferenceHash(input.payerReference),
    p_settlement_reference: settlementReference,
    p_settlement_network: settlementNetwork,
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
  const failureCode = String(input.failureCode || "UNKNOWN").slice(0, 160);

  if (commerceLedgerBackend() === "durable_object") {
    await assertDurableMutation("release", {
      provider: input.provider,
      providerEnvironment: input.providerEnvironment,
      paymentFingerprint: input.paymentFingerprint,
      claimToken: input.claimToken,
      failureCode,
      manualReview: input.manualReview ?? false,
    });
    return;
  }

  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("release_agent_commerce_delivery", {
    p_provider: input.provider,
    p_provider_environment: input.providerEnvironment,
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_failure_code: failureCode,
    p_manual_review: input.manualReview ?? false,
  });
  if (error) throw error;
  if (data !== true) throw new Error("AGENT_COMMERCE_DELIVERY_RELEASE_LOST_CLAIM");
}
