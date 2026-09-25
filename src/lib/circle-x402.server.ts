import { createHash } from "node:crypto";
import process from "node:process";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { recordCommercialPaymentEvent } from "./commercial-ops.server";
import { requireRiskSupabase } from "./risk-supabase.server";

export const CIRCLE_X402_NETWORK = "eip155:5042002" as const;
export const CIRCLE_X402_ASSET =
  "0x3600000000000000000000000000000000000000" as const;
export const CIRCLE_X402_GATEWAY_WALLET =
  "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;
export const CIRCLE_X402_PRICE_USDC = "0.001" as const;
export const CIRCLE_X402_PRICE_ATOMIC = "1000" as const;
export const CIRCLE_X402_MAX_TIMEOUT_SECONDS = 604900 as const;
export const CIRCLE_X402_FACILITATOR_URL =
  "https://gateway-api-testnet.circle.com" as const;

const facilitator = new BatchFacilitatorClient({
  url: CIRCLE_X402_FACILITATOR_URL,
});

export type CircleX402Settlement = {
  payer: string | null;
  settlement_reference: string;
  amount_atomic: string;
  amount_usdc: string;
  network: typeof CIRCLE_X402_NETWORK;
};

export type CircleX402VerifyResult = {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
  invalidMessage?: string;
};

function sellerAddress() {
  const value = process.env.CIRCLE_X402_SELLER_ADDRESS?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as `0x${string}`;
}

export function isCircleX402Configured() {
  return sellerAddress() !== null;
}

export function circleX402PaymentRequirements() {
  const payTo = sellerAddress();
  if (!payTo) throw new Error("CIRCLE_X402_SELLER_ADDRESS is not configured");

  return {
    scheme: "exact" as const,
    network: CIRCLE_X402_NETWORK,
    asset: CIRCLE_X402_ASSET,
    amount: CIRCLE_X402_PRICE_ATOMIC,
    payTo,
    maxTimeoutSeconds: CIRCLE_X402_MAX_TIMEOUT_SECONDS,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: CIRCLE_X402_GATEWAY_WALLET,
    },
  };
}

function encodeUtf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function decodeUtf8Base64(value: string) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function encodeHeader(value: unknown) {
  return encodeUtf8Base64(JSON.stringify(value));
}

export function decodeCircleX402PaymentHeader(header: string): Record<string, unknown> {
  if (header.length > 64 * 1024) {
    throw new Error("PAYMENT_SIGNATURE_HEADER_TOO_LARGE");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8Base64(header));
  } catch {
    throw new Error("PAYMENT_SIGNATURE_INVALID_ENCODING_OR_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PAYMENT_SIGNATURE_INVALID_PAYLOAD");
  }

  return parsed as Record<string, unknown>;
}

function normalizedAddress(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function assertCircleX402PaymentBinding(paymentPayload: Record<string, unknown>) {
  if (paymentPayload.x402Version !== 2) {
    throw new Error("PAYMENT_X402_VERSION_MISMATCH");
  }

  const accepted = paymentPayload.accepted;
  if (!accepted || typeof accepted !== "object" || Array.isArray(accepted)) {
    throw new Error("PAYMENT_ACCEPTED_REQUIREMENTS_MISSING");
  }

  const actual = accepted as Record<string, unknown>;
  const expected = circleX402PaymentRequirements();
  if (actual.scheme !== expected.scheme) throw new Error("PAYMENT_SCHEME_MISMATCH");
  if (actual.network !== expected.network) throw new Error("PAYMENT_NETWORK_MISMATCH");
  if (normalizedAddress(actual.asset) !== expected.asset.toLowerCase()) {
    throw new Error("PAYMENT_ASSET_MISMATCH");
  }
  if (String(actual.amount ?? "") !== expected.amount) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }
  if (normalizedAddress(actual.payTo) !== expected.payTo.toLowerCase()) {
    throw new Error("PAYMENT_RECIPIENT_MISMATCH");
  }
  if (Number(actual.maxTimeoutSeconds) !== expected.maxTimeoutSeconds) {
    throw new Error("PAYMENT_TIMEOUT_MISMATCH");
  }

  const extra = actual.extra;
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
    throw new Error("PAYMENT_GATEWAY_METADATA_MISSING");
  }
  const metadata = extra as Record<string, unknown>;
  if (metadata.name !== expected.extra.name || metadata.version !== expected.extra.version) {
    throw new Error("PAYMENT_GATEWAY_METADATA_MISMATCH");
  }
  if (
    normalizedAddress(metadata.verifyingContract) !==
    expected.extra.verifyingContract.toLowerCase()
  ) {
    throw new Error("PAYMENT_VERIFYING_CONTRACT_MISMATCH");
  }
}

function telemetryAgentId(payer: string | null) {
  if (!payer) return "unknown_x402_payer";
  const digest = createHash("sha256")
    .update(payer.trim().toLowerCase(), "utf8")
    .digest("hex");
  return `x402:sha256:${digest}`;
}

