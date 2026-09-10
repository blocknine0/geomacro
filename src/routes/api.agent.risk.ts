import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { agenticDemoRequestSchema } from "../lib/agentic-demo-contract";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";
import {
  GEOMACRO_AGENT_VERSION,
  geomacroAgentManifest,
} from "../lib/geomacro-agent-contract";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import {
  CIRCLE_X402_ASSET,
  CIRCLE_X402_NETWORK,
  CIRCLE_X402_PRICE_ATOMIC,
  CIRCLE_X402_PRICE_USDC,
  circleX402PaymentRequiredResponse,
  circleX402PaymentResponseHeader,
  isCircleX402Configured,
  persistSettlementTelemetry,
  settleCircleX402,
} from "../lib/circle-x402.server";

const MAX_BODY_BYTES = 8 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

        if (!request.headers.get("payment-signature")) {
          const response = circleX402PaymentRequiredResponse(request);
          for (const [key, value] of Object.entries(corsHeaders)) {
            response.headers.set(key, value);
          }
          return response;
        }

        try {
          const settlement = await settleCircleX402(request);
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
                "Paid through Circle Gateway x402 on Arc Testnet. This remains technical proof only and is not the planned production real-money commercial payment system.",
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
            message.startsWith("PAYMENT_SETTLEMENT_FAILED") ||
            message.startsWith("PAYMENT_SIGNATURE_");

          console.error(
            paymentFailure
              ? "[agentic-x402] payment validation/settlement failed"
              : "[agentic-x402] paid resource failed closed",
            error,
          );

          return json(
            {
              ok: false,
              error: {
                code: paymentFailure
                  ? "X402_PAYMENT_FAILED"
                  : "PAID_RESOURCE_FAILED_CLOSED",
                message: paymentFailure
                  ? "Payment signature could not be verified or settled."
                  : "Paid resource delivery failed closed.",
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
