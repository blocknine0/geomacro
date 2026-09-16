import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";

import { agentAdaptiveQuerySchema, buildAgentQueryPlan } from "../lib/agent-query-plan";
import { checkAgentQueryDeliverability } from "../lib/agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "../lib/agent-query-external-modules.server";
import { assembleAgentQueryResponse } from "../lib/agent-query-response.server";
import {
  claimAgentCommerceDelivery,
  commerceFingerprint,
  commerceSha256,
  completeAgentCommerceDelivery,
  prepareAgentCommerceDelivery,
  releaseAgentCommerceDelivery,
} from "../lib/agent-commerce-delivery.server";
import {
  CIRCLE_X402_BASE_MAINNET_USDC,
  getCircleGatewayProductionConfig,
  getCircleGatewayProductionRequirement,
  settleCircleGatewayProduction,
  verifyCircleGatewayProduction,
  type CircleGatewayPaymentRequirement,
  type CircleGatewayProductionConfig,
} from "../lib/circle-gateway-x402-production.server";
import {
  recordCommercialPaymentEvent,
  recordCommercialUsageEvent,
} from "../lib/commercial-ops.server";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";

const PRODUCT_ID = "geomacro_adaptive_risk_intelligence_v1";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_PAYMENT_HEADER_BYTES = 64 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Access-Control-Max-Age": "600",
};

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
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

