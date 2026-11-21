import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { agenticDemoRequestSchema } from "../lib/agentic-demo-contract";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import { paidX402CommercialAccess } from "../lib/risk-gate-commercial-access";
import {
  assertCoinbasePaymentBinding,
  bazaarExtensionOutcome,
  claimCoinbaseX402Delivery,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
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
  type CoinbaseX402Config,
  COINBASE_X402_ARC_MAINNET_NETWORK,
  COINBASE_X402_MAINNET_NETWORK,
  COINBASE_X402_POLYGON_MAINNET_NETWORK,
  COINBASE_X402_TIER_PRICING,
  type CoinbaseX402MainnetNetwork,
  type CoinbaseX402Tier,
} from "../lib/coinbase-x402.server";

const MAX_BODY_BYTES = 8 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Access-Control-Max-Age": "600",
};

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(payload, { status, headers: { ...corsHeaders, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders } });
}

async function parseJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) throw new Response("Content-Type must be application/json", { status: 415 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Response("Request body too large", { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Response("Request body too large", { status: 413 });
  try { return JSON.parse(raw) as unknown; } catch { throw new Response("Request body is not valid JSON", { status: 400 }); }
}

function paymentRequiredResponse(request: Request, config: CoinbaseX402Config) {
  const required = coinbaseX402PaymentRequired(request, config);
  return json(required, 402, { "PAYMENT-REQUIRED": encodeX402Header(required) });
}

function replaySettlement(tx: string | null, network: string | null): CoinbaseSettleResult {
  return { success: true, transaction: tx ?? undefined, network: network ?? undefined, extra: { idempotentReplay: true } };
}

function finalPaidResponse(prepared: Record<string, unknown>, settlement: CoinbaseSettleResult, config: CoinbaseX402Config, replayed = false) {
  const previous = prepared.payment && typeof prepared.payment === "object" && !Array.isArray(prepared.payment)
    ? prepared.payment as Record<string, unknown>
    : {};
  return {
    ...prepared,
    commercial_access: paidX402CommercialAccess(true),
    payment: {
      ...previous,
      required: true,
      provider: "coinbase_cdp_x402",
      asset: "USDC",
      asset_contract: config.asset,
      network: config.network,
      amount_atomic: config.amountAtomic,
      amount_usdc: config.priceUsdc,
      payer: settlement.payer ?? previous.payer ?? null,
      settlement_reference: settlement.transaction ?? previous.settlement_reference ?? null,
      settlement_network: settlement.network ?? config.networkName,
      bazaar_extension_echoed: previous.bazaar_extension_echoed ?? false,
      idempotent_replay: replayed,
    },
  };
}

async function proveLegacyDeliverable(body: ReturnType<typeof agenticDemoRequestSchema.parse>) {
  const result = await runAgenticPreflightDemo(body, { mode: "X402_PAID", recordTelemetry: false });
  if (result.risk_gate.execution_authorized !== false) throw new Error("RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
  return result;
}

export const Route = createFileRoute("/api/x402/risk")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        let config: CoinbaseX402Config | null;
        try { config = getCoinbaseX402Config(); } catch (error) {
          return json({ ok: false, service: "Geomacro Coinbase x402 Risk Pre-flight", configured: false, error: error instanceof Error ? error.message : "Invalid x402 configuration", execution_authorized: false }, 503);
        }
        if (!config) return json({ ok: false, service: "Geomacro Coinbase x402 Risk Pre-flight", configured: false, execution_authorized: false }, 503);
        const paymentOffers = (config.environment === "production"
          ? [COINBASE_X402_MAINNET_NETWORK, COINBASE_X402_POLYGON_MAINNET_NETWORK, COINBASE_X402_ARC_MAINNET_NETWORK]
          : [config.network]).flatMap((network) => (Object.keys(COINBASE_X402_TIER_PRICING) as CoinbaseX402Tier[]).map((tier) => {
          const offer = config.environment === "production"
            ? getCoinbaseX402Config({ tier, network: network as CoinbaseX402MainnetNetwork })
            : getCoinbaseX402Config({ tier });
          return offer ? { tier, network: offer.network, asset: "USDC", asset_contract: offer.asset, pay_to: offer.payTo, price_usdc: offer.priceUsdc, amount_atomic: offer.amountAtomic } : null;
        }).filter(Boolean));
        return json({
          ok: true,
          service: "Geomacro Coinbase x402 Risk Pre-flight",
          role: config.environment === "production" ? "mainnet_paid_risk_gate" : "base_sepolia_acceptance_only",
          x402_version: 2,
          endpoint: new URL("/api/x402/risk", request.url).toString(),
          production_endpoint: new URL("/api/v1/intelligence/query", request.url).toString(),
          availability_endpoint: new URL("/api/x402/risk/availability", request.url).toString(),
          environment: config.environment,
          network: config.network,
          asset: "USDC",
          price_usdc: config.priceUsdc,
          pricing_model: config.environment === "production" ? "FIXED_TIERED_MAINNET_USDC" : "TESTNET_ACCEPTANCE_ONLY",
          pricing: config.environment === "production" ? COINBASE_X402_TIER_PRICING : { TESTNET: config.priceUsdc },
          payment_offers: paymentOffers,
          output_contract: {
            agent_decision: { audience: "machine", description: "Risk Gate action decision; execution_authorized remains false." },
            analyst_brief: { audience: "human", description: "Plain-language reasoning and risk context." },
          },
          pricing_catalog: "/api/v1/pricing",
          facilitator: "Coinbase CDP",
          bazaar_discovery: true,
          current_subject_scope: config.environment === "production"
            ? { payable_here: true, minimum_countries: 47, categories: ["GEOPOLITICS", "MACRO_FX", "CRITICAL_MINERALS"] }
            : { countries: ["USA", "CHN"], corridors: ["USA>CHN", "CHN>USA"] },
          execution_authorized: false,
        });
      },
      POST: async ({ request }) => {
        let rawBody: unknown;
        try { rawBody = await parseJsonBody(request); } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: { code: "INVALID_AGENT_REQUEST", message: await error.text() }, execution_authorized: false }, error.status);
          throw error;
        }

        const requestOptions = rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
          ? rawBody as Record<string, unknown>
          : {};
        const tier = (requestOptions.tier ?? "BASIC") as CoinbaseX402Tier;
        const network = (requestOptions.network ?? COINBASE_X402_MAINNET_NETWORK) as CoinbaseX402MainnetNetwork;
        if (!Object.hasOwn(COINBASE_X402_TIER_PRICING, tier) || ![COINBASE_X402_MAINNET_NETWORK, COINBASE_X402_POLYGON_MAINNET_NETWORK, COINBASE_X402_ARC_MAINNET_NETWORK].includes(network)) {
          return json({ ok: false, error: { code: "X402_TIER_OR_NETWORK_INVALID", message: "Select BASIC, STANDARD, or COMPLEX and a supported Mainnet network." }, execution_authorized: false }, 400);
        }

        let config: CoinbaseX402Config | null;
        try { config = getCoinbaseX402Config(); } catch (error) {
          return json({ ok: false, error: { code: "COINBASE_X402_CONFIGURATION_INVALID", message: error instanceof Error ? error.message : "Invalid x402 configuration" }, execution_authorized: false }, 503);
        }
        if (!config) return json({ ok: false, error: { code: "COINBASE_X402_NOT_CONFIGURED", message: "Coinbase x402 is not enabled." }, execution_authorized: false }, 503);
        if (config.environment === "production") {
          try { config = getCoinbaseX402Config({ tier, network }); } catch (error) {
            return json({ ok: false, error: { code: "COINBASE_X402_CONFIGURATION_INVALID", message: error instanceof Error ? error.message : "Invalid x402 configuration" }, execution_authorized: false }, 503);
          }
        }

        if (!allowPublicDemoRequest(request, { namespace: "coinbase-x402-risk", windowMs: 60_000, maxPerClient: 30, maxGlobal: 300 })) {
          return json({ ok: false, error: { code: "X402_RATE_LIMITED", message: "Agent risk request limit exceeded." }, execution_authorized: false }, 429);
        }

        let body: ReturnType<typeof agenticDemoRequestSchema.parse>;
        try { body = agenticDemoRequestSchema.parse(rawBody); } catch (error) {
          if (error instanceof ZodError) {
            // Keep Coinbase validator discovery behavior on Base Sepolia only.
            if (!request.headers.get("payment-signature")) return paymentRequiredResponse(request, config);
            return json({ ok: false, error: { code: "INVALID_AGENT_REQUEST", message: "Agent request fields are invalid.", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, execution_authorized: false }, 400);
          }
          throw error;
        }

        // Challenge before any Risk Gate calculation. An unpaid request never
        // invokes the data-producing preflight and receives no gate fields.
        const paymentHeader = request.headers.get("payment-signature");
        if (!paymentHeader) return paymentRequiredResponse(request, config);

        if (!config.apiKeyId || !config.apiKeySecret) return json({ ok: false, error: { code: "CDP_API_CREDENTIALS_MISSING", message: "Coinbase CDP settlement credentials are not configured." }, execution_authorized: false }, 503);

        let paymentPayload: Record<string, unknown>;
        try {
          paymentPayload = decodeCoinbasePaymentHeader(paymentHeader);
          assertCoinbasePaymentBinding(paymentPayload, config);
        } catch (error) {
          return json({ ok: false, error: { code: "X402_PAYMENT_BINDING_INVALID", message: error instanceof Error ? error.message : "Payment payload does not match this resource." }, execution_authorized: false }, 402, { "PAYMENT-REQUIRED": encodeX402Header(coinbaseX402PaymentRequired(request, config)) });
        }

        const paymentFingerprint = coinbasePaymentFingerprint(paymentPayload);
        const requestFingerprint = coinbaseRequestFingerprint({ ...body, tier, network: config.network });
        let claim;
        try { claim = await claimCoinbaseX402Delivery({ paymentFingerprint, requestFingerprint, clientRequestId: body.client_request_id ?? null, config }); } catch (error) {
          console.error("[coinbase-x402] delivery claim failed", error);
          return json({ ok: false, error: { code: "X402_DELIVERY_LEDGER_UNAVAILABLE", message: "Paid delivery ledger is unavailable." }, execution_authorized: false }, 503);
        }

        if (claim.disposition === "CONFLICT") return json({ ok: false, error: { code: "X402_PAYMENT_REPLAY_CONFLICT", message: "This payment proof is already bound to a different request." }, execution_authorized: false }, 409);
        if (claim.disposition === "IN_PROGRESS") return json({ ok: false, error: { code: "X402_REQUEST_IN_PROGRESS", message: "This exact paid request is already processing." }, execution_authorized: false }, 409, { "Retry-After": "2" });
        if (claim.disposition === "MANUAL_REVIEW") return json({ ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "A previous settlement outcome is ambiguous; automatic re-charge is blocked." }, execution_authorized: false }, 503);
        if (claim.disposition === "REPLAY" && claim.response_payload) {
          const settlement = replaySettlement(claim.settlement_tx, claim.settlement_network);
          return json(finalPaidResponse(claim.response_payload as Record<string, unknown>, settlement, config, true), 200, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
        }
        if (claim.disposition !== "CLAIMED" || !claim.claim_token) return json({ ok: false, error: { code: "X402_DELIVERY_CLAIM_FAILED", message: "Unable to claim this paid request." }, execution_authorized: false }, 503);
        const claimToken = claim.claim_token;

        let verified;
        try { verified = await verifyCoinbaseX402(paymentPayload, config); } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "CDP_VERIFY_FAILED" });
          return json({ ok: false, error: { code: "X402_VERIFY_UNAVAILABLE", message: "Coinbase payment verification is temporarily unavailable." }, execution_authorized: false }, 503);
        }
        if (!verified.isValid) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: verified.invalidReason ?? "CDP_VERIFY_INVALID" });
          return json({ ok: false, error: { code: "X402_PAYMENT_INVALID", reason: verified.invalidReason ?? "invalid_payment", message: verified.invalidMessage ?? "Payment authorization is invalid." }, execution_authorized: false }, 402, { "PAYMENT-REQUIRED": encodeX402Header(coinbaseX402PaymentRequired(request, config)) });
        }

        let prepared: Record<string, unknown>;
        let preparedResponseSha256: string;
        try {
          if (claim.response_payload && typeof claim.response_payload === "object") {
            prepared = claim.response_payload as Record<string, unknown>;
          } else {
            // Final deliverability re-check immediately before irreversible settlement.
            const result = await proveLegacyDeliverable(body);
            prepared = {
              ...result,
              payment: {
                required: true,
                provider: "coinbase_cdp_x402",
                asset: "USDC",
                asset_contract: config.asset,
                network: config.network,
                tier: config.tier,
                amount_atomic: config.amountAtomic,
                amount_usdc: config.priceUsdc,
                payer: verified.payer ?? null,
                settlement_reference: null,
                bazaar_extension_echoed: paymentPayloadEchoesBazaar(paymentPayload),
                note:
                  config.commercialEnvironment === "testnet"
                    ? "Base Sepolia x402 acceptance-test payment. Testnet activity is non-revenue."
                    : "Base mainnet x402 production payment. Revenue remains pending until reconciliation.",
              },
            };
          }
          const preparedResult = await prepareCoinbaseX402Delivery({
            paymentFingerprint,
            claimToken,
            responsePayload: prepared,
          });
          preparedResponseSha256 = preparedResult.responseSha256;
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "RISK_RESOURCE_UNAVAILABLE" });
          return json({ ok: false, chargeable: false, error: { code: "RISK_RESOURCE_UNAVAILABLE", message: "Requested risk context changed or became unavailable before settlement; no payment was taken." }, execution_authorized: false }, 409);
        }

        let settlement: CoinbaseSettleResult;
        try { settlement = await settleCoinbaseX402(paymentPayload, config); } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "CDP_SETTLE_AMBIGUOUS", manualReview: true });
          return json({ ok: false, error: { code: "X402_SETTLEMENT_AMBIGUOUS", message: "Settlement could not be safely confirmed. This proof is locked against automatic re-charge." }, execution_authorized: false }, 503);
        }

        if (!settlement.success) {
          const duplicateWithTransaction = settlement.errorReason === "duplicate_settlement" && typeof settlement.transaction === "string" && /^0x[a-fA-F0-9]{64}$/.test(settlement.transaction);
          if (!duplicateWithTransaction) {
            const manual = settlement.errorReason === "duplicate_settlement";
            await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: settlement.errorReason ?? "CDP_SETTLEMENT_FAILED", manualReview: manual });
            return json({ ok: false, error: { code: manual ? "X402_SETTLEMENT_RECONCILIATION_REQUIRED" : "X402_PAYMENT_FAILED", reason: settlement.errorReason ?? "settlement_failed", message: manual ? "The authorization may already be settled; automatic re-charge is blocked." : settlement.errorMessage ?? "Payment settlement failed." }, execution_authorized: false }, manual ? 503 : 402);
          }
          settlement = { ...settlement, success: true };
        }

        if (typeof settlement.transaction !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(settlement.transaction)) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: "CDP_SETTLEMENT_TX_MISSING", manualReview: true });
          return json({ ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Settlement reported success without a valid transaction hash." }, execution_authorized: false }, 503);
        }

        try {
          await completeCoinbaseX402Delivery({ paymentFingerprint, claimToken, payer: settlement.payer ?? verified.payer ?? null, settlementTx: settlement.transaction, settlementNetwork: settlement.network ?? config.networkName });
        } catch (error) {
          console.error("[coinbase-x402] settlement completed but ledger finalization failed", error);
          return json({ ok: false, error: { code: "X402_POST_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Payment settled but durable finalization failed. Automatic re-charge remains blocked." }, settlement_reference: settlement.transaction, execution_authorized: false }, 503, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
        }

        const bazaar = bazaarExtensionOutcome(verified, settlement);
        await persistCoinbaseSettlementTelemetry({
          requestId: String(prepared.request_id ?? ""),
          payer: settlement.payer ?? verified.payer ?? null,
          settlementTx: settlement.transaction,
          settlementNetwork: settlement.network ?? config.networkName,
          config,
          paymentFingerprint,
          responseSha256: preparedResponseSha256,
          capability: "risk_preflight_coinbase_x402",
          bazaarExtensionEchoed: paymentPayloadEchoesBazaar(paymentPayload),
          bazaarStatus: bazaar.status,
          bazaarRejectedReason: bazaar.rejectedReason,
        });
        return json(finalPaidResponse(prepared, settlement, config), 200, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
      },
    },
  },
});
