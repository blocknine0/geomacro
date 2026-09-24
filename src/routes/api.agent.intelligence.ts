import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { routeQuestion } from "../../global-intelligence/engine/router.mjs";
import { answerQuestion } from "../lib/ask-intelligence.server";
import {
  claimAgentCommerceDelivery,
  commerceFingerprint,
  completeAgentCommerceDelivery,
  prepareAgentCommerceDelivery,
  releaseAgentCommerceDelivery,
} from "../lib/agent-commerce-delivery.server";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import {
  circleX402PaymentRequiredResponse,
  circleX402PaymentResponseHeader,
  settleCircleX402,
} from "../lib/circle-x402.server";

const MAX_BODY_BYTES = 32 * 1024;
const PRODUCT_ID = "geomacro_global_intelligence_circle_x402_v1";

const requestSchema = z.object({
  question: z.string().trim().min(3).max(2_000),
  client_request_id: z.string().trim().min(4).max(128).optional(),
}).strict();

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
      "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
      ...extraHeaders,
    },
  });
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { error: json({ ok: false, error: { code: "INVALID_CONTENT_TYPE", message: "Content-Type must be application/json." }, execution_authorized: false }, 415) } as const;
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: { code: "REQUEST_TOO_LARGE", message: "Request body is too large." }, execution_authorized: false }, 413) } as const;
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { error: json({ ok: false, error: { code: "REQUEST_TOO_LARGE", message: "Request body is too large." }, execution_authorized: false }, 413) } as const;
  }

  try {
    const parsed = requestSchema.parse(JSON.parse(raw));
    return { parsed } as const;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: json({
          ok: false,
          error: {
            code: "INVALID_GLOBAL_INTELLIGENCE_REQUEST",
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          execution_authorized: false,
        }, 400),
      } as const;
    }
    return { error: json({ ok: false, error: { code: "INVALID_JSON", message: "Request body is not valid JSON." }, execution_authorized: false }, 400) } as const;
  }
}

function categoriesFor(question: string) {
  return routeQuestion(question);
}

async function prepareAnswer(question: string) {
  const categories = categoriesFor(question);
  const answer = await answerQuestion(question);

  if (answer.insufficient_evidence) {
    return {
      deliverable: false as const,
      categories,
      answer,
    };
  }

  return {
    deliverable: true as const,
    categories,
    answer,
  };
}

