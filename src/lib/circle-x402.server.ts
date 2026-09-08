import process from "node:process";
import { Buffer } from "node:buffer";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import { requireRiskSupabase } from "./risk-supabase.server";

export const CIRCLE_X402_NETWORK = "eip155:5042002" as const;
export const CIRCLE_X402_ASSET = "0x3600000000000000000000000000000000000000" as const;
export const CIRCLE_X402_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" as const;
export const CIRCLE_X402_PRICE_USDC = "0.001" as const;
export const CIRCLE_X402_PRICE_ATOMIC = "1000" as const;

const facilitator = new BatchFacilitatorClient();

export type CircleX402Settlement = {
  payer: string | null;
  settlement_reference: string | null;
  amount_atomic: string;
  amount_usdc: string;
  network: typeof CIRCLE_X402_NETWORK;
};

function sellerAddress() {
  const value = process.env.CIRCLE_X402_SELLER_ADDRESS?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) return null;
  return value as `0x${string}`;
}

export function isCircleX402Configured() {
  return sellerAddress() !== null;
}

function paymentRequirements() {
  const payTo = sellerAddress();
  if (!payTo) throw new Error("CIRCLE_X402_SELLER_ADDRESS is not configured");

  return {
    scheme: "exact" as const,
    network: CIRCLE_X402_NETWORK,
    asset: CIRCLE_X402_ASSET,
    amount: CIRCLE_X402_PRICE_ATOMIC,
    payTo,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: CIRCLE_X402_GATEWAY_WALLET,
    },
  };
}

function encodeHeader(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodePaymentHeader(header: string) {
  if (header.length > 64 * 1024) throw new Error("payment-signature header is too large");
  const json = Buffer.from(header, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}

export function circleX402PaymentRequiredResponse(request: Request) {
  const requirements = paymentRequirements();
  const endpoint = new URL(request.url).toString();
  const body = {
    x402Version: 2,
    resource: {
      url: endpoint,
      description: "Geomacro signed country/corridor risk pre-flight with structural context",
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
      note: "Pay with an x402-compatible agent client using Circle Gateway on Arc Testnet, then retry the same request with the payment-signature header.",
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

async function persistSettlementTelemetry(input: {
  requestId: string;
  payer: string | null;
  settlementReference: string | null;
}) {
  try {
    const db = requireRiskSupabase();
    const { data: requestRow, error: requestError } = await db
      .from("agent_api_requests")
      .insert({
        id: input.requestId,
        capability: "risk_preflight_x402",
        external_agent_id: input.payer ?? "unknown_x402_payer",
        status: "delivered",
        http_status: 200,
        response_code: "X402_SETTLED",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (requestError || !requestRow) throw requestError ?? new Error("agent request telemetry unavailable");

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
        settled_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (paymentError || !paymentRow) throw paymentError ?? new Error("agent payment telemetry unavailable");

    await db
      .from("agent_api_requests")
      .update({ payment_id: paymentRow.id })
      .eq("id", requestRow.id);
  } catch (error) {
    console.error("[circle-x402] telemetry persistence failed", error);
  }
}

export async function verifyAndSettleCircleX402(
  request: Request,
): Promise<CircleX402Settlement> {
  const header = request.headers.get("payment-signature");
  if (!header) throw new Error("PAYMENT_SIGNATURE_MISSING");

  const requirements = paymentRequirements();
  const paymentPayload = decodePaymentHeader(header);

  const verify = await facilitator.verify(
    paymentPayload as Parameters<typeof facilitator.verify>[0],
    requirements as Parameters<typeof facilitator.verify>[1],
  );

  if (!verify.isValid) {
    throw new Error(`PAYMENT_VERIFICATION_FAILED:${verify.invalidReason ?? "unknown"}`);
  }

  const settled = await facilitator.settle(
    paymentPayload as Parameters<typeof facilitator.settle>[0],
    requirements as Parameters<typeof facilitator.settle>[1],
  );

  if (!settled.success) {
    throw new Error(`PAYMENT_SETTLEMENT_FAILED:${settled.errorReason ?? "unknown"}`);
  }

  const payer = settled.payer ?? verify.payer ?? null;
  const settlementReference = settled.transaction ?? null;

  return {
    payer,
    settlement_reference: settlementReference,
    amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
    amount_usdc: CIRCLE_X402_PRICE_USDC,
    network: CIRCLE_X402_NETWORK,
  };
}

export function circleX402PaymentResponseHeader(settlement: CircleX402Settlement) {
  return encodeHeader({
    success: true,
    payer: settlement.payer,
    settlement_reference: settlement.settlement_reference,
    network: settlement.network,
    amount_atomic: settlement.amount_atomic,
    asset: "USDC",
    note: "Circle Gateway batching may return a settlement reference rather than an immediate onchain transaction hash.",
  });
}

export { persistSettlementTelemetry };
