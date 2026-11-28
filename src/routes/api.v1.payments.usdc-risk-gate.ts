import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { canonicalRiskObjectJson } from "../lib/risk-object-signing.server";
import { fetchWithoutRedirect } from "../lib/fetch-without-redirect";
import {
  GEOMACRO_MAINNET_USDC_RECIPIENT,
  MAINNET_USDC_PAY_PER_CALL_CHAINS,
  verifyMainnetUsdcTransferReceipt,
  type MainnetUsdcChainId,
} from "../lib/direct-usdc-pay-per-call.server";

const FALLBACK = "https://geomacro-control-plane.daspallab202391.workers.dev";
const HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature, X-PAYMENT, x-payment",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
};
const CATEGORIES = {
  GEOPOLITICS: "geopolitics",
  geopolitics: "geopolitics",
  MACRO_FX: "macro_fx",
  "macro-fx": "macro_fx",
  macro_fx: "macro_fx",
  CRITICAL_MINERALS: "critical_minerals",
  "critical-minerals": "critical_minerals",
  critical_minerals: "critical_minerals",
} as const;
const TIERS = new Set(["basic_focused", "standard", "complex_full"]);
const TIER_ALIASES = { BASIC: "basic_focused", STANDARD: "standard", COMPLEX: "complex_full" } as const;
const PRICE_BY_TIER = {
  basic_focused: { usdc: "0.15", atomic: "150000" },
  standard: { usdc: "0.20", atomic: "200000" },
  complex_full: { usdc: "0.30", atomic: "300000" },
} as const;
const DEFAULT_POLICY = {
  policy_id: "geomacro-direct-risk-gate-default",
  policy_version: "v1",
  continue_max_score: 35,
  reduce_limit_max_score: 55,
  require_approval_max_score: 75,
  minimum_confidence_for_auto_continue: 0.8,
  require_commercial_verification_for_continue: true,
  max_positive_delta_for_auto_continue: 5,
};
const DECISION_SUPPORT_NOTICE =
  "Decision support only. GeoMacro does not initiate, authorize, approve, or execute any payment, trade, or transaction. All execution decisions, actions, and resulting outcomes remain the sole responsibility of the user or AI agent.";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const bad = (error: string, status: number, extra?: Record<string, unknown>) =>
  Response.json(
    {
      ok: false,
      error,
      execution_authorized: false,
      chargeable: false,
      decision_support_notice: DECISION_SUPPORT_NOTICE,
      ...extra,
    },
    { status, headers: HEADERS },
  );

async function resolveDecisionKey(origin: string, fetcher: typeof fetchWithoutRedirect) {
  const response = await fetcher(origin + "/v1/public/risk-gate-decision-key", {
    method: "GET",
    redirect: "manual",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(2500),
  });
  if (response.status !== 200 || response.redirected) {
    throw new Error("RISK_GATE_DECISION_KEY_UNAVAILABLE");
  }
  const value = (await response.json()) as Record<string, unknown>;
  if (
    value.ok !== true ||
    value.schema !== "geomacro.risk-gate-decision-key.v1" ||
    value.scheme !== "Ed25519" ||
    typeof value.key_id !== "string" ||
    typeof value.public_key_spki_b64 !== "string"
  ) {
    throw new Error("RISK_GATE_DECISION_KEY_INVALID");
  }
  return { key: value.public_key_spki_b64, id: value.key_id };
}

function validateSignedDecision(value: Record<string, unknown>, keySpki: string, keyId: string) {
  const payload = value.decision_signed_payload;
  if (
    !isRecord(payload) ||
    value.ok !== true ||
    value.execution_authorized !== false ||
    value.decision_signature_scheme !== "Ed25519" ||
    value.decision_signature_key_id !== keyId ||
    typeof value.decision_signature_b64 !== "string" ||
    typeof value.decision_payload_sha256 !== "string"
  ) {
    return false;
  }
  try {
    const canonical = canonicalRiskObjectJson(payload);
    if (createHash("sha256").update(canonical, "utf8").digest("hex") !== value.decision_payload_sha256) {
      return false;
    }
    const key = createPublicKey({ key: Buffer.from(keySpki, "base64"), format: "der", type: "spki" });
    return (
      key.asymmetricKeyType === "ed25519" &&
      edVerify(null, Buffer.from(canonical), key, Buffer.from(value.decision_signature_b64, "base64"))
    );
  } catch {
    return false;
  }
}

