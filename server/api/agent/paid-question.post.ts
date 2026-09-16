import { randomUUID } from "node:crypto";
import {
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import {
  AGENT_COMMERCE_BINDING_VERSION,
  agentCommercePaymentBinding,
  assertAgentCommercePaymentBinding,
} from "../../../src/lib/agent-commerce-binding.server";
import {
  claimAgentCommerceDelivery,
  completeAgentCommerceDelivery,
  prepareAgentCommerceDelivery,
  releaseAgentCommerceDelivery,
} from "../../../src/lib/agent-commerce-delivery.server";
import {
  agentAdaptiveQuerySchema,
  buildAgentQueryPlan,
} from "../../../src/lib/agent-query-plan";
import { checkAgentQueryDeliverability } from "../../../src/lib/agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "../../../src/lib/agent-query-external-modules.server";
import { assembleAgentQueryResponse } from "../../../src/lib/agent-query-response.server";
import {
  assertCoinbasePaymentBinding,
  bazaarExtensionOutcome,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
  coinbaseX402PaymentRequirements,
  coinbaseX402PaymentResponseHeader,
  decodeCoinbasePaymentHeader,
  encodeX402Header,
  getCoinbaseX402Config,
  paymentPayloadEchoesBazaar,
  persistCoinbaseSettlementTelemetry,
  settleCoinbaseX402,
  verifyCoinbaseX402,
  type CoinbaseSettleResult,
  type CoinbaseX402Config,
} from "../../../src/lib/coinbase-x402.server";
import {
  finalizeCoinbaseX402AgentUsage,
  releaseCoinbaseX402AgentUsage,
  reserveCoinbaseX402AgentUsage,
} from "../../../src/lib/coinbase-x402-usage-guard.server";
import { upsertCoinbaseX402ProductAudit } from "../../../src/lib/coinbase-x402-product-audit.server";

const MAX_BODY_BYTES = 32 * 1024;
const PRODUCT_ID = "geomacro_adaptive_risk_intelligence_v1";
const SOURCE_CHANNEL = "agent_paid_question";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function respond(event: Parameters<typeof setResponseStatus>[0], payload: unknown, status = 200, extra: Record<string, string> = {}) {
  setResponseStatus(event, status);
  setResponseHeaders(event, { ...baseHeaders, ...extra });
  return payload;
}

function adaptiveExtensions(paymentBinding: string) {
  return {
    bazaar: {
      info: {
        input: {
          type: "http",
          method: "POST",
          bodyType: "json",
          body: {
            question: "What are the current macro and FX risks for India?",
            subjects: [{ type: "country", country_iso3: "IND" }],
            topics: ["macro_risk", "fx_external_risk"],
            detail: "standard",
          },
        },
        output: {
          type: "json",
          example: {
            schema_version: "geomacro.adaptive-intelligence-response.v1",
            product: PRODUCT_ID,
            execution_authorized: false,
          },
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { input: { type: "object" }, output: { type: "object" } },
        required: ["input"],
      },
    },
    geomacro: {
      info: {
        product: PRODUCT_ID,
        binding_version: AGENT_COMMERCE_BINDING_VERSION,
        payment_binding: paymentBinding,
        execution_authorized: false,
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          product: { type: "string" },
          binding_version: { type: "string" },
          payment_binding: { type: "string" },
          execution_authorized: { type: "boolean", const: false },
        },
        required: ["product", "binding_version", "payment_binding", "execution_authorized"],
      },
    },
  };
}

function paymentRequired(event: Parameters<typeof setResponseStatus>[0], config: CoinbaseX402Config, paymentBinding: string) {
  const resourceUrl = new URL("/api/agent/paid-question", getRequestURL(event)).toString();
  const required = {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: "Exact question-bound Geomacro structured risk intelligence. Payment is offered only after deterministic planning and no-charge deliverability validation.",
      mimeType: "application/json",
      serviceName: "Geomacro",
      tags: ["geopolitical-risk", "macro-risk", "country-risk", "risk-gate", "ai-agents"],
    },
    accepts: [coinbaseX402PaymentRequirements(config)],
    extensions: adaptiveExtensions(paymentBinding),
  };
  return respond(event, required, 402, { "PAYMENT-REQUIRED": encodeX402Header(required) });
}

