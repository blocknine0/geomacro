import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { AGENT_QUERY_TOPICS, agentAdaptiveQuerySchema, buildAgentQueryPlan } from "../lib/agent-query-plan";
import { checkAgentQueryDeliverability } from "../lib/agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "../lib/agent-query-external-modules.server";
import { assembleAgentQueryResponse } from "../lib/agent-query-response.server";
import {
  assertCoinbasePaymentBinding,
  bazaarExtensionOutcome,
  claimCoinbaseX402Delivery,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
  coinbaseX402PaymentRequirements,
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
import {
  finalizeCoinbaseX402AgentUsage,
  releaseCoinbaseX402AgentUsage,
  reserveCoinbaseX402AgentUsage,
} from "../lib/coinbase-x402-usage-guard.server";
import { upsertCoinbaseX402ProductAudit } from "../lib/coinbase-x402-product-audit.server";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";

const MAX_BODY_BYTES = 32 * 1024;
const PRODUCT_ID = "geomacro_adaptive_risk_intelligence_v1";

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

function adaptiveBazaarExtension(planHash: string) {
  return {
    bazaar: {
      info: {
        input: {
          type: "http",
          method: "POST",
          bodyType: "json",
          body: {
            question: "What are the current macro, FX and geopolitical risks for India?",
            subjects: [{ type: "country", country_iso3: "IND" }],
            topics: ["macro_risk", "fx_external_risk", "conflict_geopolitics"],
            max_age_seconds: 86400,
            detail: "standard",
          },
        },
        output: {
          type: "json",
          example: {
            schema_version: "geomacro.adaptive-intelligence-response.v1",
            product: PRODUCT_ID,
            query_plan_hash: planHash,
            execution_authorized: false,
          },
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: { type: "object" },
          output: { type: "object" },
        },
        required: ["input"],
      },
    },
    geomacro: {
      info: {
        product: PRODUCT_ID,
        query_plan_hash: planHash,
        execution_authorized: false,
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          product: { type: "string" },
          query_plan_hash: { type: "string" },
          execution_authorized: { type: "boolean", const: false },
        },
        required: ["product", "query_plan_hash", "execution_authorized"],
      },
    },
  };
}

function adaptivePaymentRequired(request: Request, config: CoinbaseX402Config, planHash: string) {
  const resourceUrl = new URL("/api/x402/intelligence", request.url).toString();
  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description:
        "Question-adaptive, source-governed geopolitical and macro risk intelligence for autonomous agents. Payment is offered only after no-charge deliverability validation.",
      mimeType: "application/json",
      serviceName: "Geomacro",
      tags: ["geopolitical-risk", "macro-risk", "country-risk", "hot-topics", "risk-gate", "ai-agents"],
    },
    accepts: [coinbaseX402PaymentRequirements(config)],
    extensions: adaptiveBazaarExtension(planHash),
  };
}

function assertAdaptiveQueryBinding(paymentPayload: Record<string, unknown>, planHash: string) {
  const extensions = paymentPayload.extensions;
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const geomacro = (extensions as Record<string, unknown>).geomacro;
  if (!geomacro || typeof geomacro !== "object" || Array.isArray(geomacro)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const extension = geomacro as Record<string, unknown>;
  const info = extension.info;
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const binding = info as Record<string, unknown>;
  if (binding.product !== PRODUCT_ID || binding.query_plan_hash !== planHash) {
    throw new Error("PAYMENT_QUERY_PLAN_MISMATCH");
  }
}

function paymentRequiredResponse(request: Request, config: CoinbaseX402Config, planHash: string) {
  const required = adaptivePaymentRequired(request, config, planHash);
  return json(required, 402, { "PAYMENT-REQUIRED": encodeX402Header(required) });
}

function replaySettlement(tx: string | null, network: string | null): CoinbaseSettleResult {
  return { success: true, transaction: tx ?? undefined, network: network ?? undefined, extra: { idempotentReplay: true } };
}

function finalResponse(
  prepared: Record<string, unknown>,
  settlement: CoinbaseSettleResult,
  config: CoinbaseX402Config,
  replayed = false,
) {
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
      idempotent_replay: replayed,
    },
  };
}

