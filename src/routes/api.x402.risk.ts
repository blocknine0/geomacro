import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { agenticDemoRequestSchema } from "../lib/agentic-demo-contract";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import {
  assertCoinbasePaymentBinding,
  claimCoinbaseX402Delivery,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
  coinbaseX402ExtensionResponsesHeader,
  coinbaseX402PaymentRequired,
  coinbaseX402PaymentResponseHeader,
  completeCoinbaseX402Delivery,
  decodeCoinbasePaymentHeader,
  encodeX402Header,
  getCoinbaseX402Config,
  paymentPayloadEchoesBazaar,
  persistCoinbaseSettlementTelemetry,
  prepareCoinbaseX402Delivery,
  releaseCoinbaseX402DeliveryForRetry,
  settleCoinbaseX402,
  verifyCoinbaseX402,
  type CoinbaseSettleResult,
} from "../lib/coinbase-x402.server";

const MAX_BODY_BYTES = 8 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, EXTENSION-RESPONSES",
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

function paymentRequiredResponse(request: Request, config: NonNullable<ReturnType<typeof getCoinbaseX402Config>>) {
  const paymentRequired = coinbaseX402PaymentRequired(request, config);
  return json(paymentRequired, 402, {
    "PAYMENT-REQUIRED": encodeX402Header(paymentRequired),
  });
}

function finalPaidResponse(
  prepared: Record<string, unknown>,
  settlement: CoinbaseSettleResult,
  config: NonNullable<ReturnType<typeof getCoinbaseX402Config>>,
  replayed = false,
) {
  const previousPayment =
    prepared.payment && typeof prepared.payment === "object" && !Array.isArray(prepared.payment)
      ? (prepared.payment as Record<string, unknown>)
      : {};
  return {
    ...prepared,
    payment: {
      ...previousPayment,
      required: true,
      provider: "coinbase_cdp_x402",
      asset: "USDC",
      asset_contract: config.asset,
      network: config.network,
      amount_atomic: config.amountAtomic,
      amount_usdc: config.priceUsdc,
      payer: settlement.payer ?? previousPayment.payer ?? null,
      settlement_reference: settlement.transaction ?? previousPayment.settlement_reference ?? null,
      settlement_network: settlement.network ?? config.networkName,
      bazaar_extension_echoed: previousPayment.bazaar_extension_echoed ?? false,
      idempotent_replay: replayed,
    },
  };
}

function replaySettlement(
  settlementTx: string | null,
  settlementNetwork: string | null,
): CoinbaseSettleResult {
  return {
    success: true,
    transaction: settlementTx ?? undefined,
    network: settlementNetwork ?? undefined,
    extra: { idempotentReplay: true },
  };
}