function assertQueryBinding(paymentPayload: Record<string, unknown>, expectedBinding: string) {
  const extensions = paymentPayload.extensions;
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const geomacro = (extensions as Record<string, unknown>).geomacro;
  if (!geomacro || typeof geomacro !== "object" || Array.isArray(geomacro)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const info = (geomacro as Record<string, unknown>).info;
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const binding = info as Record<string, unknown>;
  if (binding.product !== PRODUCT_ID || binding.binding_version !== AGENT_COMMERCE_BINDING_VERSION) {
    throw new Error("PAYMENT_QUERY_BINDING_VERSION_MISMATCH");
  }
  assertAgentCommercePaymentBinding(binding.payment_binding, expectedBinding);
}

function replaySettlement(reference: string | null, network: string | null): CoinbaseSettleResult {
  return {
    success: true,
    transaction: reference ?? undefined,
    network: network ?? undefined,
    extra: { idempotentReplay: true },
  };
}

function finalResponse(prepared: Record<string, unknown>, settlement: CoinbaseSettleResult, config: CoinbaseX402Config, replayed = false) {
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
      payer: replayed ? null : settlement.payer ?? null,
      settlement_reference: settlement.transaction ?? null,
      settlement_network: settlement.network ?? config.networkName,
      idempotent_replay: replayed,
      query_plan_bound: true,
      private_binding: true,
    },
    privacy: {
      question_sent_to_payment_provider: false,
      query_plan_hash_sent_to_payment_provider: false,
      payment_proof_persisted_raw: false,
      prepared_payload_encrypted_at_rest: true,
    },
    execution_authorized: false,
  };
}

