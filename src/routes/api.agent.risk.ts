import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { agenticDemoRequestSchema } from "../lib/agentic-demo-contract";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";
import {
  claimAgentCommerceDelivery,
  commerceFingerprint,
  completeAgentCommerceDelivery,
  prepareAgentCommerceDelivery,
  releaseAgentCommerceDelivery,
} from "../lib/agent-commerce-delivery.server";
import {
  GEOMACRO_AGENT_VERSION,
  geomacroAgentManifest,
} from "../lib/geomacro-agent-contract";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import {
  assertCircleX402PaymentBinding,
  CIRCLE_X402_ASSET,
  CIRCLE_X402_NETWORK,
  CIRCLE_X402_PRICE_ATOMIC,
  CIRCLE_X402_PRICE_USDC,
  circleX402PaymentRequiredResponse,
  circleX402PaymentRequirements,
  circleX402PaymentResponseHeader,
  decodeCircleX402PaymentHeader,
  isCircleX402Configured,
  persistSettlementTelemetry,
  settleCircleX402,
  verifyCircleX402,
  type CircleX402Settlement,
} from "../lib/circle-x402.server";

const MAX_BODY_BYTES = 8 * 1024;
const CIRCLE_PROVIDER = "circle_gateway_x402" as const;
const CIRCLE_PROVIDER_ENVIRONMENT = "testnet" as const;
const CIRCLE_PRODUCT_ID = "risk_preflight" as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Access-Control-Max-Age": "600",
};

function json(
  payload: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function parseJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Response("Content-Type must be application/json", { status: 415 });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Response("Request body is not valid JSON", { status: 400 });
  }
}

function hasDeprecatedFreeCapability(raw: unknown) {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      "capability" in raw &&
      ["intelligence_query", "structural_query"].includes(
        String((raw as { capability?: unknown }).capability ?? ""),
      ),
  );
}

function finalPaidResponse(
  prepared: Record<string, unknown>,
  settlement: CircleX402Settlement,
  replayed = false,
) {
  const previous =
    prepared.payment &&
    typeof prepared.payment === "object" &&
    !Array.isArray(prepared.payment)
      ? (prepared.payment as Record<string, unknown>)
      : {};

  return {
    ...prepared,
    payment: {
      ...previous,
      required: true as const,
      provider: CIRCLE_PROVIDER,
      asset: "USDC" as const,
      asset_contract: CIRCLE_X402_ASSET,
      network: CIRCLE_X402_NETWORK,
      amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
      amount_usdc: CIRCLE_X402_PRICE_USDC,
      payer: settlement.payer ?? previous.payer ?? null,
      settlement_reference: settlement.settlement_reference,
      idempotent_replay: replayed,
      note:
        "Paid through Circle Gateway x402 on Arc Testnet. This remains technical proof only and is not the planned production real-money commercial payment system.",
    },
  };
}

function replaySettlement(
  prepared: Record<string, unknown>,
  settlementReference: string,
): CircleX402Settlement {
  const payment =
    prepared.payment &&
    typeof prepared.payment === "object" &&
    !Array.isArray(prepared.payment)
      ? (prepared.payment as Record<string, unknown>)
      : {};

  return {
    payer: typeof payment.payer === "string" ? payment.payer : null,
    settlement_reference: settlementReference,
    amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
    amount_usdc: CIRCLE_X402_PRICE_USDC,
    network: CIRCLE_X402_NETWORK,
  };
}

