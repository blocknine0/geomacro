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
import { recordCommercialPaymentEvent, recordCommercialUsageEvent } from "../lib/commercial-ops.server";
import {
  assessNeverminedSettlement,
  getNeverminedX402Config,
  neverminedPaymentRequired,
  settleNeverminedPermissions,
  verifyNeverminedPermissions,
  type NeverminedX402Config,
} from "../lib/nevermined-x402.server";
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

function paymentChallenge(config: NeverminedX402Config, request: Request) {
  const endpoint = new URL("/api/x402/nevermined/intelligence", request.url).toString();
  const required = neverminedPaymentRequired(config, endpoint);
  return {
    required,
    response: json(required, 402, { "PAYMENT-REQUIRED": encodePaymentHeader(required) }),
  };
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
      settlement_reference: settlementReference,
      settlement_network: settlementNetwork,
      idempotent_replay: true,
    },
  };
}

function paymentResponseHeader(input: {
  provider: string;
  settled: boolean;
  settlementReference: string;
  settlementNetwork: string | null;
}) {
  return encodePaymentHeader({
    provider: input.provider,
    success: input.settled,
    settlement_reference: input.settlementReference,
    network: input.settlementNetwork,
  });
}

function commercialEnvironment(config: NeverminedX402Config, network: string | null | undefined) {
  if (config.environment === "sandbox") return "sandbox" as const;
  return String(network ?? "").startsWith("eip155:") ? ("mainnet" as const) : ("fiat" as const);
}

function settlementTxHash(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(normalized) ? normalized : null;
}