function safeFailureCode(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : fallback;
  return /^[A-Z0-9_.:-]{3,160}$/.test(code) ? code : fallback;
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, baseHeaders);

  const type = getRequestHeader(event, "content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    return respond(event, { ok: false, error: { code: "INVALID_CONTENT_TYPE", message: "Content-Type must be application/json." }, execution_authorized: false }, 415);
  }
  const declared = Number(getRequestHeader(event, "content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return respond(event, { ok: false, error: { code: "REQUEST_TOO_LARGE", message: "Request body is too large." }, execution_authorized: false }, 413);
  }
  const rawText = (await readRawBody(event, "utf8")) ?? "";
  if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
    return respond(event, { ok: false, error: { code: "REQUEST_TOO_LARGE", message: "Request body is too large." }, execution_authorized: false }, 413);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return respond(event, { ok: false, error: { code: "INVALID_JSON", message: "Request body is not valid JSON." }, execution_authorized: false }, 400);
  }

  let config: CoinbaseX402Config | null;
  try {
    config = getCoinbaseX402Config();
  } catch {
    return respond(event, { ok: false, error: { code: "COINBASE_X402_CONFIGURATION_INVALID", message: "x402 configuration is invalid or launch-locked." }, execution_authorized: false }, 503);
  }
  if (!config) {
    return respond(event, { ok: false, error: { code: "COINBASE_X402_NOT_CONFIGURED", message: "Coinbase x402 is not enabled in this runtime." }, execution_authorized: false }, 503);
  }

  let parsed: ReturnType<typeof agentAdaptiveQuerySchema.parse>;
  let plan: ReturnType<typeof buildAgentQueryPlan>;
  try {
    parsed = agentAdaptiveQuerySchema.parse(raw);
    plan = buildAgentQueryPlan(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      return respond(event, {
        ok: false,
        chargeable: false,
        error: { code: "INVALID_ADAPTIVE_QUERY", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) },
        execution_authorized: false,
      }, 400);
    }
    return respond(event, { ok: false, chargeable: false, error: { code: "UNSUPPORTED_ADAPTIVE_QUERY", message: "Query cannot be safely planned." }, execution_authorized: false }, 400);
  }

  let availability;
  try {
    availability = await checkAgentQueryDeliverability(plan, { externalModuleChecker: checkAgentQueryExternalModule });
  } catch {
    return respond(event, { ok: false, chargeable: false, error: { code: "AVAILABILITY_CHECK_UNAVAILABLE", message: "Deliverability could not be proven. Payment is disabled for this request." }, execution_authorized: false }, 503);
  }
  if (!availability.deliverable) {
    return respond(event, { ok: false, chargeable: false, payment_required_now: false, availability, error: { code: availability.code, message: "Requested intelligence is not currently fully deliverable; no payment is accepted." }, execution_authorized: false }, 422);
  }

  let privatePaymentBinding: string;
  try {
    privatePaymentBinding = agentCommercePaymentBinding({
      productId: PRODUCT_ID,
      queryPlanHash: plan.query_plan_hash,
      amountAtomic: config.amountAtomic,
      network: config.network,
      asset: config.asset,
      payTo: config.payTo,
    });
  } catch {
    return respond(event, { ok: false, chargeable: false, error: { code: "PRIVATE_PAYMENT_BINDING_UNAVAILABLE", message: "Private question-to-payment binding is not configured. Payment is disabled." }, execution_authorized: false }, 503);
  }

  const paymentHeader = getRequestHeader(event, "payment-signature");
  if (!paymentHeader) return paymentRequired(event, config, privatePaymentBinding);
  if (!config.apiKeyId || !config.apiKeySecret) {
    return respond(event, { ok: false, error: { code: "CDP_API_CREDENTIALS_MISSING", message: "Coinbase CDP settlement credentials are not configured." }, execution_authorized: false }, 503);
  }

  let paymentPayload: Record<string, unknown>;
  try {
    paymentPayload = decodeCoinbasePaymentHeader(paymentHeader);
    assertCoinbasePaymentBinding(paymentPayload, config);
    assertQueryBinding(paymentPayload, privatePaymentBinding);
  } catch {
    return respond(event, { ok: false, error: { code: "X402_PAYMENT_BINDING_INVALID", message: "Payment proof does not match this exact private question binding and payment requirement." }, execution_authorized: false }, 402, { "PAYMENT-REQUIRED": encodeX402Header({ x402Version: 2, resource: { url: new URL("/api/agent/paid-question", getRequestURL(event)).toString() }, accepts: [coinbaseX402PaymentRequirements(config)], extensions: adaptiveExtensions(privatePaymentBinding) }) });
  }

  const paymentFingerprint = coinbasePaymentFingerprint(paymentPayload);
  const requestFingerprint = coinbaseRequestFingerprint({ product: PRODUCT_ID, query_plan_hash: plan.query_plan_hash, request: parsed });

  let claim;
  try {
    claim = await claimAgentCommerceDelivery({
      provider: "coinbase_x402",
      providerEnvironment: config.commercialEnvironment,
      paymentFingerprint,
      requestFingerprint,
      productId: PRODUCT_ID,
      clientRequestId: parsed.client_request_id ?? null,
      sourceChannel: SOURCE_CHANNEL,
      rail: "coinbase_cdp_exact",
      network: config.network,
      asset: config.asset,
      amountAtomic: config.amountAtomic,
      recipientReference: config.payTo,
    });
  } catch {
    return respond(event, { ok: false, error: { code: "X402_DELIVERY_LEDGER_UNAVAILABLE", message: "Encrypted paid-delivery ledger is unavailable." }, execution_authorized: false }, 503);
  }

  if (claim.disposition === "CONFLICT") return respond(event, { ok: false, error: { code: "X402_PAYMENT_REPLAY_CONFLICT", message: "This payment proof is already bound to a different query." }, execution_authorized: false }, 409);
  if (claim.disposition === "IN_PROGRESS") return respond(event, { ok: false, error: { code: "X402_REQUEST_IN_PROGRESS", message: "This exact paid query is already processing." }, execution_authorized: false }, 409, { "Retry-After": "2" });
  if (claim.disposition === "MANUAL_REVIEW") return respond(event, { ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "A prior settlement outcome is ambiguous; automatic re-charge is blocked." }, execution_authorized: false }, 503);
  if (claim.disposition === "REPLAY" && claim.response_payload) {
    const settlement = replaySettlement(claim.settlement_reference, claim.settlement_network);
    return respond(event, finalResponse(claim.response_payload as Record<string, unknown>, settlement, config, true), 200, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
  }
  if (claim.disposition !== "CLAIMED" || !claim.claim_token) {
    return respond(event, { ok: false, error: { code: "X402_DELIVERY_CLAIM_FAILED", message: "Unable to claim this paid query." }, execution_authorized: false }, 503);
  }
  const claimToken = claim.claim_token;

  let verified;
  try {
    verified = await verifyCoinbaseX402(paymentPayload, config);
  } catch (error) {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: safeFailureCode(error, "CDP_VERIFY_FAILED") });
    return respond(event, { ok: false, error: { code: "X402_VERIFY_UNAVAILABLE", message: "Coinbase payment verification is temporarily unavailable." }, execution_authorized: false }, 503);
  }
  if (!verified.isValid) {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: verified.invalidReason ?? "CDP_VERIFY_INVALID" });
    return paymentRequired(event, config, privatePaymentBinding);
  }

  let usageReservation;
  try {
    usageReservation = await reserveCoinbaseX402AgentUsage({ paymentFingerprint, payer: verified.payer, config });
  } catch (error) {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: safeFailureCode(error, "X402_USAGE_GUARD_UNAVAILABLE") });
    return respond(event, { ok: false, chargeable: false, error: { code: "X402_USAGE_GUARD_UNAVAILABLE", message: "Agent spend controls could not be proven; settlement is disabled." }, execution_authorized: false }, 503);
  }
  if (!["RESERVED", "NOT_ENFORCED_TESTNET"].includes(usageReservation.disposition)) {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: `X402_USAGE_${usageReservation.disposition}` });
    const status = usageReservation.disposition === "SPEND_LIMIT" || usageReservation.disposition === "REQUEST_LIMIT" ? 429 : 409;
    return respond(event, { ok: false, chargeable: false, error: { code: `X402_USAGE_${usageReservation.disposition}`, message: "Agent spending or usage policy blocked this settlement." }, execution_authorized: false }, status);
  }

  let finalAvailability;
  try {
    finalAvailability = await checkAgentQueryDeliverability(plan, { externalModuleChecker: checkAgentQueryExternalModule });
  } catch {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: "FINAL_AVAILABILITY_CHECK_FAILED" });
    if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
    return respond(event, { ok: false, chargeable: false, error: { code: "FINAL_AVAILABILITY_CHECK_FAILED", message: "Final deliverability could not be proven; no settlement was attempted." }, execution_authorized: false }, 503);
  }
  if (!finalAvailability.deliverable) {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: `FINAL_${finalAvailability.code}` });
    if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
    return respond(event, { ok: false, chargeable: false, availability: finalAvailability, error: { code: `FINAL_${finalAvailability.code}`, message: "Required data changed before settlement; no payment was taken." }, execution_authorized: false }, 409);
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
        payer: null,
        settlement_reference: null,
        bazaar_extension_echoed: paymentPayloadEchoesBazaar(paymentPayload),
        query_plan_bound: true,
        private_binding: true,
      },
    };
    await prepareAgentCommerceDelivery({
      provider: "coinbase_x402",
      providerEnvironment: config.commercialEnvironment,
      paymentFingerprint,
      claimToken,
      responsePayload: prepared,
    });
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
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: safeFailureCode(error, "PRODUCT_PREPARATION_FAILED") });
    if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
    return respond(event, { ok: false, chargeable: false, error: { code: "PRODUCT_PREPARATION_FAILED", message: "Requested intelligence could not be encrypted and durably prepared; no settlement was attempted." }, execution_authorized: false }, 503);
  }

  let settlement: CoinbaseSettleResult;
  try {
    settlement = await settleCoinbaseX402(paymentPayload, config);
  } catch (error) {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: safeFailureCode(error, "CDP_SETTLE_AMBIGUOUS"), manualReview: true });
    if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, true);
    try {
      await upsertCoinbaseX402ProductAudit({ requestId, clientRequestId: parsed.client_request_id ?? null, paymentFingerprint, queryPlanHash: plan.query_plan_hash, productId: PRODUCT_ID, deliveredProductHash: String(prepared.delivered_product_hash ?? ""), status: "manual_review", config });
    } catch {}
    return respond(event, { ok: false, error: { code: "X402_SETTLEMENT_AMBIGUOUS", message: "Settlement outcome is ambiguous. The proof is locked against automatic re-charge pending reconciliation." }, execution_authorized: false }, 503);
  }

  if (!settlement.success) {
    const duplicateWithTx = settlement.errorReason === "duplicate_settlement" && typeof settlement.transaction === "string" && /^0x[a-fA-F0-9]{64}$/.test(settlement.transaction);
    if (!duplicateWithTx) {
      const manual = settlement.errorReason === "duplicate_settlement";
      await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: settlement.errorReason ?? "CDP_SETTLEMENT_FAILED", manualReview: manual });
      if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, manual);
      return respond(event, { ok: false, error: { code: manual ? "X402_SETTLEMENT_RECONCILIATION_REQUIRED" : "X402_PAYMENT_FAILED", reason: settlement.errorReason ?? "settlement_failed", message: manual ? "A prior settlement may exist without a safe transaction reference; automatic re-charge is blocked." : settlement.errorMessage ?? "Payment settlement failed." }, execution_authorized: false }, manual ? 503 : 402);
    }
    settlement = { ...settlement, success: true };
  }

  if (typeof settlement.transaction !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(settlement.transaction)) {
    await releaseAgentCommerceDelivery({ provider: "coinbase_x402", providerEnvironment: config.commercialEnvironment, paymentFingerprint, claimToken, failureCode: "CDP_SETTLEMENT_TX_MISSING", manualReview: true });
    if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, true);
    return respond(event, { ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Settlement reported success without a valid EVM transaction hash." }, execution_authorized: false }, 503);
  }

  try {
    await completeAgentCommerceDelivery({
      provider: "coinbase_x402",
      providerEnvironment: config.commercialEnvironment,
      paymentFingerprint,
      claimToken,
      payerReference: settlement.payer ?? verified.payer ?? null,
      settlementReference: settlement.transaction,
      settlementNetwork: settlement.network ?? config.networkName,
    });
    if (usageReservation.enforced) await finalizeCoinbaseX402AgentUsage(paymentFingerprint);
  } catch {
    return respond(event, { ok: false, error: { code: "X402_POST_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Payment settled but durable finalization requires reconciliation. Automatic re-charge remains blocked." }, settlement_reference: settlement.transaction, execution_authorized: false }, 503, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
  }

  const bazaar = bazaarExtensionOutcome(verified, settlement);
  await persistCoinbaseSettlementTelemetry({
    requestId,
    payer: settlement.payer ?? verified.payer ?? null,
    settlementTx: settlement.transaction,
    settlementNetwork: settlement.network ?? config.networkName,
    config,
    paymentFingerprint,
    bazaarExtensionEchoed: paymentPayloadEchoesBazaar(paymentPayload),
    bazaarStatus: bazaar.status,
    bazaarRejectedReason: bazaar.rejectedReason,
  });
  try {
    await upsertCoinbaseX402ProductAudit({ requestId, clientRequestId: parsed.client_request_id ?? null, paymentFingerprint, queryPlanHash: plan.query_plan_hash, productId: PRODUCT_ID, deliveredProductHash: String(prepared.delivered_product_hash ?? ""), settlementTx: settlement.transaction, status: "delivered", config });
  } catch {}

  return respond(event, finalResponse(prepared, settlement, config), 200, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
});