export const Route = createFileRoute("/api/agent/risk")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return json(geomacroAgentManifest(origin));
      },
      POST: async ({ request }) => {
        let rawBody: unknown;
        try {
          rawBody = await parseJsonBody(request);
        } catch (error) {
          if (error instanceof Response) {
            return json(
              {
                ok: false,
                error: {
                  code: "INVALID_AGENT_REQUEST",
                  message: await error.text(),
                },
                execution_authorized: false,
              },
              error.status,
            );
          }
          throw error;
        }

        if (hasDeprecatedFreeCapability(rawBody)) {
          return json(
            {
              ok: false,
              agent_version: GEOMACRO_AGENT_VERSION,
              error: {
                code: "FREE_API_NOT_AVAILABLE",
                message:
                  "Geomacro Free Explorer is a website/dashboard experience. Commercial structured API access requires a paid entitlement.",
              },
              commercial_api: "/api/commercial/structural",
              execution_authorized: false,
            },
            403,
          );
        }

        if (!isCircleX402Configured()) {
          return json(
            {
              ok: false,
              error: {
                code: "X402_NOT_CONFIGURED",
                message:
                  "Circle x402 technical-proof seller configuration is not active in this runtime. No free agent API fallback is provided.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        if (
          !allowPublicDemoRequest(request, {
            namespace: "agentic-x402",
            windowMs: 60_000,
            maxPerClient: 30,
            maxGlobal: 300,
          })
        ) {
          return json(
            {
              ok: false,
              error: {
                code: "X402_RATE_LIMITED",
                message: "Agent risk request limit exceeded. Try again shortly.",
              },
              execution_authorized: false,
            },
            429,
          );
        }

        let body;
        try {
          body = agenticDemoRequestSchema.parse(rawBody);
        } catch (error) {
          if (error instanceof ZodError) {
            return json(
              {
                ok: false,
                error: {
                  code: "INVALID_AGENT_REQUEST",
                  message: "Agent request fields are invalid.",
                  issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                  })),
                },
                execution_authorized: false,
              },
              400,
            );
          }
          throw error;
        }

        let prepared;
        try {
          prepared = await runAgenticPreflightDemo(body, {
            mode: "X402_PAID",
            recordTelemetry: false,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Requested risk resource is unavailable.";
          const unsupported = message.startsWith("Public demo currently supports");

          if (!unsupported) {
            console.error("[agentic-x402] risk resource preparation failed", error);
          }

          return json(
            {
              ok: false,
              error: {
                code: unsupported
                  ? "DEMO_SUBJECT_NOT_ENABLED"
                  : "RISK_RESOURCE_UNAVAILABLE",
                message: unsupported
                  ? message
                  : "Requested risk context is temporarily unavailable.",
              },
              execution_authorized: false,
            },
            unsupported ? 400 : 503,
          );
        }

        const paymentHeader = request.headers.get("payment-signature");
        if (!paymentHeader) {
          const response = circleX402PaymentRequiredResponse(request);
          for (const [key, value] of Object.entries(corsHeaders)) {
            response.headers.set(key, value);
          }
          return response;
        }

        let paymentPayload: Record<string, unknown>;
        try {
          paymentPayload = decodeCircleX402PaymentHeader(paymentHeader);
          assertCircleX402PaymentBinding(paymentPayload);
        } catch (error) {
          return json(
            {
              ok: false,
              error: {
                code: "X402_PAYMENT_BINDING_INVALID",
                message:
                  error instanceof Error
                    ? error.message
                    : "Payment payload does not match this resource.",
              },
              execution_authorized: false,
            },
            402,
          );
        }

        const requirements = circleX402PaymentRequirements();
        const paymentFingerprint = commerceFingerprint(paymentPayload);
        const requestFingerprint = commerceFingerprint(body);

        let claim;
        try {
          claim = await claimAgentCommerceDelivery({
            provider: CIRCLE_PROVIDER,
            providerEnvironment: CIRCLE_PROVIDER_ENVIRONMENT,
            paymentFingerprint,
            requestFingerprint,
            productId: CIRCLE_PRODUCT_ID,
            clientRequestId: body.client_request_id ?? null,
            sourceChannel: "api.agent.risk",
            rail: "circle_gateway_batch",
            network: CIRCLE_X402_NETWORK,
            asset: CIRCLE_X402_ASSET,
            amountAtomic: CIRCLE_X402_PRICE_ATOMIC,
            recipientReference: requirements.payTo,
          });
        } catch (error) {
          console.error("[agentic-x402] delivery claim failed", error);
          return json(
            {
              ok: false,
              error: {
                code: "X402_DELIVERY_LEDGER_UNAVAILABLE",
                message: "Paid delivery ledger is unavailable.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        if (claim.disposition === "CONFLICT") {
          return json(
            {
              ok: false,
              error: {
                code: "X402_PAYMENT_REPLAY_CONFLICT",
                message: "This payment proof is already bound to a different request.",
              },
              execution_authorized: false,
            },
            409,
          );
        }
        if (claim.disposition === "IN_PROGRESS") {
          return json(
            {
              ok: false,
              error: {
                code: "X402_REQUEST_IN_PROGRESS",
                message: "This exact paid request is already processing.",
              },
              execution_authorized: false,
            },
            409,
            { "Retry-After": "2" },
          );
        }
        if (claim.disposition === "MANUAL_REVIEW") {
          return json(
            {
              ok: false,
              error: {
                code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED",
                message:
                  "A previous settlement outcome is ambiguous; automatic re-charge is blocked.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        if (claim.disposition === "REPLAY" && claim.response_payload) {
          if (!claim.settlement_reference) {
            return json(
              {
                ok: false,
                error: {
                  code: "X402_REPLAY_LEDGER_INCOMPLETE",
                  message: "Delivered payment record is missing its settlement reference.",
                },
                execution_authorized: false,
              },
              503,
            );
          }
          const replayPrepared = claim.response_payload as Record<string, unknown>;
          const settlement = replaySettlement(
            replayPrepared,
            claim.settlement_reference,
          );
          return json(finalPaidResponse(replayPrepared, settlement, true), 200, {
            "PAYMENT-RESPONSE": circleX402PaymentResponseHeader(settlement),
          });
        }
        if (claim.disposition !== "CLAIMED" || !claim.claim_token) {
          return json(
            {
              ok: false,
              error: {
                code: "X402_DELIVERY_CLAIM_FAILED",
                message: "Unable to claim this paid request.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        const claimToken = claim.claim_token;

        let verified;
        try {
          verified = await verifyCircleX402(paymentPayload);
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: CIRCLE_PROVIDER,
            providerEnvironment: CIRCLE_PROVIDER_ENVIRONMENT,
            paymentFingerprint,
            claimToken,
            failureCode:
              error instanceof Error ? error.message : "CIRCLE_VERIFY_FAILED",
          });
          return json(
            {
              ok: false,
              error: {
                code: "X402_VERIFY_UNAVAILABLE",
                message: "Circle Gateway payment verification is temporarily unavailable.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        if (!verified.isValid) {
          await releaseAgentCommerceDelivery({
            provider: CIRCLE_PROVIDER,
            providerEnvironment: CIRCLE_PROVIDER_ENVIRONMENT,
            paymentFingerprint,
            claimToken,
            failureCode: verified.invalidReason ?? "CIRCLE_VERIFY_INVALID",
          });
          return json(
            {
              ok: false,
              error: {
                code: "X402_PAYMENT_INVALID",
                reason: verified.invalidReason ?? "invalid_payment",
                message: verified.invalidMessage ?? "Payment authorization is invalid.",
              },
              execution_authorized: false,
            },
            402,
          );
        }

        let durablePrepared: Record<string, unknown>;
        try {
          durablePrepared = {
            ...prepared,
            payment: {
              required: true as const,
              provider: CIRCLE_PROVIDER,
              asset: "USDC" as const,
              asset_contract: CIRCLE_X402_ASSET,
              network: CIRCLE_X402_NETWORK,
              amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
              amount_usdc: CIRCLE_X402_PRICE_USDC,
              payer: verified.payer ?? null,
              settlement_reference: null,
              idempotent_replay: false,
              note:
                "Arc Testnet x402 acceptance payment. Testnet activity is non-revenue.",
            },
          };

          if (durablePrepared.risk_gate && typeof durablePrepared.risk_gate === "object") {
            const gate = durablePrepared.risk_gate as { execution_authorized?: unknown };
            if (gate.execution_authorized !== false) {
              throw new Error("RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
            }
          } else {
            throw new Error("RISK_GATE_MISSING");
          }

          await prepareAgentCommerceDelivery({
            provider: CIRCLE_PROVIDER,
            providerEnvironment: CIRCLE_PROVIDER_ENVIRONMENT,
            paymentFingerprint,
            claimToken,
            responsePayload: durablePrepared,
          });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: CIRCLE_PROVIDER,
            providerEnvironment: CIRCLE_PROVIDER_ENVIRONMENT,
            paymentFingerprint,
            claimToken,
            failureCode:
              error instanceof Error ? error.message : "RISK_RESOURCE_UNAVAILABLE",
          });
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: "RISK_RESOURCE_UNAVAILABLE",
                message:
                  "Requested risk context changed or could not be durably prepared; no payment was taken.",
              },
              execution_authorized: false,
            },
            409,
          );
        }

        let settlement: CircleX402Settlement;
        try {
          settlement = await settleCircleX402(paymentPayload);
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: CIRCLE_PROVIDER,
            providerEnvironment: CIRCLE_PROVIDER_ENVIRONMENT,
            paymentFingerprint,
            claimToken,
            failureCode:
              error instanceof Error ? error.message : "CIRCLE_SETTLE_AMBIGUOUS",
            manualReview: true,
          });
          console.error("[agentic-x402] settlement outcome ambiguous", error);
          return json(
            {
              ok: false,
              error: {
                code: "X402_SETTLEMENT_AMBIGUOUS",
                message:
                  "Settlement could not be safely confirmed. This proof is locked against automatic re-charge.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        try {
          await completeAgentCommerceDelivery({
            provider: CIRCLE_PROVIDER,
            providerEnvironment: CIRCLE_PROVIDER_ENVIRONMENT,
            paymentFingerprint,
            claimToken,
            payerReference: settlement.payer,
            settlementReference: settlement.settlement_reference,
            settlementNetwork: settlement.network,
          });
        } catch (error) {
          console.error("[agentic-x402] post-settlement delivery completion failed", error);
          return json(
            {
              ok: false,
              error: {
                code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED",
                message:
                  "Payment settled but durable delivery completion could not be confirmed. Automatic re-charge is blocked.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        const result = finalPaidResponse(durablePrepared, settlement, false);
        await persistSettlementTelemetry({
          requestId: String(prepared.request_id),
          payer: settlement.payer,
          settlementReference: settlement.settlement_reference,
        });

        return json(result, 200, {
          "PAYMENT-RESPONSE": circleX402PaymentResponseHeader(settlement),
        });
      },
    },
  },
});