export async function handleUsdcPayPerCall(
  request: Request,
  fetcher: typeof fetchWithoutRedirect = fetchWithoutRedirect,
): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
  if (request.method === "GET") {
    return Response.json(
      {
        ok: true,
        schema: "geomacro.free-usdc-pay-per-call.v1",
        environment: "mainnet_only",
        recipient: GEOMACRO_MAINNET_USDC_RECIPIENT,
        pricing_usdc: {
          basic_focused: PRICE_BY_TIER.basic_focused.usdc,
          standard: PRICE_BY_TIER.standard.usdc,
          complex_full: PRICE_BY_TIER.complex_full.usdc,
        },
        networks: Object.values(MAINNET_USDC_PAY_PER_CALL_CHAINS),
        decision_support_notice: DECISION_SUPPORT_NOTICE,
      },
      { status: 200, headers: HEADERS },
    );
  }
  if (request.method !== "POST") return bad("METHOD_NOT_ALLOWED", 405);
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return bad("UNSUPPORTED_MEDIA_TYPE", 415);
  }
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return bad("INVALID_JSON", 400);
  }
  if (!isRecord(body)) return bad("INVALID_RISK_GATE_REQUEST", 400);
  const category = typeof body.category === "string" ? CATEGORIES[body.category as keyof typeof CATEGORIES] : undefined;
  const tier =
    typeof body.tier === "string"
      ? TIER_ALIASES[body.tier as keyof typeof TIER_ALIASES] ?? body.tier
      : undefined;
  const countryIso3 = typeof body.country_iso3 === "string" ? body.country_iso3.trim().toUpperCase() : "";
  const networkRaw = typeof body.network === "string" ? body.network.trim().toLowerCase() : "base";
  if (
    !category ||
    !/^[A-Z]{3}$/.test(countryIso3) ||
    typeof tier !== "string" ||
    !TIERS.has(tier) ||
    !Object.hasOwn(MAINNET_USDC_PAY_PER_CALL_CHAINS, networkRaw)
  ) {
    return bad("INVALID_RISK_GATE_REQUEST", 400);
  }
  const network = networkRaw as MainnetUsdcChainId;
  const chain = MAINNET_USDC_PAY_PER_CALL_CHAINS[network];
  const price = PRICE_BY_TIER[tier as keyof typeof PRICE_BY_TIER];

  if (body.mode === "prepare") {
    return Response.json(
      {
        ok: true,
        status: "REQUEST_SHAPE_VALID_NO_CHARGE",
        method: "POST",
        endpoint: "/api/v1/payments/usdc-risk-gate",
        category,
        country_iso3: countryIso3,
        tier,
        network: chain.id,
        caip2: chain.caip2,
        asset: chain.asset,
        recipient: GEOMACRO_MAINNET_USDC_RECIPIENT,
        amount_usdc: price.usdc,
        amount_atomic: price.atomic,
        chargeable: false,
        execution_authorized: false,
        decision_support_notice: DECISION_SUPPORT_NOTICE,
      },
      { status: 200, headers: HEADERS },
    );
  }

  const paymentHeader = (
    request.headers.get("payment-signature") ??
    request.headers.get("x-payment") ??
    ""
  ).trim();
  const txHash = typeof body.tx_hash === "string" ? body.tx_hash.trim() : "";
  const paymentRequirements = {
    scheme: "exact" as const,
    network: chain.caip2,
    maxAmountRequired: price.atomic,
    amount: price.atomic,
    resource: "https://geomacro.live/api/v1/payments/usdc-risk-gate",
    description: `GeoMacro ${tier} Risk Gate for ${countryIso3} (${category})`,
    mimeType: "application/json",
    payTo: GEOMACRO_MAINNET_USDC_RECIPIENT,
    maxTimeoutSeconds: 300,
    asset: chain.asset,
    extra: { name: "USD Coin", version: "2" },
  };
  if (!txHash && !paymentHeader) {
    const accepts = [
      {
        scheme: "exact",
        network: chain.caip2,
        maxAmountRequired: price.atomic,
        amount: price.atomic,
        resource: "https://geomacro.live/api/v1/payments/usdc-risk-gate",
        description: `GeoMacro ${tier} Risk Gate for ${countryIso3} (${category})`,
        mimeType: "application/json",
        payTo: GEOMACRO_MAINNET_USDC_RECIPIENT,
        maxTimeoutSeconds: 300,
        asset: chain.asset,
        extra: { name: "USD Coin", version: "2" },
      },
    ];
    const x402Body = {
      ok: false,
      error: "PAYMENT_REQUIRED",
      x402Version: 1,
      accepts,
      execution_authorized: false,
      chargeable: false,
      decision_support_notice: DECISION_SUPPORT_NOTICE,
      payment_instructions: {
        network: chain.id,
        caip2: chain.caip2,
        chain_id: chain.chainId,
        asset: chain.asset,
        recipient: GEOMACRO_MAINNET_USDC_RECIPIENT,
        amount_usdc: price.usdc,
        amount_atomic: price.atomic,
        free_facilitator: chain.freeFacilitator,
      },
    };
    return Response.json(x402Body, {
      status: 402,
      headers: {
        ...HEADERS,
        "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(x402Body), "utf8").toString("base64"),
      },
    });
  }
  const requestId =
    typeof body.request_id === "string" && body.request_id.trim().length > 0
      ? body.request_id.trim()
      : `${network}:${(txHash || "x402:" + paymentHeader.slice(0, 32)).toLowerCase()}`;

  let proof;
  let settlementHeader: string | null = null;
  if (txHash) {
    try {
      proof = await verifyMainnetUsdcTransferReceipt({
        network,
        txHash,
        minAmountAtomic: price.atomic,
      });
    } catch (err) {
      return bad(err instanceof Error ? err.message : "USDC_PROOF_FAILED", 402);
    }
  } else {
    if (!chain.freeFacilitator) {
      return bad("FACILITATOR_NOT_SUPPORTED_ON_NETWORK", 402);
    }
    try {
      const paymentPayload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8")) as { x402Version?: number };
      const reqVer = paymentPayload?.x402Version === 1 ? 1 : 2;
      const reqForFacilitator = {
        ...paymentRequirements,
        network: reqVer === 1 && chain.id === "base" ? "base" : chain.caip2,
      };
      const verifyRes = await fetcher(chain.freeFacilitator + "/verify", {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x402Version: reqVer, paymentPayload, paymentRequirements: reqForFacilitator }),
        signal: AbortSignal.timeout(8000),
      });
      const verifyJson = (await verifyRes.json()) as { isValid?: boolean; invalidReason?: string; payer?: string };
      if (!verifyRes.ok || !verifyJson.isValid) {
        return bad(verifyJson.invalidReason || "X402_VERIFY_FAILED", 402);
      }
      const settleRes = await fetcher(chain.freeFacilitator + "/settle", {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x402Version: reqVer, paymentPayload, paymentRequirements: reqForFacilitator }),
        signal: AbortSignal.timeout(12000),
      });
      const settleJson = (await settleRes.json()) as { success?: boolean; transaction?: string; payer?: string; errorReason?: string };
      if (!settleRes.ok || !settleJson.success || !settleJson.transaction) {
        return bad(settleJson.errorReason || "X402_SETTLE_FAILED", 402);
      }
      settlementHeader = Buffer.from(JSON.stringify(settleJson), "utf8").toString("base64");
      proof = {
        network,
        tx_hash: settleJson.transaction,
        payer: settleJson.payer || verifyJson.payer || "0x0000000000000000000000000000000000000000",
        amount_atomic: price.atomic,
        amount_usdc: price.usdc,
        settled_via: chain.freeFacilitator,
      };
    } catch (err) {
      return bad(err instanceof Error ? err.message : "X402_SETTLEMENT_ERROR", 402);
    }
  }

  const token = String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  if (token.length < 32) return bad("RISK_GATE_LEDGER_TOKEN_MISSING", 503);
  const origin = String(process.env.GEOMACRO_CONTROL_PLANE_URL ?? FALLBACK).replace(/\/+$/u, "");
  try {
    const upstream = await fetcher(origin + "/v1/store/risk-gate-usdc", {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        request_id: requestId,
        country_iso3: countryIso3,
        category,
        tier,
        network,
        tx_hash: proof.tx_hash,
        amount_atomic: proof.amount_atomic,
        payer: proof.payer,
        policy: body.policy ?? DEFAULT_POLICY,
      }),
      signal: AbortSignal.timeout(5500),
    });
    const value = (await upstream.json()) as Record<string, unknown>;
    if (upstream.status === 200) {
      const trusted = await resolveDecisionKey(origin, fetcher);
      if (!validateSignedDecision(value, trusted.key, trusted.id)) {
        return bad("RISK_GATE_SIGNATURE_INVALID", 503);
      }
    }
    return Response.json(
      { ...value, usdc_payment_proof: proof, decision_support_notice: DECISION_SUPPORT_NOTICE },
      { status: upstream.status, headers: settlementHeader ? { ...HEADERS, "PAYMENT-RESPONSE": settlementHeader } : HEADERS },
    );
  } catch {
    return bad("RISK_GATE_D1_TRANSPORT_UNAVAILABLE", 503);
  }
}

export const Route = createFileRoute("/api/v1/payments/usdc-risk-gate")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => handleUsdcPayPerCall(request),
      GET: async ({ request }) => handleUsdcPayPerCall(request),
      POST: async ({ request }) => handleUsdcPayPerCall(request),
    },
  },
});