export function circleX402PaymentRequiredResponse(request: Request) {
  const requirements = circleX402PaymentRequirements();
  const endpoint = new URL(request.url).toString();
  const body = {
    x402Version: 2,
    resource: {
      url: endpoint,
      description:
        "Geomacro signed country/corridor risk pre-flight with structural context",
      mimeType: "application/json",
    },
    accepts: [requirements],
  };

  return Response.json(
    {
      ok: false,
      payment_required: true,
      price: `${CIRCLE_X402_PRICE_USDC} USDC`,
      network: CIRCLE_X402_NETWORK,
      note:
        "Arc Testnet technical proof only. Pay with an x402-compatible agent client, then retry the same request with the payment-signature header.",
      execution_authorized: false,
    },
    {
      status: 402,
      headers: {
        "PAYMENT-REQUIRED": encodeHeader(body),
        "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function verifyCircleX402(
  paymentPayload: Record<string, unknown>,
): Promise<CircleX402VerifyResult> {
  assertCircleX402PaymentBinding(paymentPayload);
  return (await facilitator.verify(
    paymentPayload as Parameters<typeof facilitator.verify>[0],
    circleX402PaymentRequirements() as Parameters<typeof facilitator.verify>[1],
  )) as CircleX402VerifyResult;
}

export async function persistSettlementTelemetry(input: {
  requestId: string;
  payer: string | null;
  settlementReference: string | null;
}) {
  try {
    const db = requireRiskSupabase();
    const settledAt = new Date().toISOString();
    const { data: requestRow, error: requestError } = await db
      .from("agent_api_requests")
      .insert({
        id: input.requestId,
        capability: "risk_preflight_x402",
        external_agent_id: telemetryAgentId(input.payer),
        status: "delivered",
        http_status: 200,
        response_code: "X402_SETTLED",
        completed_at: settledAt,
      })
      .select("id")
      .single();

    if (requestError || !requestRow) {
      throw requestError ?? new Error("agent request telemetry unavailable");
    }

    const { data: paymentRow, error: paymentError } = await db
      .from("agent_payments")
      .insert({
        request_id: requestRow.id,
        provider: "x402",
        status: "settled",
        amount: CIRCLE_X402_PRICE_ATOMIC,
        asset: "USDC",
        network: CIRCLE_X402_NETWORK,
        rail: "circle_gateway_batch",
        provider_reference: input.settlementReference,
        settled_at: settledAt,
      })
      .select("id")
      .single();

    if (paymentError || !paymentRow) {
      throw paymentError ?? new Error("agent payment telemetry unavailable");
    }

    await db
      .from("agent_api_requests")
      .update({ payment_id: paymentRow.id })
      .eq("id", requestRow.id);

    await recordCommercialPaymentEvent({
      environment: "testnet",
      network_family: "evm",
      network_name: "Arc Testnet",
      chain_id: "5042002",
      provider: "circle_gateway_x402",
      provider_environment: "testnet",
      payment_method: "x402",
      payment_status: "settled",
      revenue_classification: "testnet_non_revenue",
      provider_payment_id: String(paymentRow.id),
      provider_settlement_id: input.settlementReference,
      asset_symbol: "USDC",
      asset_contract: CIRCLE_X402_ASSET,
      amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
      amount_decimal: Number(CIRCLE_X402_PRICE_USDC),
      payer_reference: input.payer,
      recipient_reference: sellerAddress(),
      settled_at: settledAt,
      reconciliation_status: "not_applicable",
      commercial_revenue: false,
      metadata: {
        request_id: input.requestId,
        rail: "circle_gateway_batch",
        provider_reference_is_not_assumed_tx_hash: true,
        technical_proof_only: true,
      },
    });
  } catch (error) {
    console.error("[circle-x402] telemetry persistence failed", error);
  }
}

export async function settleCircleX402(
  paymentPayload: Record<string, unknown>,
): Promise<CircleX402Settlement> {
  assertCircleX402PaymentBinding(paymentPayload);
  const requirements = circleX402PaymentRequirements();

  const settled = await facilitator.settle(
    paymentPayload as Parameters<typeof facilitator.settle>[0],
    requirements as Parameters<typeof facilitator.settle>[1],
  );

  if (!settled.success) {
    throw new Error(
      `PAYMENT_SETTLEMENT_FAILED:${settled.errorReason ?? "unknown"}`,
    );
  }

  const settlementReference = String(settled.transaction ?? "").trim();
  if (!settlementReference) {
    throw new Error("PAYMENT_SETTLEMENT_REFERENCE_MISSING");
  }

  return {
    payer: settled.payer ?? null,
    settlement_reference: settlementReference,
    amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
    amount_usdc: CIRCLE_X402_PRICE_USDC,
    network: CIRCLE_X402_NETWORK,
  };
}

export function circleX402PaymentResponseHeader(
  settlement: CircleX402Settlement,
) {
  return encodeHeader({
    success: true,
    payer: settlement.payer,
    settlement_reference: settlement.settlement_reference,
    network: settlement.network,
    amount_atomic: settlement.amount_atomic,
    asset: "USDC",
    note:
      "Circle Gateway batching may return a settlement reference rather than an immediate onchain transaction hash.",
  });
}
