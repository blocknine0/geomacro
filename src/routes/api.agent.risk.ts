import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { agenticDemoRequestSchema } from "../lib/agentic-demo-contract";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";
import { answerQuestion } from "../lib/ask-intelligence.server";
import {
  agentIntelligenceQuerySchema,
  agentStructuralQuerySchema,
  GEOMACRO_AGENT_VERSION,
  geomacroAgentManifest,
} from "../lib/geomacro-agent-contract";
import { loadPublicStructuralDigest } from "../lib/public-structural-digest.server";
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

function hasCapability(raw: unknown, capability: string) {
  return Boolean(
    raw &&
      typeof raw === "object" &&
      "capability" in raw &&
      (raw as { capability?: unknown }).capability === capability,
  );
}

async function handlePublicIntelligenceQuery(request: Request, raw: unknown) {
  if (
    !allowPublicDemoRequest(request, {
      namespace: "geomacro-agent-intelligence",
      windowMs: 60_000,
      maxPerClient: 20,
      maxGlobal: 200,
    })
  ) {
    return json(
      {
        ok: false,
        agent_version: GEOMACRO_AGENT_VERSION,
        capability: "intelligence_query",
        error: {
          code: "AGENT_RATE_LIMITED",
          message: "Public agent query limit exceeded. Try again shortly.",
        },
        execution_authorized: false,
      },
      429,
    );
  }

  let input;
  try {
    input = agentIntelligenceQuerySchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          ok: false,
          agent_version: GEOMACRO_AGENT_VERSION,
          capability: "intelligence_query",
          error: {
            code: "INVALID_AGENT_QUERY",
            message: "Agent intelligence query fields are invalid.",
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

  try {
    const answer = await answerQuestion(input.question);
    return json({
      ok: true,
      agent_version: GEOMACRO_AGENT_VERSION,
      capability: "intelligence_query",
      request_id: randomUUID(),
      client_request_id: input.client_request_id ?? null,
      answer,
      grounding: {
        mode: "geomacro_stored_intelligence_only",
        external_web_search: false,
        synthetic_fallback_score: false,
        current_gri_requires_canonical_public_verification: true,
      },
      boundaries: {
        execution_authorized: false,
        financial_advice: false,
        wallet_custody: false,
        transaction_signing: false,
        raw_data_included: false,
      },
    });
  } catch (error) {
    console.error("[geomacro-agent] intelligence query failed", error);
    return json(
      {
        ok: false,
        agent_version: GEOMACRO_AGENT_VERSION,
        capability: "intelligence_query",
        error: {
          code: "INTELLIGENCE_UNAVAILABLE",
          message: "Grounded Geomacro intelligence is temporarily unavailable.",
        },
        execution_authorized: false,
      },
      503,
    );
  }
}

async function handlePublicStructuralQuery(request: Request, raw: unknown) {
  if (
    !allowPublicDemoRequest(request, {
      namespace: "geomacro-agent-structural",
      windowMs: 60_000,
      maxPerClient: 12,
      maxGlobal: 120,
    })
  ) {
    return json(
      {
        ok: false,
        agent_version: GEOMACRO_AGENT_VERSION,
        capability: "structural_query",
        error: {
          code: "STRUCTURAL_RATE_LIMITED",
          message: "Public structural query limit exceeded. Try again shortly.",
        },
        execution_authorized: false,
      },
      429,
    );
  }

  let input;
  try {
    input = agentStructuralQuerySchema.parse(raw);
  } catch (error) {
    if (error instanceof ZodError) {
      return json(
        {
          ok: false,
          agent_version: GEOMACRO_AGENT_VERSION,
          capability: "structural_query",
          error: {
            code: "INVALID_STRUCTURAL_QUERY",
            message: "Structural query fields are invalid.",
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

  try {
    const digest = await loadPublicStructuralDigest(input);
    return json({
      ok: true,
      agent_version: GEOMACRO_AGENT_VERSION,
      capability: "structural_query",
      request_id: randomUUID(),
      client_request_id: input.client_request_id ?? null,
      structural_context: digest,
      boundaries: {
        execution_authorized: false,
        financial_advice: false,
        raw_data_included: false,
        private_warehouse_access: false,
        structured_delivery_only: true,
      },
    });
  } catch (error) {
    console.error("[geomacro-agent] public structural query failed", error);
    return json(
      {
        ok: false,
        agent_version: GEOMACRO_AGENT_VERSION,
        capability: "structural_query",
        error: {
          code: "STRUCTURAL_CONTEXT_UNAVAILABLE",
          message: "Governed structural context is temporarily unavailable.",
        },
        execution_authorized: false,
      },
      503,
    );
  }
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

        if (hasCapability(rawBody, "intelligence_query")) {
          return handlePublicIntelligenceQuery(request, rawBody);
        }

        if (hasCapability(rawBody, "structural_query")) {
          return handlePublicStructuralQuery(request, rawBody);
        }

        if (!isCircleX402Configured()) {
          return json(
            {
              ok: false,
              error: {
                code: "X402_NOT_CONFIGURED",
                message:
                  "Circle x402 seller configuration is not active in this runtime. Free intelligence_query and structural_query capabilities remain available.",
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
