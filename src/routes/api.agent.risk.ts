import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { agenticDemoRequestSchema } from "../lib/agentic-demo-contract";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";
import {
  CIRCLE_X402_ASSET,
  CIRCLE_X402_NETWORK,
  CIRCLE_X402_PRICE_ATOMIC,
  CIRCLE_X402_PRICE_USDC,
  circleX402PaymentRequiredResponse,
  circleX402PaymentResponseHeader,
  isCircleX402Configured,
  persistSettlementTelemetry,
  verifyAndSettleCircleX402,
} from "../lib/circle-x402.server";

const MAX_BODY_BYTES = 8 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, payment-signature",
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

async function parseBody(request: Request) {
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

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Response("Request body is not valid JSON", { status: 400 });
  }

  return agenticDemoRequestSchema.parse(body);
}

export const Route = createFileRoute("/api/agent/risk")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        if (!isCircleX402Configured()) {
          return json(
            {
              ok: false,
              error: {
                code: "X402_NOT_CONFIGURED",
                message:
                  "Circle x402 seller configuration is not active in this runtime. The free /api/demo/preflight sandbox remains available.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        let body;
        try {
          body = await parseBody(request);
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

        // Prepare the exact risk resource BEFORE asking the caller to pay.
        // On a paid retry the same prepared result is delivered after settlement;
        // we do not recompute a second Risk Gate result after money is accepted.
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
          return json(
            {
              ok: false,
              error: { code: "RISK_RESOURCE_UNAVAILABLE", message },
              execution_authorized: false,
            },
            message.startsWith("Public demo currently supports") ? 400 : 503,
          );
        }

        if (!request.headers.get("payment-signature")) {
          const response = circleX402PaymentRequiredResponse(request);
          for (const [key, value] of Object.entries(corsHeaders)) {
            response.headers.set(key, value);
          }
          return response;
        }

        try {
          const settlement = await verifyAndSettleCircleX402(request);
          const result = {
            ...prepared,
            payment: {
              required: true as const,
              provider: "circle_gateway_x402" as const,
              asset: "USDC" as const,
              network: CIRCLE_X402_NETWORK,
              amount_atomic: CIRCLE_X402_PRICE_ATOMIC,
              amount_usdc: CIRCLE_X402_PRICE_USDC,
              payer: settlement.payer,
              settlement_reference: settlement.settlement_reference,
              note:
                "Paid through Circle Gateway x402 on Arc Testnet. This is technical proof, not institutional pricing or production execution authorization.",
            },
          };

          if (result.risk_gate.execution_authorized !== false) {
            throw new Error("Risk Gate execution boundary violated after settlement");
          }

          await persistSettlementTelemetry({
            requestId: prepared.request_id,
            payer: settlement.payer,
            settlementReference: settlement.settlement_reference,
          });

          return json(result, 200, {
            "PAYMENT-RESPONSE": circleX402PaymentResponseHeader(settlement),
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Circle x402 payment failed.";
          const paymentFailure =
            message.startsWith("PAYMENT_VERIFICATION_FAILED") ||
            message.startsWith("PAYMENT_SETTLEMENT_FAILED") ||
            message.startsWith("PAYMENT_SIGNATURE_");

          return json(
            {
              ok: false,
              error: {
                code: paymentFailure
                  ? "X402_PAYMENT_FAILED"
                  : "PAID_RESOURCE_FAILED_CLOSED",
                message,
              },
              payment: {
                provider: "circle_gateway_x402",
                asset: CIRCLE_X402_ASSET,
                network: CIRCLE_X402_NETWORK,
              },
              execution_authorized: false,
            },
            paymentFailure ? 402 : 503,
          );
        }
      },
    },
  },
});