export const Route = createFileRoute("/api/agent/intelligence")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
        },
      }),
      GET: async ({ request }) => json({
        ok: true,
        service: "Geomacro Global Intelligence",
        product: PRODUCT_ID,
        endpoint: new URL("/api/agent/intelligence", request.url).toString(),
        payment_provider: "circle_gateway_x402",
        environment: "Arc Testnet",
        network: "eip155:5042002",
        asset: "USDC",
        exact_price_usdc: "0.05",
        categories: ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"],
        coverage: "global question routing across the three core intelligence categories; answers are delivered only when evidence is sufficient",
        execution_authorized: false,
      }),
      POST: async ({ request }) => {
        const parsedBody = await parseBody(request);
        if ("error" in parsedBody) return parsedBody.error;

        const { question, client_request_id } = parsedBody.parsed;

        if (!allowPublicDemoRequest(request, {
          namespace: "agent-intelligence-x402",
          windowMs: 60_000,
          maxPerClient: 20,
          maxGlobal: 200,
        })) {
          return json({
            ok: false,
            chargeable: false,
            error: {
              code: "X402_RATE_LIMITED",
              message: "Global intelligence request limit exceeded.",
            },
            execution_authorized: false,
          }, 429);
        }

        let prepared;
        try {
          prepared = await prepareAnswer(question);
        } catch (error) {
          console.error("[agent-intelligence] pre-payment answer preparation failed", error);
          return json({
            ok: false,
            chargeable: false,
            error: {
              code: "INTELLIGENCE_PREPARATION_UNAVAILABLE",
              message: "The requested intelligence could not be safely prepared; no payment is accepted.",
            },
            execution_authorized: false,
          }, 503);
        }

        if (!prepared.deliverable) {
          return json({
            ok: false,
            chargeable: false,
            payment_required_now: false,
            categories: prepared.categories,
            answer: prepared.answer,
            error: {
              code: "GLOBAL_INTELLIGENCE_NOT_DELIVERABLE",
              message: "The requested question does not currently have sufficient grounded evidence; no payment is accepted.",
            },
            execution_authorized: false,
          }, 422);
        }

        const paymentHeader = request.headers.get("payment-signature")?.trim() ?? "";
        if (!paymentHeader) {
          return circleX402PaymentRequiredResponse(request);
        }

        const paymentFingerprint = commerceFingerprint(paymentHeader);
        const requestFingerprint = commerceFingerprint({
          product: PRODUCT_ID,
          question: question.trim().replace(/\s+/g, " ").toLowerCase(),
          categories: prepared.categories,
        });

        let claim;
        try {
          claim = await claimAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            requestFingerprint,
            productId: PRODUCT_ID,
            clientRequestId: client_request_id ?? null,
            sourceChannel: "circle_gateway_x402_global_intelligence",
            rail: "circle_gateway_batch",
            network: "eip155:5042002",
            asset: "0x3600000000000000000000000000000000000000",
            amountAtomic: "50000",
            recipientReference: undefined,
          });
        } catch (error) {
          console.error("[agent-intelligence] delivery claim failed", error);
          return json({
            ok: false,
            error: { code: "GLOBAL_INTELLIGENCE_DELIVERY_LEDGER_UNAVAILABLE", message: "Paid delivery ledger is unavailable." },
            execution_authorized: false,
          }, 503);
        }

        if (claim.disposition === "CONFLICT") {
          return json({
            ok: false,
            error: { code: "PAYMENT_REPLAY_CONFLICT", message: "This payment proof is already bound to a different intelligence request." },
            execution_authorized: false,
          }, 409);
        }
        if (claim.disposition === "IN_PROGRESS") {
          return json({
            ok: false,
            error: { code: "PAID_REQUEST_IN_PROGRESS", message: "This exact paid intelligence request is already processing." },
            execution_authorized: false,
          }, 409, { "Retry-After": "2" });
        }
        if (claim.disposition === "MANUAL_REVIEW") {
          return json({
            ok: false,
            error: { code: "SETTLEMENT_RECONCILIATION_REQUIRED", message: "A prior settlement outcome is ambiguous; automatic re-charge is blocked." },
            execution_authorized: false,
          }, 503);
        }
        if (claim.disposition === "REPLAY" && claim.response_payload) {
          const replay = claim.response_payload as Record<string, unknown>;
          return json({
            ...replay,
            payment: {
              ...(replay.payment as Record<string, unknown> ?? {}),
              idempotent_replay: true,
              settlement_reference: claim.settlement_reference,
              settlement_network: claim.settlement_network,
            },
            execution_authorized: false,
          });
        }
        if (claim.disposition !== "CLAIMED" || !claim.claim_token) {
          return json({
            ok: false,
            error: { code: "GLOBAL_INTELLIGENCE_DELIVERY_CLAIM_FAILED", message: "Unable to claim this paid intelligence request." },
            execution_authorized: false,
          }, 503);
        }

        const claimToken = claim.claim_token;

        let finalPrepared;
        try {
          finalPrepared = await prepareAnswer(question);
          if (!finalPrepared.deliverable) {
            await releaseAgentCommerceDelivery({
              provider: "circle_gateway_x402",
              providerEnvironment: "testnet",
              paymentFingerprint,
              claimToken,
              failureCode: "FINAL_GLOBAL_INTELLIGENCE_NOT_DELIVERABLE",
            });
            return json({
              ok: false,
              chargeable: false,
              error: {
                code: "FINAL_GLOBAL_INTELLIGENCE_NOT_DELIVERABLE",
                message: "The required intelligence was no longer deliverable before settlement; no payment was taken.",
              },
              execution_authorized: false,
            }, 422);
          }
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            claimToken,
            failureCode: "FINAL_GLOBAL_INTELLIGENCE_PREPARATION_FAILED",
          });
          console.error("[agent-intelligence] final answer preparation failed", error);
          return json({
            ok: false,
            chargeable: false,
            error: {
              code: "FINAL_GLOBAL_INTELLIGENCE_PREPARATION_FAILED",
              message: "The required intelligence could not be safely prepared before settlement.",
            },
            execution_authorized: false,
          }, 503);
        }

        const requestId = crypto.randomUUID();
        const responsePayload = {
          ok: true,
          product: PRODUCT_ID,
          request_id: requestId,
          client_request_id: client_request_id ?? null,
          categories: finalPrepared.categories,
          answer: finalPrepared.answer,
          payment: {
            provider: "circle_gateway_x402",
            settled: false,
            amount_usdc: "0.05",
            amount_atomic: "50000",
            asset: "USDC",
            network: "eip155:5042002",
            idempotent_replay: false,
          },
          execution_authorized: false,
        };

        try {
          await prepareAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            claimToken,
            responsePayload,
          });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            claimToken,
            failureCode: "GLOBAL_INTELLIGENCE_PREPARE_LEDGER_FAILED",
          });
          console.error("[agent-intelligence] response preparation ledger failed", error);
          return json({
            ok: false,
            error: { code: "GLOBAL_INTELLIGENCE_PREPARE_LEDGER_FAILED", message: "Paid intelligence could not be durably prepared." },
            execution_authorized: false,
          }, 503);
        }

        let settlement;
        try {
          settlement = await settleCircleX402(request);
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            claimToken,
            failureCode: "GLOBAL_INTELLIGENCE_SETTLEMENT_AMBIGUOUS",
            manualReview: true,
          });
          console.error("[agent-intelligence] settlement outcome ambiguous", error);
          return json({
            ok: false,
            error: {
              code: "GLOBAL_INTELLIGENCE_SETTLEMENT_RECONCILIATION_REQUIRED",
              message: "Settlement outcome is ambiguous. Automatic re-charge is blocked pending reconciliation.",
            },
            execution_authorized: false,
          }, 503);
        }

        if (!settlement.settlement_reference) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            claimToken,
            failureCode: "GLOBAL_INTELLIGENCE_SETTLEMENT_REFERENCE_MISSING",
            manualReview: true,
          });
          return json({
            ok: false,
            error: {
              code: "GLOBAL_INTELLIGENCE_SETTLEMENT_RECONCILIATION_REQUIRED",
              message: "Settlement succeeded without a durable settlement reference. Delivery is held for reconciliation.",
            },
            execution_authorized: false,
          }, 503, {
            "PAYMENT-RESPONSE": circleX402PaymentResponseHeader(settlement),
          });
        }

        try {
          await completeAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            claimToken,
            payerReference: settlement.payer,
            settlementReference: settlement.settlement_reference,
            settlementNetwork: settlement.network,
          });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: "testnet",
            paymentFingerprint,
            claimToken,
            failureCode: "GLOBAL_INTELLIGENCE_POST_SETTLEMENT_LEDGER_FAILURE",
            manualReview: true,
          }).catch(() => undefined);
          console.error("[agent-intelligence] post-settlement delivery ledger failed", error);
          return json({
            ok: false,
            error: {
              code: "GLOBAL_INTELLIGENCE_POST_SETTLEMENT_RECONCILIATION_REQUIRED",
              message: "Payment settled but durable delivery accounting requires reconciliation. Automatic re-charge remains blocked.",
            },
            settlement_reference: settlement.settlement_reference,
            execution_authorized: false,
          }, 503, {
            "PAYMENT-RESPONSE": circleX402PaymentResponseHeader(settlement),
          });
        }

        return json({
          ...responsePayload,
          payment: {
            ...responsePayload.payment,
            settled: true,
            settlement_reference: settlement.settlement_reference,
            payer: settlement.payer,
            idempotent_replay: false,
          },
          execution_authorized: false,
        }, 200, {
          "PAYMENT-RESPONSE": circleX402PaymentResponseHeader(settlement),
        });
      },
    },
  },
});