export const Route = createFileRoute("/api/x402/nevermined/intelligence")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        let config: NeverminedX402Config | null;
        try {
          config = getNeverminedX402Config();
        } catch (error) {
          return json(
            {
              ok: false,
              configured: false,
              error: error instanceof Error ? error.message : "Invalid Nevermined configuration",
              execution_authorized: false,
            },
            503,
          );
        }
        if (!config) {
          return json({ ok: false, configured: false, execution_authorized: false }, 503);
        }
        const challenge = paymentChallenge(config, request).required;
        return json({
          ok: true,
          service: "Geomacro Adaptive Risk Intelligence",
          product: PRODUCT_ID,
          provider: "nevermined",
          environment: config.environment,
          endpoint: new URL("/api/x402/nevermined/intelligence", request.url).toString(),
          x402_version: 2,
          scheme: config.scheme,
          network: challenge.accepts[0]?.network ?? null,
          plan_id_configured: true,
          max_amount: config.maxAmount.toString(),
          commercial_revenue: false,
          launch_state: config.environment === "sandbox" ? "sandbox_prelaunch" : "coordinated_launch_only",
          coverage: "data-driven; only currently deliverable and commercially eligible requests are payable",
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

        let config: NeverminedX402Config | null;
        try {
          config = getNeverminedX402Config();
        } catch (error) {
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: "NEVERMINED_CONFIGURATION_INVALID",
                message: error instanceof Error ? error.message : "Invalid Nevermined configuration",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        if (!config) {
          return json(
            {
              ok: false,
              chargeable: false,
              error: { code: "NEVERMINED_NOT_CONFIGURED", message: "Nevermined x402 is not enabled." },
              execution_authorized: false,
            },
            503,
          );
        }

        if (
          !allowPublicDemoRequest(request, {
            namespace: "nevermined-x402-adaptive",
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
          console.error("[nevermined-x402] pre-payment deliverability failed", error);
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

        const { required: paymentRequired, response: unpaidResponse } = paymentChallenge(config, request);
        const paymentToken = request.headers.get("payment-signature")?.trim() ?? "";
        if (!paymentToken) return unpaidResponse;
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

        const paymentFingerprint = commerceSha256(paymentToken);
        const requestFingerprint = commerceFingerprint({
          product: PRODUCT_ID,
          query_plan_hash: plan.query_plan_hash,
          request: parsed,
        });
        const network = paymentRequired.accepts[0]?.network ?? null;

        let claim;
        try {
          claim = await claimAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            requestFingerprint,
            productId: PRODUCT_ID,
            clientRequestId: parsed.client_request_id ?? null,
            sourceChannel: "nevermined_x402",
            rail: config.scheme,
            network,
            asset: "NVM_PLAN_ENTITLEMENT",
            amountAtomic: config.maxAmount,
            recipientReference: config.planId,
          });
        } catch (error) {
          console.error("[nevermined-x402] delivery claim failed", error);
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
          const replay = replayResponse(
            claim.response_payload as Record<string, unknown>,
            claim.settlement_reference,
            claim.settlement_network,
          );
          return json(replay, 200);
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
          verification = await verifyNeverminedPermissions({ config, paymentRequired, token: paymentToken });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: error instanceof Error ? error.message : "NEVERMINED_VERIFY_UNAVAILABLE",
          });
          return json(
            {
              ok: false,
              error: { code: "NEVERMINED_VERIFY_UNAVAILABLE", message: "Payment verification is temporarily unavailable." },
              execution_authorized: false,
            },
            503,
          );
        }
        if (!verification.isValid) {
          await releaseAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: verification.invalidReason ?? "NEVERMINED_PAYMENT_INVALID",
          });
          return json(
            {
              ok: false,
              error: {
                code: "NEVERMINED_PAYMENT_INVALID",
                reason: verification.invalidReason ?? "invalid_payment",
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
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "nevermined",
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
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: `FINAL_${finalAvailability.code}`,
          });
          return json(
            {
              ok: false,
              chargeable: false,
              availability: finalAvailability,
              error: {
                code: `FINAL_${finalAvailability.code}`,
                message: "Required data changed before settlement; no payment was taken.",
              },
              execution_authorized: false,
            },
            409,
          );
        }

        const requestId = randomUUID();
        let prepared: Record<string, unknown>;
        let responseSha256: string;
        try {
          const intelligence = await assembleAgentQueryResponse({
            plan,
            requestId,
            clientRequestId: parsed.client_request_id ?? null,
          });
          if (intelligence.execution_authorized !== false) throw new Error("EXECUTION_BOUNDARY_VIOLATION");
          prepared = {
            ...intelligence,
            availability: finalAvailability,
            payment: {
              required: true,
              provider: "nevermined_x402",
              environment: config.environment,
              scheme: config.scheme,
              network,
              plan_bound: true,
              max_amount: config.maxAmount.toString(),
              payer: verification.payer ?? null,
              settlement_reference: null,
              settlement_network: null,
              idempotent_replay: false,
              commercial_revenue: false,
            },
          };
          const preparedResult = await prepareAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            responsePayload: prepared,
          });
          responseSha256 = preparedResult.responseSha256;
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: error instanceof Error ? error.message : "PRODUCT_PREPARATION_FAILED",
          });
          return json(
            {
              ok: false,
              chargeable: false,
              error: {
                code: "PRODUCT_PREPARATION_FAILED",
                message: "Requested intelligence could not be durably prepared; no settlement was attempted.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        let settlement;
        try {
          settlement = await settleNeverminedPermissions({
            config,
            paymentRequired,
            token: paymentToken,
            agentRequestId: verification.agentRequestId,
          });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: error instanceof Error ? error.message : "NEVERMINED_SETTLEMENT_AMBIGUOUS",
            manualReview: true,
          });
          return json(
            {
              ok: false,
              error: {
                code: "NEVERMINED_SETTLEMENT_AMBIGUOUS",
                message: "Settlement outcome is ambiguous. Automatic re-charge is blocked pending reconciliation.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        const assessed = assessNeverminedSettlement(settlement);
        if (!assessed.settled || !assessed.reference) {
          await releaseAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: assessed.reason ?? "NEVERMINED_SETTLEMENT_NOT_PROVEN",
            manualReview: true,
          });
          return json(
            {
              ok: false,
              error: {
                code: "NEVERMINED_SETTLEMENT_RECONCILIATION_REQUIRED",
                reason: assessed.reason,
                message: "Settlement was attempted but successful charging was not provable. Automatic retry is blocked.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        const settlementReference = assessed.reference;
        const settlementNetwork = settlement.network || network;
        try {
          await completeAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            payerReference: settlement.payer ?? verification.payer ?? null,
            settlementReference,
            settlementNetwork,
          });
        } catch (error) {
          await releaseAgentCommerceDelivery({
            provider: "nevermined",
            providerEnvironment: config.environment,
            paymentFingerprint,
            claimToken,
            failureCode: "NEVERMINED_POST_SETTLEMENT_LEDGER_FAILURE",
            manualReview: true,
          }).catch(() => undefined);
          console.error("[nevermined-x402] post-settlement durable finalization failed", error);
          return json(
            {
              ok: false,
              error: {
                code: "POST_SETTLEMENT_RECONCILIATION_REQUIRED",
                message: "Payment settled but durable finalization requires reconciliation. Automatic re-charge remains blocked.",
              },
              settlement_reference: settlementReference,
              execution_authorized: false,
            },
            503,
            {
              "PAYMENT-RESPONSE": paymentResponseHeader({
                provider: "nevermined_x402",
                settled: true,
                settlementReference,
                settlementNetwork,
              }),
            },
          );
        }

        const settledAt = new Date().toISOString();
        const environment = commercialEnvironment(config, settlementNetwork);
        try {
          const paymentEventId = await recordCommercialPaymentEvent({
            environment,
            network_family: String(settlementNetwork ?? "").startsWith("eip155:") ? "evm" : "offchain",
            network_name: settlementNetwork,
            provider: "nevermined_x402",
            provider_environment: config.environment,
            payment_method: config.scheme,
            payment_status: "settled",
            revenue_classification:
              config.environment === "sandbox" ? "sandbox_non_revenue" : "commercial_pending_accounting",
            provider_payment_id: paymentFingerprint,
            provider_settlement_id: settlementReference,
            idempotency_key: paymentFingerprint,
            asset_symbol: settlement.billingModel === "credits" ? "NVM_CREDITS" : null,
            payer_reference: settlement.payer ?? verification.payer ?? null,
            recipient_reference: config.planId,
            tx_hash: settlementTxHash(settlement.transaction),
            settled_at: settledAt,
            reconciliation_status: config.environment === "sandbox" ? "not_applicable" : "pending",
            commercial_revenue: false,
            metadata: {
              product: PRODUCT_ID,
              request_id: requestId,
              query_plan_hash: plan.query_plan_hash,
              billing_model: settlement.billingModel ?? "legacy_credits",
              credits_redeemed: settlement.creditsRedeemed ?? null,
              response_sha256: responseSha256,
              execution_authorized: false,
              prelaunch: true,
            },
          });
          await recordCommercialUsageEvent({
            environment,
            access_surface: "agent_payment",
            payment_event_id: paymentEventId,
            request_id: requestId,
            capability: "adaptive_risk_intelligence_nevermined_x402",
            credits_charged:
              Number.isFinite(Number(settlement.creditsRedeemed)) && Number(settlement.creditsRedeemed) > 0
                ? Number(settlement.creditsRedeemed)
                : 0,
            success: true,
            response_sha256: responseSha256,
            execution_authorized: false,
            shareable: false,
            metadata: {
              provider: "nevermined_x402",
              provider_environment: config.environment,
              scheme: config.scheme,
              query_plan_hash: plan.query_plan_hash,
              source_channel: "nevermined_x402",
              prelaunch: true,
            },
          });
        } catch (error) {
          console.error("[nevermined-x402] telemetry persistence failed; delivery ledger remains canonical", error);
        }

        const final = {
          ...prepared,
          payment: {
            ...((prepared.payment as Record<string, unknown>) ?? {}),
            settled: true,
            payer: settlement.payer ?? verification.payer ?? null,
            settlement_reference: settlementReference,
            settlement_network: settlementNetwork,
            billing_model: settlement.billingModel ?? "legacy_credits",
            credits_redeemed: settlement.creditsRedeemed ?? null,
            idempotent_replay: false,
            commercial_revenue: false,
          },
        };
        return json(final, 200, {
          "PAYMENT-RESPONSE": paymentResponseHeader({
            provider: "nevermined_x402",
            settled: true,
            settlementReference,
            settlementNetwork,
          }),
        });
      },
    },
  },
});
