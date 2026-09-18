import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { agenticDemoRequestSchema } from "../lib/agentic-demo-contract";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
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
        return json({
          ok: true,
          service: "Geomacro Coinbase x402 Risk Pre-flight",
          role: config.environment === "production" ? "legacy_testnet_acceptance_only" : "base_sepolia_acceptance",
          x402_version: 2,
          endpoint: new URL("/api/x402/risk", request.url).toString(),
          production_endpoint: new URL("/api/x402/intelligence", request.url).toString(),
          availability_endpoint: new URL("/api/x402/risk/availability", request.url).toString(),
          environment: config.environment,
          network: config.network,
          asset: "USDC",
          price_usdc: config.priceUsdc,
          facilitator: "Coinbase CDP",
          bazaar_discovery: true,
          current_subject_scope: config.environment === "production"
            ? { payable_here: false, note: "Production purchases use the governed adaptive intelligence endpoint." }
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

        let config: CoinbaseX402Config | null;
        try { config = getCoinbaseX402Config(); } catch (error) {
          return json({ ok: false, error: { code: "COINBASE_X402_CONFIGURATION_INVALID", message: error instanceof Error ? error.message : "Invalid x402 configuration" }, execution_authorized: false }, 503);
        }
        if (!config) return json({ ok: false, error: { code: "COINBASE_X402_NOT_CONFIGURED", message: "Coinbase x402 is not enabled." }, execution_authorized: false }, 503);

        // The legacy acceptance resource can never take real mainnet USDC.
        // Production is exclusively routed through /api/x402/intelligence,
        // where query-specific coverage/licensing/freshness checks run before 402.
        if (config.environment === "production") {
          return json({
            ok: false,
            chargeable: false,
            payment_required_now: false,
            error: {
              code: "LEGACY_X402_PRODUCTION_DISABLED",
              message: "Use /api/x402/intelligence after a successful /api/x402/risk/availability check.",
            },
            production_endpoint: new URL("/api/x402/intelligence", request.url).toString(),
            execution_authorized: false,
          }, 410);
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

        // Strong invariant: a valid business request receives a 402 only if the
        // exact legacy product can be prepared now. Premium payload is not sent.
        try { await proveLegacyDeliverable(body); } catch (error) {
          return json({
            ok: false,
            chargeable: false,
            payment_required_now: false,
            error: { code: "RISK_RESOURCE_UNAVAILABLE", message: "Requested risk context is not currently deliverable; no payment is requested." },
            execution_authorized: false,
          }, 422);
        }

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
        const requestFingerprint = coinbaseRequestFingerprint(body);
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