export const Route = createFileRoute("/api/x402/intelligence")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        let config: CoinbaseX402Config | null;
        try { config = getCoinbaseX402Config(); } catch (error) {
          return json({ ok: false, configured: false, error: error instanceof Error ? error.message : "Invalid x402 configuration", execution_authorized: false }, 503);
        }
        if (!config) return json({ ok: false, configured: false, execution_authorized: false }, 503);
        return json({
          ok: true,
          service: "Geomacro Adaptive Risk Intelligence",
          product: PRODUCT_ID,
          endpoint: new URL("/api/x402/intelligence", request.url).toString(),
          availability_endpoint: new URL("/api/x402/risk/availability", request.url).toString(),
          x402_version: 2,
          environment: config.environment,
          network: config.network,
          asset: "USDC",
          exact_price_usdc: config.priceUsdc,
          topics: AGENT_QUERY_TOPICS,
          coverage: "data-driven; only currently deliverable subjects are payable",
          execution_authorized: false,
        });
      },
      POST: async ({ request }) => {
        let raw: unknown;
        try { raw = await parseJsonBody(request); } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: { code: "INVALID_AGENT_REQUEST", message: await error.text() }, execution_authorized: false }, error.status);
          throw error;
        }

        let config: CoinbaseX402Config | null;
        try { config = getCoinbaseX402Config(); } catch (error) {
          return json({ ok: false, error: { code: "COINBASE_X402_CONFIGURATION_INVALID", message: error instanceof Error ? error.message : "Invalid x402 configuration" }, execution_authorized: false }, 503);
        }
        if (!config) return json({ ok: false, error: { code: "COINBASE_X402_NOT_CONFIGURED", message: "Coinbase x402 is not enabled." }, execution_authorized: false }, 503);

        if (!allowPublicDemoRequest(request, { namespace: "coinbase-x402-adaptive", windowMs: 60_000, maxPerClient: 20, maxGlobal: 200 })) {
          return json({ ok: false, error: { code: "X402_RATE_LIMITED", message: "Adaptive intelligence request limit exceeded." }, execution_authorized: false }, 429);
        }

        let parsed: ReturnType<typeof agentAdaptiveQuerySchema.parse>;
        let plan: ReturnType<typeof buildAgentQueryPlan>;
        try {
          parsed = agentAdaptiveQuerySchema.parse(raw);
          plan = buildAgentQueryPlan(parsed);
        } catch (error) {
          if (error instanceof ZodError) {
            return json({ ok: false, chargeable: false, error: { code: "INVALID_ADAPTIVE_QUERY", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, execution_authorized: false }, 400);
          }
          return json({ ok: false, chargeable: false, error: { code: "UNSUPPORTED_ADAPTIVE_QUERY", message: error instanceof Error ? error.message : "Query cannot be safely planned." }, execution_authorized: false }, 400);
        }

        let availability;
        try {
          availability = await checkAgentQueryDeliverability(plan, { externalModuleChecker: checkAgentQueryExternalModule });
        } catch (error) {
          console.error("[x402-adaptive] pre-payment deliverability failed", error);
          return json({ ok: false, chargeable: false, error: { code: "AVAILABILITY_CHECK_UNAVAILABLE", message: "Deliverability could not be proven. Payment is disabled for this request." }, execution_authorized: false }, 503);
        }
        if (!availability.deliverable) {
          return json({ ok: false, chargeable: false, payment_required_now: false, availability, error: { code: availability.code, message: "Requested intelligence is not currently fully deliverable; no payment is accepted." }, execution_authorized: false }, 422);
        }

        const paymentHeader = request.headers.get("payment-signature");
        if (!paymentHeader) return paymentRequiredResponse(request, config, plan.query_plan_hash);
        if (!config.apiKeyId || !config.apiKeySecret) {
          return json({ ok: false, error: { code: "CDP_API_CREDENTIALS_MISSING", message: "Coinbase CDP settlement credentials are not configured." }, execution_authorized: false }, 503);
        }

        let paymentPayload: Record<string, unknown>;
        try {
          paymentPayload = decodeCoinbasePaymentHeader(paymentHeader);
          assertCoinbasePaymentBinding(paymentPayload, config);
          assertAdaptiveQueryBinding(paymentPayload, plan.query_plan_hash);
        } catch (error) {
          return json({ ok: false, error: { code: "X402_PAYMENT_BINDING_INVALID", message: error instanceof Error ? error.message : "Payment proof does not match this query." }, execution_authorized: false }, 402, { "PAYMENT-REQUIRED": encodeX402Header(adaptivePaymentRequired(request, config, plan.query_plan_hash)) });
        }

        const paymentFingerprint = coinbasePaymentFingerprint(paymentPayload);
        const requestFingerprint = coinbaseRequestFingerprint({ product: PRODUCT_ID, query_plan_hash: plan.query_plan_hash, request: parsed });
        let claim;
        try {
          claim = await claimCoinbaseX402Delivery({ paymentFingerprint, requestFingerprint, clientRequestId: parsed.client_request_id ?? null, config });
        } catch (error) {
          console.error("[x402-adaptive] delivery claim failed", error);
          return json({ ok: false, error: { code: "X402_DELIVERY_LEDGER_UNAVAILABLE", message: "Paid delivery ledger is unavailable." }, execution_authorized: false }, 503);
        }

        if (claim.disposition === "CONFLICT") return json({ ok: false, error: { code: "X402_PAYMENT_REPLAY_CONFLICT", message: "This payment proof is already bound to a different query." }, execution_authorized: false }, 409);
        if (claim.disposition === "IN_PROGRESS") return json({ ok: false, error: { code: "X402_REQUEST_IN_PROGRESS", message: "This exact paid query is already processing." }, execution_authorized: false }, 409, { "Retry-After": "2" });
        if (claim.disposition === "MANUAL_REVIEW") return json({ ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "A prior settlement outcome is ambiguous; automatic re-charge is blocked." }, execution_authorized: false }, 503);
        if (claim.disposition === "REPLAY" && claim.response_payload) {
          const settlement = replaySettlement(claim.settlement_tx, claim.settlement_network);
          return json(finalResponse(claim.response_payload as Record<string, unknown>, settlement, config, true), 200, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
        }
        if (claim.disposition !== "CLAIMED" || !claim.claim_token) return json({ ok: false, error: { code: "X402_DELIVERY_CLAIM_FAILED", message: "Unable to claim this paid query." }, execution_authorized: false }, 503);
        const claimToken = claim.claim_token;

        let verified;
        try { verified = await verifyCoinbaseX402(paymentPayload, config); } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "CDP_VERIFY_FAILED" });
          return json({ ok: false, error: { code: "X402_VERIFY_UNAVAILABLE", message: "Coinbase payment verification is temporarily unavailable." }, execution_authorized: false }, 503);
        }
        if (!verified.isValid) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: verified.invalidReason ?? "CDP_VERIFY_INVALID" });
          return json({ ok: false, error: { code: "X402_PAYMENT_INVALID", reason: verified.invalidReason ?? "invalid_payment", message: verified.invalidMessage ?? "Payment authorization is invalid." }, execution_authorized: false }, 402, { "PAYMENT-REQUIRED": encodeX402Header(adaptivePaymentRequired(request, config, plan.query_plan_hash)) });
        }

        let usageReservation;
        try {
          usageReservation = await reserveCoinbaseX402AgentUsage({ paymentFingerprint, payer: verified.payer, config });
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "X402_USAGE_GUARD_UNAVAILABLE" });
          return json({ ok: false, chargeable: false, error: { code: "X402_USAGE_GUARD_UNAVAILABLE", message: "Agent spend controls could not be proven; settlement is disabled." }, execution_authorized: false }, 503);
        }
        if (!["RESERVED", "NOT_ENFORCED_TESTNET"].includes(usageReservation.disposition)) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: `X402_USAGE_${usageReservation.disposition}` });
          const status = usageReservation.disposition === "SPEND_LIMIT" || usageReservation.disposition === "REQUEST_LIMIT" ? 429 : 409;
          return json({ ok: false, chargeable: false, error: { code: `X402_USAGE_${usageReservation.disposition}`, message: "Agent spending or usage policy blocked this settlement." }, execution_authorized: false }, status);
        }

        let finalAvailability;
        try {
          finalAvailability = await checkAgentQueryDeliverability(plan, { externalModuleChecker: checkAgentQueryExternalModule });
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: "FINAL_AVAILABILITY_CHECK_FAILED" });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ ok: false, chargeable: false, error: { code: "FINAL_AVAILABILITY_CHECK_FAILED", message: "Final deliverability could not be proven; no settlement was attempted." }, execution_authorized: false }, 503);
        }
        if (!finalAvailability.deliverable) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: `FINAL_${finalAvailability.code}` });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ ok: false, chargeable: false, availability: finalAvailability, error: { code: `FINAL_${finalAvailability.code}`, message: "Required data changed before settlement; no payment was taken." }, execution_authorized: false }, 409);
        }

        const requestId = randomUUID();
        let prepared: Record<string, unknown>;
        try {
          const intelligence = await assembleAgentQueryResponse({ plan, requestId, clientRequestId: parsed.client_request_id ?? null });
          if (intelligence.execution_authorized !== false) throw new Error("EXECUTION_BOUNDARY_VIOLATION");
          prepared = {
            ...intelligence,
            availability: finalAvailability,
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
              query_plan_bound: true,
            },
          };
          await prepareCoinbaseX402Delivery({ paymentFingerprint, claimToken, responsePayload: prepared });
          await upsertCoinbaseX402ProductAudit({
            requestId,
            clientRequestId: parsed.client_request_id ?? null,
            paymentFingerprint,
            queryPlanHash: plan.query_plan_hash,
            productId: PRODUCT_ID,
            deliveredProductHash: String(intelligence.delivered_product_hash),
            status: "prepared",
            config,
          });
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "PRODUCT_PREPARATION_FAILED" });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ ok: false, chargeable: false, error: { code: "PRODUCT_PREPARATION_FAILED", message: "Requested intelligence could not be durably prepared; no settlement was attempted." }, execution_authorized: false }, 503);
        }

        let settlement: CoinbaseSettleResult;
        try { settlement = await settleCoinbaseX402(paymentPayload, config); } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "CDP_SETTLE_AMBIGUOUS", manualReview: true });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, true);
          try { await upsertCoinbaseX402ProductAudit({ requestId, clientRequestId: parsed.client_request_id ?? null, paymentFingerprint, queryPlanHash: plan.query_plan_hash, productId: PRODUCT_ID, deliveredProductHash: String(prepared.delivered_product_hash ?? ""), status: "manual_review", config }); } catch (auditError) { console.error("[x402-adaptive] manual review audit failed", auditError); }
          return json({ ok: false, error: { code: "X402_SETTLEMENT_AMBIGUOUS", message: "Settlement outcome is ambiguous. The proof is locked against automatic re-charge pending reconciliation." }, execution_authorized: false }, 503);
        }

        if (!settlement.success) {
          const duplicateWithTx = settlement.errorReason === "duplicate_settlement" && typeof settlement.transaction === "string" && /^0x[a-fA-F0-9]{64}$/.test(settlement.transaction);
          if (!duplicateWithTx) {
            const manual = settlement.errorReason === "duplicate_settlement";
            await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: settlement.errorReason ?? "CDP_SETTLEMENT_FAILED", manualReview: manual });
            if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, manual);
            return json({ ok: false, error: { code: manual ? "X402_SETTLEMENT_RECONCILIATION_REQUIRED" : "X402_PAYMENT_FAILED", reason: settlement.errorReason ?? "settlement_failed", message: manual ? "A prior settlement may exist without a safe transaction reference; automatic re-charge is blocked." : settlement.errorMessage ?? "Payment settlement failed." }, execution_authorized: false }, manual ? 503 : 402);
          }
          settlement = { ...settlement, success: true };
        }

        if (typeof settlement.transaction !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(settlement.transaction)) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: "CDP_SETTLEMENT_TX_MISSING", manualReview: true });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, true);
          return json({ ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Settlement reported success without a valid EVM transaction hash." }, execution_authorized: false }, 503);
        }

        try {
          await completeCoinbaseX402Delivery({ paymentFingerprint, claimToken, payer: settlement.payer ?? verified.payer ?? null, settlementTx: settlement.transaction, settlementNetwork: settlement.network ?? config.networkName });
          if (usageReservation.enforced) await finalizeCoinbaseX402AgentUsage(paymentFingerprint);
        } catch (error) {
          console.error("[x402-adaptive] post-settlement durable finalization failed", error);
          return json({ ok: false, error: { code: "X402_POST_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Payment settled but durable finalization requires reconciliation. Automatic re-charge remains blocked." }, settlement_reference: settlement.transaction, execution_authorized: false }, 503, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
        }

        const bazaar = bazaarExtensionOutcome(verified, settlement);
        await persistCoinbaseSettlementTelemetry({ requestId, payer: settlement.payer ?? verified.payer ?? null, settlementTx: settlement.transaction, settlementNetwork: settlement.network ?? config.networkName, config, paymentFingerprint, bazaarExtensionEchoed: paymentPayloadEchoesBazaar(paymentPayload), bazaarStatus: bazaar.status, bazaarRejectedReason: bazaar.rejectedReason });
        try {
          await upsertCoinbaseX402ProductAudit({ requestId, clientRequestId: parsed.client_request_id ?? null, paymentFingerprint, queryPlanHash: plan.query_plan_hash, productId: PRODUCT_ID, deliveredProductHash: String(prepared.delivered_product_hash ?? ""), settlementTx: settlement.transaction, status: "delivered", config });
        } catch (error) {
          console.error("[x402-adaptive] post-settlement audit projection failed; delivery ledger remains canonical", error);
        }

        return json(finalResponse(prepared, settlement, config), 200, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
      },
    },
  },
});