export const Route = createFileRoute("/api/x402/risk")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        let config;
        try {
          config = getCoinbaseX402Config();
        } catch (error) {
          return json(
            {
              ok: false,
              service: "Geomacro Coinbase x402 Risk Pre-flight",
              configured: false,
              error: error instanceof Error ? error.message : "Invalid Coinbase x402 configuration",
              execution_authorized: false,
            },
            503,
          );
        }
        if (!config) {
          return json(
            {
              ok: false,
              service: "Geomacro Coinbase x402 Risk Pre-flight",
              configured: false,
              execution_authorized: false,
            },
            503,
          );
        }
        return json({
          ok: true,
          service: "Geomacro Coinbase x402 Risk Pre-flight",
          x402_version: 2,
          endpoint: new URL("/api/x402/risk", request.url).toString(),
          method: "POST",
          environment: config.environment,
          network: config.network,
          asset: "USDC",
          price_usdc: config.priceUsdc,
          facilitator: "Coinbase CDP",
          bazaar_discovery: true,
          current_subject_scope: {
            countries: ["USA", "CHN"],
            corridors: ["USA>CHN", "CHN>USA"],
          },
          execution_authorized: false,
        });
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
                error: { code: "INVALID_AGENT_REQUEST", message: await error.text() },
                execution_authorized: false,
              },
              error.status,
            );
          }
          throw error;
        }

        let config;
        try {
          config = getCoinbaseX402Config();
        } catch (error) {
          return json(
            {
              ok: false,
              error: {
                code: "COINBASE_X402_CONFIGURATION_INVALID",
                message: error instanceof Error ? error.message : "Coinbase x402 configuration is invalid.",
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
              error: {
                code: "COINBASE_X402_NOT_CONFIGURED",
                message: "Coinbase x402 is not enabled in this runtime.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        if (
          !allowPublicDemoRequest(request, {
            namespace: "coinbase-x402-risk",
            windowMs: 60_000,
            maxPerClient: 30,
            maxGlobal: 300,
          })
        ) {
          return json(
            {
              ok: false,
              error: { code: "X402_RATE_LIMITED", message: "Agent risk request limit exceeded." },
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

        const paymentHeader = request.headers.get("payment-signature");
        if (!paymentHeader) return paymentRequiredResponse(request, config);
        if (!config.apiKeyId || !config.apiKeySecret) {
          return json(
            {
              ok: false,
              error: {
                code: "CDP_API_CREDENTIALS_MISSING",
                message: "Coinbase CDP settlement credentials are not configured.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        let paymentPayload: Record<string, unknown>;
        try {
          paymentPayload = decodeCoinbasePaymentHeader(paymentHeader);
          assertCoinbasePaymentBinding(paymentPayload, config);
        } catch (error) {
          return json(
            {
              ok: false,
              error: {
                code: "X402_PAYMENT_BINDING_INVALID",
                message: error instanceof Error ? error.message : "Payment payload does not match this resource.",
              },
              execution_authorized: false,
            },
            402,
            {
              "PAYMENT-REQUIRED": encodeX402Header(coinbaseX402PaymentRequired(request, config)),
            },
          );
        }

        const paymentFingerprint = coinbasePaymentFingerprint(paymentPayload);
        const requestFingerprint = coinbaseRequestFingerprint(body);
        let claim;
        try {
          claim = await claimCoinbaseX402Delivery({
            paymentFingerprint,
            requestFingerprint,
            clientRequestId: body.client_request_id ?? null,
            config,
          });
        } catch (error) {
          console.error("[coinbase-x402] delivery claim failed", error);
          return json(
            {
              ok: false,
              error: { code: "X402_DELIVERY_LEDGER_UNAVAILABLE", message: "Paid delivery ledger is unavailable." },
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
              error: { code: "X402_REQUEST_IN_PROGRESS", message: "This exact paid request is already processing." },
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
                message: "A previous settlement attempt had an ambiguous external outcome and is locked against automatic re-charge.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        if (claim.disposition === "REPLAY" && claim.response_payload) {
          const settlement = replaySettlement(claim.settlement_tx, claim.settlement_network);
          const response = finalPaidResponse(
            claim.response_payload as Record<string, unknown>,
            settlement,
            config,
            true,
          );
          return json(response, 200, {
            "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement),
          });
        }
        if (claim.disposition !== "CLAIMED" || !claim.claim_token) {
          return json(
            {
              ok: false,
              error: { code: "X402_DELIVERY_CLAIM_FAILED", message: "Unable to claim this paid request." },
              execution_authorized: false,
            },
            503,
          );
        }

        const claimToken = claim.claim_token;
        let verified;
        try {
          verified = await verifyCoinbaseX402(paymentPayload, config);
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({
            paymentFingerprint,
            claimToken,
            failureCode: error instanceof Error ? error.message : "CDP_VERIFY_FAILED",
          });
          return json(
            {
              ok: false,
              error: {
                code: "X402_VERIFY_UNAVAILABLE",
                message: "Coinbase payment verification is temporarily unavailable.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
        if (!verified.isValid) {
          await releaseCoinbaseX402DeliveryForRetry({
            paymentFingerprint,
            claimToken,
            failureCode: verified.invalidReason ?? "CDP_VERIFY_INVALID",
          });
          return json(
            {
              ok: false,
              error: {
                code: "X402_PAYMENT_INVALID",
                reason: verified.invalidReason ?? "invalid_payment",
                message: verified.invalidMessage ?? "Payment authorization is not valid.",
              },
              execution_authorized: false,
            },
            402,
            { "PAYMENT-REQUIRED": encodeX402Header(coinbaseX402PaymentRequired(request, config)) },
          );
        }

        let prepared: Record<string, unknown>;
        if (claim.response_payload && typeof claim.response_payload === "object") {
          prepared = claim.response_payload as Record<string, unknown>;
        } else {
          try {
            const result = await runAgenticPreflightDemo(body, {
              mode: "X402_PAID",
              recordTelemetry: false,
            });
            if (result.risk_gate.execution_authorized !== false) {
              throw new Error("Risk Gate execution boundary violated before settlement");
            }
            prepared = {
              ...result,
              payment: {
                required: true,
                provider: "coinbase_cdp_x402",
                asset: "USDC",
                asset_contract: config.asset,
                network: config.network,
                amount_atomic: config.amountAtomic,
                amount_usdc: config.priceUsdc,
                payer: verified.payer ?? null,
                settlement_reference: null,
                bazaar_extension_echoed: paymentPayloadEchoesBazaar(paymentPayload),
                note:
                  config.environment === "production"
                    ? "Real USDC payment through Coinbase CDP x402 on Base. Risk Gate is advisory and never executes the financial action."
                    : "Base Sepolia x402 acceptance-test payment through Coinbase CDP. Testnet activity is non-revenue.",
              },
            };
            await prepareCoinbaseX402Delivery({
              paymentFingerprint,
              claimToken,
              responsePayload: prepared,
            });
          } catch (error) {
            await releaseCoinbaseX402DeliveryForRetry({
              paymentFingerprint,
              claimToken,
              failureCode: error instanceof Error ? error.message : "RISK_RESOURCE_UNAVAILABLE",
            });
            const message = error instanceof Error ? error.message : "Requested risk resource is unavailable.";
            const unsupported = message.startsWith("Public demo currently supports");
            return json(
              {
                ok: false,
                error: {
                  code: unsupported ? "DEMO_SUBJECT_NOT_ENABLED" : "RISK_RESOURCE_UNAVAILABLE",
                  message: unsupported ? message : "Requested risk context is temporarily unavailable.",
                },
                execution_authorized: false,
              },
              unsupported ? 400 : 503,
            );
          }
        }

        let settlement: CoinbaseSettleResult;
        try {
          settlement = await settleCoinbaseX402(paymentPayload, config);
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({
            paymentFingerprint,
            claimToken,
            failureCode: error instanceof Error ? error.message : "CDP_SETTLE_AMBIGUOUS",
            manualReview: true,
          });
          return json(
            {
              ok: false,
              error: {
                code: "X402_SETTLEMENT_AMBIGUOUS",
                message:
                  "The facilitator settlement response was not safely confirmed. This payment proof is locked against automatic re-charge pending reconciliation.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        if (!settlement.success) {
          const duplicateWithTransaction =
            settlement.errorReason === "duplicate_settlement" &&
            typeof settlement.transaction === "string" &&
            /^0x[a-fA-F0-9]{64}$/.test(settlement.transaction);
          if (!duplicateWithTransaction) {
            await releaseCoinbaseX402DeliveryForRetry({
              paymentFingerprint,
              claimToken,
              failureCode: settlement.errorReason ?? "CDP_SETTLEMENT_FAILED",
              manualReview: settlement.errorReason === "duplicate_settlement",
            });
            return json(
              {
                ok: false,
                error: {
                  code:
                    settlement.errorReason === "duplicate_settlement"
                      ? "X402_SETTLEMENT_RECONCILIATION_REQUIRED"
                      : "X402_PAYMENT_FAILED",
                  reason: settlement.errorReason ?? "settlement_failed",
                  message:
                    settlement.errorReason === "duplicate_settlement"
                      ? "The payment authorization was previously settled but no safe transaction reference was returned. Automatic re-charge is blocked."
                      : settlement.errorMessage ?? "Payment settlement failed.",
                },
                execution_authorized: false,
              },
              settlement.errorReason === "duplicate_settlement" ? 503 : 402,
            );
          }
          settlement = { ...settlement, success: true };
        }

        if (
          typeof settlement.transaction !== "string" ||
          !/^0x[a-fA-F0-9]{64}$/.test(settlement.transaction)
        ) {
          await releaseCoinbaseX402DeliveryForRetry({
            paymentFingerprint,
            claimToken,
            failureCode: "CDP_SETTLEMENT_TX_MISSING",
            manualReview: true,
          });
          return json(
            {
              ok: false,
              error: {
                code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED",
                message: "Settlement reported success without a valid EVM transaction hash.",
              },
              execution_authorized: false,
            },
            503,
          );
        }

        try {
          await completeCoinbaseX402Delivery({
            paymentFingerprint,
            claimToken,
            payer: settlement.payer ?? verified.payer ?? null,
            settlementTx: settlement.transaction,
            settlementNetwork: settlement.network ?? config.networkName,
          });
        } catch (error) {
          console.error("[coinbase-x402] settlement completed but delivery ledger finalization failed", error);
          return json(
            {
              ok: false,
              error: {
                code: "X402_POST_SETTLEMENT_RECONCILIATION_REQUIRED",
                message:
                  "Payment settled, but durable delivery finalization failed. The request is fail-closed to avoid a second settlement attempt.",
              },
              settlement_reference: settlement.transaction,
              execution_authorized: false,
            },
            503,
            { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) },
          );
        }

        await persistCoinbaseSettlementTelemetry({
          requestId: String(prepared.request_id ?? ""),
          payer: settlement.payer ?? verified.payer ?? null,
          settlementTx: settlement.transaction,
          settlementNetwork: settlement.network ?? config.networkName,
          config,
          paymentFingerprint,
          bazaarExtensionEchoed: paymentPayloadEchoesBazaar(paymentPayload),
        });

        const response = finalPaidResponse(prepared, settlement, config);
        const headers: Record<string, string> = {
          "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement),
        };
        const extensionResponses = coinbaseX402ExtensionResponsesHeader(settlement);
        if (extensionResponses) headers["EXTENSION-RESPONSES"] = extensionResponses;
        return json(response, 200, headers);
      },
    },
  },
});