function encodePaymentHeader(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodePaymentHeader(value: string) {
  let decoded: string;
  try {
    decoded = Buffer.from(value, "base64").toString("utf8");
  } catch {
    throw new Error("PAYMENT_SIGNATURE_INVALID_ENCODING");
  }
  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    throw new Error("PAYMENT_SIGNATURE_INVALID_JSON");
  }
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

function paymentRequiredDocument(request: Request, requirement: CircleGatewayPaymentRequirement) {
  return {
    x402Version: 2,
    resource: {
      url: new URL("/api/x402/circle/intelligence", request.url).toString(),
      description:
        "Geomacro adaptive geopolitical and macro risk intelligence with non-executing Risk Gate context",
      mimeType: "application/json",
    },
    accepts: [requirement],
  };
}

async function configuredCircleRequirement(request: Request) {
  let config: CircleGatewayProductionConfig | null;
  try {
    config = getCircleGatewayProductionConfig();
  } catch (error) {
    return {
      error: json(
        {
          ok: false,
          configured: false,
          error: {
            code: "CIRCLE_X402_PRODUCTION_LOCKED",
            message:
              error instanceof Error ? error.message : "Circle production configuration is locked.",
          },
          execution_authorized: false,
        },
        503,
      ),
    } as const;
  }

  if (!config) {
    return {
      error: json(
        {
          ok: false,
          configured: false,
          error: {
            code: "CIRCLE_X402_NOT_CONFIGURED",
            message: "Circle Gateway production x402 is not enabled in this runtime.",
          },
          execution_authorized: false,
        },
        503,
      ),
    } as const;
  }

  try {
    const requirement = await getCircleGatewayProductionRequirement(config);
    return { config, requirement, paymentRequired: paymentRequiredDocument(request, requirement) } as const;
  } catch (error) {
    return {
      error: json(
        {
          ok: false,
          configured: true,
          error: {
            code: "CIRCLE_GATEWAY_REQUIREMENTS_UNAVAILABLE",
            message:
              error instanceof Error ? error.message : "Circle Gateway payment requirements are unavailable.",
          },
          execution_authorized: false,
        },
        503,
      ),
    } as const;
  }
}

function replayResponse(
  prepared: Record<string, unknown>,
  settlementReference: string | null,
  settlementNetwork: string | null,
) {
  const priorPayment =
    prepared.payment && typeof prepared.payment === "object" && !Array.isArray(prepared.payment)
      ? (prepared.payment as Record<string, unknown>)
      : {};
  return {
    ...prepared,
    payment: {
      ...priorPayment,
      settled: true,
      provider: "circle_gateway_x402",
      settlement_reference: settlementReference,
      settlement_network: settlementNetwork,
      idempotent_replay: true,
    },
  };
}

export const Route = createFileRoute("/api/x402/circle/intelligence")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const configured = await configuredCircleRequirement(request);
        if ("error" in configured) return configured.error;
        return json({
          ok: true,
          service: "Geomacro Adaptive Risk Intelligence",
          product: PRODUCT_ID,
          provider: "circle_gateway_x402",
          environment: configured.config.environment,
          endpoint: new URL("/api/x402/circle/intelligence", request.url).toString(),
          x402_version: 2,
          scheme: configured.requirement.scheme,
          network: configured.requirement.network,
          asset: configured.requirement.asset,
          price_usdc: configured.config.priceUsdc,
          launch_state: "coordinated_launch_only",
          coverage: "data-driven; only currently deliverable and commercially eligible requests are payable",
          reconciliation_required: true,
          execution_authorized: false,
        });
      },
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await parseJsonBody(request);
        } catch (error) {
          if (error instanceof Response) {
            return json(
              {
                ok: false,
                chargeable: false,
                error: { code: "INVALID_AGENT_REQUEST", message: await error.text() },
                execution_authorized: false,
              },
              error.status,
            );
          }
          throw error;
        }

        const configured = await configuredCircleRequirement(request);
        if ("error" in configured) return configured.error;
        const { config, requirement, paymentRequired } = configured;

        if (
          !allowPublicDemoRequest(request, {
            namespace: "circle-x402-adaptive",
            windowMs: 60_000,
            maxPerClient: 20,
            maxGlobal: 200,
          })
        ) {
          return json(
            {
              ok: false,
              chargeable: false,
              error: { code: "X402_RATE_LIMITED", message: "Adaptive intelligence request limit exceeded." },
              execution_authorized: false,
            },
            429,
          );
        }

        let parsed: ReturnType<typeof agentAdaptiveQuerySchema.parse>;
        let plan: ReturnType<typeof buildAgentQueryPlan>;
        try {
          parsed = agentAdaptiveQuerySchema.parse(raw);
          plan = buildAgentQueryPlan(parsed);
        } catch (error) {
          if (error instanceof ZodError) {
            return json(
              {
                ok: false,
                chargeable: false,
                error: {
                  code: "INVALID_ADAPTIVE_QUERY",
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
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: "UNSUPPORTED_ADAPTIVE_QUERY",
                message: error instanceof Error ? error.message : "Query cannot be safely planned.",
              },
              execution_authorized: false,
            },
            400,
          );
        }

        let availability;
        try {
          availability = await checkAgentQueryDeliverability(plan, {
            externalModuleChecker: checkAgentQueryExternalModule,
          });
        } catch (error) {
          console.error("[circle-x402] pre-payment deliverability failed", error);
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: "AVAILABILITY_CHECK_UNAVAILABLE",
                message: "Deliverability could not be proven. Payment is disabled for this request.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        if (!availability.deliverable) {
          return json(
            {
              ok: false,
              chargeable: false,
              payment_required_now: false,
              availability,
              error: {
                code: availability.code,
                message: "Requested intelligence is not currently fully deliverable; no payment is accepted.",
              },
              execution_authorized: false,
            },
            422,
          );
        }

        const paymentToken = request.headers.get("payment-signature")?.trim() ?? "";
        if (!paymentToken) {
          return json(
            {
              ok: false,
              payment_required: true,
              price: `${config.priceUsdc} USDC`,
              network: requirement.network,
              asset: requirement.asset,
              execution_authorized: false,
            },
            402,
            { "PAYMENT-REQUIRED": encodePaymentHeader(paymentRequired) },
          );
        }
        if (new TextEncoder().encode(paymentToken).byteLength > MAX_PAYMENT_HEADER_BYTES) {
          return json(
            {
              ok: false,
              chargeable: false,
              error: { code: "PAYMENT_SIGNATURE_HEADER_TOO_LARGE", message: "Payment proof is too large." },
              execution_authorized: false,
            },
            400,
          );
        }

        let paymentPayload: unknown;
        try {
          paymentPayload = decodePaymentHeader(paymentToken);
        } catch (error) {
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: error instanceof Error ? error.message : "PAYMENT_SIGNATURE_INVALID",
                message: "Payment proof is not valid x402 JSON.",
              },
              execution_authorized: false,
            },
            400,
          );
        }

        const paymentFingerprint = commerceSha256(paymentToken);
        const requestFingerprint = commerceFingerprint({
          product: PRODUCT_ID,
          query_plan_hash: plan.query_plan_hash,
          request: parsed,
        });

        let claim;
        try {
          claim = await claimAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            requestFingerprint,
            productId: PRODUCT_ID,
            clientRequestId: parsed.client_request_id ?? null,
            sourceChannel: "circle_gateway_x402",
            rail: "circle_gateway_batch",
            network: requirement.network,
            asset: requirement.asset,
            amountAtomic: requirement.amount,
            recipientReference: requirement.payTo,
          });
        } catch (error) {
          console.error("[circle-x402] delivery claim failed", error);
          return json(
            {
              ok: false,
              error: { code: "AGENT_COMMERCE_DELIVERY_LEDGER_UNAVAILABLE", message: "Paid delivery ledger is unavailable." },
              execution_authorized: false,
            },
            503,
          );
        }

        if (claim.disposition === "CONFLICT") {
          return json(
            {
              ok: false,
              error: { code: "PAYMENT_REPLAY_CONFLICT", message: "This payment proof is already bound to a different query." },
              execution_authorized: false,
            },
            409,
          );
        }
        if (claim.disposition === "IN_PROGRESS") {
          return json(
            {
              ok: false,
              error: { code: "PAID_REQUEST_IN_PROGRESS", message: "This exact paid query is already processing." },
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
                code: "SETTLEMENT_RECONCILIATION_REQUIRED",
                message: "A prior settlement outcome is ambiguous; automatic re-charge is blocked.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        if (claim.disposition === "REPLAY" && claim.response_payload) {
          return json(
            replayResponse(
              claim.response_payload as Record<string, unknown>,
              claim.settlement_reference,
              claim.settlement_network,
            ),
            200,
          );
        }
        if (claim.disposition !== "CLAIMED" || !claim.claim_token) {
          return json(
            {
              ok: false,
              error: { code: "DELIVERY_CLAIM_FAILED", message: "Unable to claim this paid query." },
              execution_authorized: false,
            },
            503,
          );
        }
        const claimToken = claim.claim_token;

        let verification;
        try {
          verification = await verifyCircleGatewayProduction(paymentPayload, requirement);
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "CIRCLE_GATEWAY_VERIFY_UNAVAILABLE",
          });
          return json(
            {
              ok: false,
              error: { code: "CIRCLE_GATEWAY_VERIFY_UNAVAILABLE", message: "Payment verification is temporarily unavailable." },
              execution_authorized: false,
            },
            503,
          );
        }
        if (!verification.valid) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: verification.invalid_reason ?? "CIRCLE_GATEWAY_PAYMENT_INVALID",
          });
          return json(
            {
              ok: false,
              error: {
                code: "CIRCLE_GATEWAY_PAYMENT_INVALID",
                reason: verification.invalid_reason ?? "invalid_payment",
                message: "Payment authorization is invalid or insufficient.",
              },
              execution_authorized: false,
            },
            402,
            { "PAYMENT-REQUIRED": encodePaymentHeader(paymentRequired) },
          );
        }

        let finalAvailability;
        try {
          finalAvailability = await checkAgentQueryDeliverability(plan, {
            externalModuleChecker: checkAgentQueryExternalModule,
          });
        } catch {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "FINAL_AVAILABILITY_CHECK_FAILED",
          });
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: "FINAL_AVAILABILITY_CHECK_FAILED",
                message: "Final deliverability could not be proven; no settlement was attempted.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        if (!finalAvailability.deliverable) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: finalAvailability.code,
          });
          return json(
            {
              ok: false,
              chargeable: false,
              payment_required_now: false,
              availability: finalAvailability,
              error: {
                code: finalAvailability.code,
                message: "Deliverability changed before settlement; no settlement was attempted.",
              },
              execution_authorized: false,
            },
            422,
          );
        }

        const requestId = randomUUID();
        let responsePayload: Record<string, unknown>;
        try {
          const assembled = await assembleAgentQueryResponse({
            plan,
            requestId,
            clientRequestId: parsed.client_request_id ?? null,
          });
          responsePayload = {
            ...assembled,
            payment: {
              provider: "circle_gateway_x402",
              settled: true,
              amount_atomic: requirement.amount,
              amount_usdc: config.priceUsdc,
              asset: "USDC",
              asset_contract: CIRCLE_X402_BASE_MAINNET_USDC,
              network: requirement.network,
              recipient: requirement.payTo,
              accounting_state: "commercial_pending_accounting",
              reconciliation_required: true,
              idempotent_replay: false,
            },
            execution_authorized: false,
          };
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "INTELLIGENCE_ASSEMBLY_FAILED",
          });
          console.error("[circle-x402] response assembly failed before settlement", error);
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: "INTELLIGENCE_ASSEMBLY_FAILED",
                message: "Intelligence assembly failed before settlement; no payment was taken.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        let prepared;
        try {
          prepared = await prepareAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            responsePayload,
          });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "DELIVERY_PREPARE_FAILED",
          });
          console.error("[circle-x402] delivery prepare failed", error);
          return json(
            {
              ok: false,
              chargeable: false,
              error: { code: "DELIVERY_PREPARE_FAILED", message: "Delivery could not be prepared; no settlement was attempted." },
              execution_authorized: false,
            },
            503,
          );
        }

        let settlement;
        try {
          settlement = await settleCircleGatewayProduction(paymentPayload, requirement);
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "CIRCLE_GATEWAY_SETTLEMENT_AMBIGUOUS",
            manualReview: true,
          });
          console.error("[circle-x402] settlement outcome requires reconciliation", error);
          return json(
            {
              ok: false,
              error: {
                code: "CIRCLE_GATEWAY_SETTLEMENT_RECONCILIATION_REQUIRED",
                message: "Settlement outcome is ambiguous. Automatic retry is blocked pending reconciliation.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        if (!settlement.settlement_reference) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "CIRCLE_GATEWAY_SETTLEMENT_REFERENCE_MISSING",
            manualReview: true,
          });
          return json(
            {
              ok: false,
              error: {
                code: "CIRCLE_GATEWAY_SETTLEMENT_RECONCILIATION_REQUIRED",
                message: "Settlement succeeded without a durable reference. Delivery is held for reconciliation.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        try {
          await completeAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            payerReference: settlement.payer,
            settlementReference: settlement.settlement_reference,
            settlementNetwork: settlement.network,
          });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "circle_gateway_x402",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "CIRCLE_GATEWAY_POST_SETTLEMENT_LEDGER_FAILURE",
            manualReview: true,
          }).catch(() => undefined);
          console.error("[circle-x402] post-settlement delivery ledger failed", error);
          return json(
            {
              ok: false,
              error: {
                code: "CIRCLE_GATEWAY_POST_SETTLEMENT_RECONCILIATION_REQUIRED",
                message: "Payment settled but delivery accounting requires manual reconciliation.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        responsePayload.payment = {
          ...(responsePayload.payment as Record<string, unknown>),
          settlement_reference: settlement.settlement_reference,
          settlement_network: settlement.network,
          payer: settlement.payer,
        };

        let paymentEventId: string | null = null;
        try {
          paymentEventId = await recordCommercialPaymentEvent({
            environment: "mainnet",
            network_family: "evm",
            network_name: "Base",
            chain_id: "8453",
            provider: "circle_gateway_x402",
            provider_environment: "production",
            payment_method: "x402",
            payment_status: "settled",
            revenue_classification: "commercial_pending_accounting",
            provider_settlement_id: settlement.settlement_reference,
            asset_symbol: "USDC",
            asset_contract: CIRCLE_X402_BASE_MAINNET_USDC,
            amount_atomic: requirement.amount,
            amount_decimal: Number(config.priceUsdc),
            payer_reference: settlement.payer,
            recipient_reference: requirement.payTo,
            settled_at: new Date().toISOString(),
            reconciliation_status: "pending",
            commercial_revenue: false,
            metadata: {
              product: PRODUCT_ID,
              request_id: requestId,
              query_plan_hash: plan.query_plan_hash,
              response_sha256: prepared.responseSha256,
              execution_authorized: false,
            },
          });

          await recordCommercialUsageEvent({
            environment: "mainnet",
            access_surface: "agent_payment",
            payment_event_id: paymentEventId,
            request_id: requestId,
            capability: "adaptive_risk_intelligence_circle_x402",
            success: true,
            response_sha256: prepared.responseSha256,
            execution_authorized: false,
            metadata: {
              product: PRODUCT_ID,
              provider: "circle_gateway_x402",
              reconciliation_status: "pending",
            },
          });
        } catch (error) {
          console.error("[circle-x402] commercial telemetry persistence failed", error);
        }

        return json(responsePayload, 200, {
          "PAYMENT-RESPONSE": encodePaymentHeader({
            success: true,
            provider: "circle_gateway_x402",
            payer: settlement.payer,
            settlement_reference: settlement.settlement_reference,
            network: settlement.network,
            amount_atomic: requirement.amount,
            asset: "USDC",
            reconciliation_status: "pending",
          }),
        });
      },
    },
  },
});
