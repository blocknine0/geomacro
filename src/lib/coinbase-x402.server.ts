import { createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { SignJWT, importJWK, importPKCS8 } from "jose";
import { assertCommercialLaunchAuthorized } from "./commercial-launch-gate.server";
import { recordCommercialPaymentEvent, recordCommercialUsageEvent } from "./commercial-ops.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const CDP_HOST = "api.cdp.coinbase.com" as const;
const CDP_ORIGIN = `https://${CDP_HOST}` as const;
const CDP_X402_BASE = `${CDP_ORIGIN}/platform/v2/x402` as const;
const VERIFY_PATH = "/platform/v2/x402/verify" as const;
const SETTLE_PATH = "/platform/v2/x402/settle" as const;

export const COINBASE_X402_TESTNET_NETWORK = "eip155:84532" as const;
export const COINBASE_X402_MAINNET_NETWORK = "eip155:8453" as const;
export const COINBASE_X402_TESTNET_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const COINBASE_X402_MAINNET_USDC =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const COINBASE_X402_MAX_TIMEOUT_SECONDS = 60 as const;
export const COINBASE_X402_MAINNET_ACK = "I_ACCEPT_REAL_USDC" as const;

export type CoinbaseX402Environment = "testnet" | "production";

type PaymentRequirements = {
  scheme: "exact";
  network: typeof COINBASE_X402_TESTNET_NETWORK | typeof COINBASE_X402_MAINNET_NETWORK;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: "USDC"; version: "2" };
};

export type CoinbaseVerifyResult = {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
  invalidMessage?: string;
  extensions?: Record<string, unknown>;
  extensionResponses?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

export type CoinbaseSettleResult = {
  success: boolean;
  payer?: string;
  transaction?: string;
  network?: string;
  amount?: string;
  errorReason?: string;
  errorMessage?: string;
  extensions?: Record<string, unknown>;
  extensionResponses?: Record<string, unknown>;
  extra?: Record<string, unknown>;
};

export type CoinbaseX402Config = {
  environment: CoinbaseX402Environment;
  commercialEnvironment: "testnet" | "mainnet";
  network: PaymentRequirements["network"];
  networkName: "Base Sepolia" | "Base";
  chainId: "84532" | "8453";
  asset: string;
  payTo: string;
  priceUsdc: string;
  amountAtomic: string;
  apiKeyId: string | null;
  apiKeySecret: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function parsePriceToAtomic(value: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(normalized)) {
    throw new Error(
      "COINBASE_X402_PRICE_USDC must be a positive USDC decimal with at most 6 decimal places",
    );
  }
  const [whole, fraction = ""] = normalized.split(".");
  const atomic = BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
  if (atomic <= 0n) throw new Error("COINBASE_X402_PRICE_USDC must be greater than zero");
  if (atomic > 100_000_000n) {
    throw new Error("COINBASE_X402_PRICE_USDC exceeds the 100 USDC safety cap");
  }
  return atomic.toString();
}

function validAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function getCoinbaseX402Config(): CoinbaseX402Config | null {
  const rawEnvironment = process.env.COINBASE_X402_ENVIRONMENT?.trim().toLowerCase();
  if (!rawEnvironment) return null;
  if (rawEnvironment !== "testnet" && rawEnvironment !== "production") {
    throw new Error("COINBASE_X402_ENVIRONMENT must be testnet or production");
  }

  const payTo = process.env.COINBASE_X402_PAY_TO?.trim() ?? "";
  if (!validAddress(payTo)) {
    throw new Error("COINBASE_X402_PAY_TO must be a valid EVM address");
  }

  if (rawEnvironment === "production") {
    assertCommercialLaunchAuthorized("coinbase_x402");
    if (process.env.COINBASE_X402_MAINNET_ACK?.trim() !== COINBASE_X402_MAINNET_ACK) {
      throw new Error(
        `Production x402 is locked. Set COINBASE_X402_MAINNET_ACK=${COINBASE_X402_MAINNET_ACK} only during the coordinated Geomacro launch after all acceptance gates pass.`,
      );
    }
  }

  const configuredPrice = process.env.COINBASE_X402_PRICE_USDC?.trim();
  if (rawEnvironment === "production" && !configuredPrice) {
    throw new Error("COINBASE_X402_PRICE_USDC is required in production");
  }
  const priceUsdc = configuredPrice || "0.05";
  const amountAtomic = parsePriceToAtomic(priceUsdc);

  const isProduction = rawEnvironment === "production";
  return {
    environment: rawEnvironment,
    commercialEnvironment: isProduction ? "mainnet" : "testnet",
    network: isProduction ? COINBASE_X402_MAINNET_NETWORK : COINBASE_X402_TESTNET_NETWORK,
    networkName: isProduction ? "Base" : "Base Sepolia",
    chainId: isProduction ? "8453" : "84532",
    asset: isProduction ? COINBASE_X402_MAINNET_USDC : COINBASE_X402_TESTNET_USDC,
    payTo,
    priceUsdc,
    amountAtomic,
    apiKeyId: process.env.CDP_API_KEY_ID?.trim() || null,
    apiKeySecret: process.env.CDP_API_KEY_SECRET?.trim() || null,
  };
}

export function isCoinbaseX402Configured() {
  try {
    const config = getCoinbaseX402Config();
    return Boolean(config?.apiKeyId && config.apiKeySecret);
  } catch {
    return false;
  }
}

export function coinbaseX402PaymentRequirements(config: CoinbaseX402Config): PaymentRequirements {
  return {
    scheme: "exact",
    network: config.network,
    asset: config.asset,
    amount: config.amountAtomic,
    payTo: config.payTo,
    maxTimeoutSeconds: COINBASE_X402_MAX_TIMEOUT_SECONDS,
    extra: { name: "USDC", version: "2" },
  };
}

const riskInputExample = {
  subject: { type: "country", country_iso3: "USA" },
  policy_preset: "balanced",
  action_type: "agent_payment",
  amount_usdc: 1000,
  client_request_id: "agent-request-001",
};

const riskInputSchema = {
  type: "object",
  properties: {
    subject: {
      oneOf: [
        {
          type: "object",
          properties: {
            type: { type: "string", const: "country" },
            country_iso3: {
              type: "string",
              pattern: "^[A-Z]{3}$",
              description: "ISO 3166-1 alpha-3 country code.",
            },
          },
          required: ["type", "country_iso3"],
          additionalProperties: false,
        },
        {
          type: "object",
          properties: {
            type: { type: "string", const: "corridor" },
            origin_country_iso3: { type: "string", pattern: "^[A-Z]{3}$" },
            destination_country_iso3: { type: "string", pattern: "^[A-Z]{3}$" },
          },
          required: ["type", "origin_country_iso3", "destination_country_iso3"],
          additionalProperties: false,
        },
      ],
      description: "Country or cross-border corridor to evaluate before a financial action.",
    },
    policy_preset: {
      type: "string",
      enum: ["balanced", "cautious", "strict"],
      description: "Risk Gate policy preset. Defaults to balanced.",
    },
    action_type: {
      type: "string",
      enum: ["treasury_payment", "vendor_payment", "agent_payment", "exposure_review"],
      description: "Financial action being evaluated. Defaults to agent_payment.",
    },
    amount_usdc: {
      type: "number",
      exclusiveMinimum: 0,
      maximum: 1000000000,
      description: "Optional notional amount of the contemplated action in USDC.",
    },
    client_request_id: {
      type: "string",
      minLength: 4,
      maxLength: 128,
      description: "Optional caller-generated request identifier for traceability.",
    },
  },
  required: ["subject"],
  additionalProperties: false,
};

const riskOutputExample = {
  ok: true,
  request_id: "00000000-0000-4000-8000-000000000000",
  risk_gate: {
    decision: "REQUIRE_APPROVAL",
    execution_authorized: false,
  },
  payment: {
    required: true,
    provider: "coinbase_cdp_x402",
    asset: "USDC",
    network: COINBASE_X402_TESTNET_NETWORK,
  },
};

const riskOutputSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    request_id: { type: "string" },
    risk_gate: {
      type: "object",
      properties: {
        decision: { type: "string" },
        execution_authorized: { type: "boolean", const: false },
      },
      required: ["execution_authorized"],
    },
    payment: { type: "object" },
  },
  required: ["request_id", "risk_gate"],
};

export function coinbaseX402BazaarExtension() {
  return {
    bazaar: {
      info: {
        input: {
          type: "http",
          method: "POST",
          bodyType: "json",
          body: riskInputExample,
        },
        output: {
          type: "json",
          example: riskOutputExample,
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: {
            type: "object",
            properties: {
              type: { type: "string", const: "http" },
              method: { type: "string", enum: ["POST", "PUT", "PATCH"] },
              bodyType: { type: "string", enum: ["json", "form-data", "text"] },
              body: riskInputSchema,
            },
            required: ["type", "method", "bodyType", "body"],
            additionalProperties: false,
          },
          output: {
            type: "object",
            properties: {
              type: { type: "string" },
              example: riskOutputSchema,
            },
            required: ["type"],
          },
        },
        required: ["input"],
      },
    },
  };
}

export function coinbaseX402PaymentRequired(request: Request, config: CoinbaseX402Config) {
  const resourceUrl = new URL("/api/x402/risk", request.url).toString();
  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description:
        "Geopolitical and macro risk pre-flight for autonomous financial agents. Returns country or corridor risk context and a non-executing Risk Gate decision before a payment, treasury action or exposure.",
      mimeType: "application/json",
      serviceName: "Geomacro",
      tags: ["geopolitical-risk", "macro-risk", "risk-gate", "ai-agents"],
    },
    accepts: [coinbaseX402PaymentRequirements(config)],
    extensions: coinbaseX402BazaarExtension(),
  };
}

function encodeUtf8Base64(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function decodeUtf8Base64(value: string) {
  return Buffer.from(value, "base64").toString("utf8");
}

export function encodeX402Header(value: unknown) {
  return encodeUtf8Base64(JSON.stringify(value));
}

export function decodeCoinbasePaymentHeader(header: string): Record<string, unknown> {
  if (header.length > 64 * 1024) throw new Error("PAYMENT_SIGNATURE_HEADER_TOO_LARGE");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8Base64(header));
  } catch {
    throw new Error("PAYMENT_SIGNATURE_INVALID_ENCODING_OR_JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("PAYMENT_SIGNATURE_INVALID_PAYLOAD");
  }
  return parsed as Record<string, unknown>;
}

function normalizedAddress(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function assertCoinbasePaymentBinding(
  paymentPayload: Record<string, unknown>,
  config: CoinbaseX402Config,
) {
  if (paymentPayload.x402Version !== 2) throw new Error("PAYMENT_X402_VERSION_MISMATCH");
  const accepted = paymentPayload.accepted;
  if (!accepted || typeof accepted !== "object" || Array.isArray(accepted)) {
    throw new Error("PAYMENT_ACCEPTED_REQUIREMENTS_MISSING");
  }
  const actual = accepted as Record<string, unknown>;
  const expected = coinbaseX402PaymentRequirements(config);
  if (actual.scheme !== expected.scheme) throw new Error("PAYMENT_SCHEME_MISMATCH");
  if (actual.network !== expected.network) throw new Error("PAYMENT_NETWORK_MISMATCH");
  if (normalizedAddress(actual.asset) !== expected.asset.toLowerCase()) {
    throw new Error("PAYMENT_ASSET_MISMATCH");
  }
  if (String(actual.amount ?? "") !== expected.amount) throw new Error("PAYMENT_AMOUNT_MISMATCH");
  if (normalizedAddress(actual.payTo) !== expected.payTo.toLowerCase()) {
    throw new Error("PAYMENT_RECIPIENT_MISMATCH");
  }
  if (Number(actual.maxTimeoutSeconds) !== expected.maxTimeoutSeconds) {
    throw new Error("PAYMENT_TIMEOUT_MISMATCH");
  }
  const extra = actual.extra as Record<string, unknown> | undefined;
  if (extra?.name !== "USDC" || extra?.version !== "2") {
    throw new Error("PAYMENT_ASSET_METADATA_MISMATCH");
  }
}

export function coinbasePaymentFingerprint(paymentPayload: Record<string, unknown>) {
  return sha256(stableJson(paymentPayload));
}

export function coinbaseRequestFingerprint(requestBody: unknown) {
  return sha256(stableJson(requestBody));
}

async function generateCdpJwt(path: string) {
  const config = getCoinbaseX402Config();
  if (!config?.apiKeyId || !config.apiKeySecret) throw new Error("CDP_API_CREDENTIALS_MISSING");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: config.apiKeyId,
    iss: "cdp",
    uris: [`POST ${CDP_HOST}${path}`],
  };
  const nonce = randomBytes(16).toString("hex");

  if (config.apiKeySecret.includes("BEGIN")) {
    const key = await importPKCS8(config.apiKeySecret, "ES256");
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: config.apiKeyId, typ: "JWT", nonce })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 120)
      .sign(key);
  }

  const decoded = Buffer.from(config.apiKeySecret, "base64");
  if (decoded.length !== 64) {
    throw new Error("CDP_API_KEY_SECRET must be a PEM ES256 key or a 64-byte base64 Ed25519 key");
  }
  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);
  const key = await importJWK(
    {
      kty: "OKP",
      crv: "Ed25519",
      d: seed.toString("base64url"),
      x: publicKey.toString("base64url"),
    },
    "EdDSA",
  );
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: config.apiKeyId, typ: "JWT", nonce })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

const facilitator = new HTTPFacilitatorClient({
  url: CDP_X402_BASE,
  timeoutMs: 20_000,
  createAuthHeaders: async () => ({
    verify: { Authorization: `Bearer ${await generateCdpJwt(VERIFY_PATH)}` },
    settle: { Authorization: `Bearer ${await generateCdpJwt(SETTLE_PATH)}` },
  }),
});

export async function verifyCoinbaseX402(
  paymentPayload: Record<string, unknown>,
  config: CoinbaseX402Config,
) {
  assertCoinbasePaymentBinding(paymentPayload, config);
  return (await facilitator.verify(
    paymentPayload as Parameters<typeof facilitator.verify>[0],
    coinbaseX402PaymentRequirements(config) as Parameters<typeof facilitator.verify>[1],
  )) as CoinbaseVerifyResult;
}

export async function settleCoinbaseX402(
  paymentPayload: Record<string, unknown>,
  config: CoinbaseX402Config,
) {
  assertCoinbasePaymentBinding(paymentPayload, config);
  return (await facilitator.settle(
    paymentPayload as Parameters<typeof facilitator.settle>[0],
    coinbaseX402PaymentRequirements(config) as Parameters<typeof facilitator.settle>[1],
  )) as CoinbaseSettleResult;
}

export function coinbaseX402PaymentResponseHeader(settlement: CoinbaseSettleResult) {
  const { extensionResponses: _serverOnly, ...buyerVisible } = settlement;
  return encodeX402Header(buyerVisible);
}

export function bazaarExtensionOutcome(
  verify: CoinbaseVerifyResult | null | undefined,
  settlement: CoinbaseSettleResult | null | undefined,
) {
  const responses = settlement?.extensionResponses ?? verify?.extensionResponses;
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
    return { status: null as string | null, rejectedReason: null as string | null };
  }
  const bazaar = responses.bazaar;
  if (!bazaar || typeof bazaar !== "object" || Array.isArray(bazaar)) {
    return { status: null as string | null, rejectedReason: null as string | null };
  }
  const payload = bazaar as Record<string, unknown>;
  const status = ["success", "processing", "rejected"].includes(String(payload.status))
    ? String(payload.status)
    : null;
  const rejectedReason =
    status === "rejected" && typeof payload.rejectedReason === "string"
      ? payload.rejectedReason.slice(0, 500)
      : null;
  return { status, rejectedReason };
}

function payerTelemetryId(payer: string | null | undefined) {
  const normalized = String(payer ?? "").trim().toLowerCase();
  return normalized ? `coinbase-x402:sha256:${sha256(normalized)}` : "coinbase-x402:unknown";
}

export async function claimCoinbaseX402Delivery(input: {
  paymentFingerprint: string;
  requestFingerprint: string;
  clientRequestId?: string | null;
  config: CoinbaseX402Config;
}) {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("claim_coinbase_x402_delivery", {
    p_payment_fingerprint: input.paymentFingerprint,
    p_request_fingerprint: input.requestFingerprint,
    p_client_request_id: input.clientRequestId ?? null,
    p_environment: input.config.commercialEnvironment,
    p_network: input.config.network,
    p_asset: input.config.asset,
    p_amount_atomic: input.config.amountAtomic,
    p_pay_to_hash: sha256(input.config.payTo.toLowerCase()),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("COINBASE_X402_DELIVERY_CLAIM_EMPTY");
  return row as {
    disposition: "CLAIMED" | "REPLAY" | "IN_PROGRESS" | "CONFLICT" | "MANUAL_REVIEW";
    claim_token: string | null;
    response_payload: unknown | null;
    settlement_tx: string | null;
    settlement_network: string | null;
  };
}

export async function prepareCoinbaseX402Delivery(input: {
  paymentFingerprint: string;
  claimToken: string;
  responsePayload: unknown;
}) {
  const db = requireRiskSupabase();
  const responseSha256 = sha256(stableJson(input.responsePayload));
  const { data, error } = await db.rpc("prepare_coinbase_x402_delivery", {
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_response_payload: input.responsePayload,
    p_response_sha256: responseSha256,
  });
  if (error) throw error;
  if (data !== true) throw new Error("COINBASE_X402_DELIVERY_PREPARE_LOST_CLAIM");
  return { responseSha256 };
}

export async function completeCoinbaseX402Delivery(input: {
  paymentFingerprint: string;
  claimToken: string;
  payer: string | null;
  settlementTx: string | null;
  settlementNetwork: string | null;
}) {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("complete_coinbase_x402_delivery", {
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_payer_hash: input.payer ? sha256(input.payer.toLowerCase()) : null,
    p_settlement_tx: input.settlementTx,
    p_settlement_network: input.settlementNetwork,
  });
  if (error) throw error;
  if (data !== true) throw new Error("COINBASE_X402_DELIVERY_COMPLETE_LOST_CLAIM");
}

export async function releaseCoinbaseX402DeliveryForRetry(input: {
  paymentFingerprint: string;
  claimToken: string;
  failureCode: string;
  manualReview?: boolean;
}) {
  const db = requireRiskSupabase();
  const { error } = await db.rpc("release_coinbase_x402_delivery", {
    p_payment_fingerprint: input.paymentFingerprint,
    p_claim_token: input.claimToken,
    p_failure_code: input.failureCode.slice(0, 160),
    p_manual_review: input.manualReview ?? false,
  });
  if (error) console.error("[coinbase-x402] delivery release failed", error);
}

export async function persistCoinbaseSettlementTelemetry(input: {
  requestId: string;
  payer: string | null;
  settlementTx: string | null;
  settlementNetwork: string | null;
  config: CoinbaseX402Config;
  paymentFingerprint: string;
  responseSha256: string;
  capability: string;
  bazaarExtensionEchoed: boolean;
  bazaarStatus: string | null;
  bazaarRejectedReason: string | null;
}) {
  try {
    const db = requireRiskSupabase();
    const settledAt = new Date().toISOString();
    const { data: requestRow, error: requestError } = await db
      .from("agent_api_requests")
      .insert({
        id: input.requestId,
        capability: "risk_preflight_coinbase_x402",
        external_agent_id: payerTelemetryId(input.payer),
        idempotency_key: input.paymentFingerprint,
        status: "delivered",
        http_status: 200,
        response_code: "COINBASE_X402_SETTLED",
        completed_at: settledAt,
      })
      .select("id")
      .single();
    if (requestError || !requestRow) {
      throw requestError ?? new Error("agent request telemetry unavailable");
    }

    const { data: paymentRow, error: paymentError } = await db
      .from("agent_payments")
      .insert({
        request_id: requestRow.id,
        provider: "x402",
        status: "settled",
        amount: input.config.amountAtomic,
        asset: "USDC",
        network: input.config.network,
        rail: "coinbase_cdp_exact",
        provider_reference: input.settlementTx,
        settled_at: settledAt,
      })
      .select("id")
      .single();
    if (paymentError || !paymentRow) {
      throw paymentError ?? new Error("agent payment telemetry unavailable");
    }

    await db.from("agent_api_requests").update({ payment_id: paymentRow.id }).eq("id", requestRow.id);

    const paymentEventId = await recordCommercialPaymentEvent({
      environment: input.config.commercialEnvironment,
      network_family: "evm",
      network_name: input.config.networkName,
      chain_id: input.config.chainId,
      provider: "coinbase_cdp_x402",
      provider_environment: input.config.environment,
      payment_method: "x402",
      payment_status: "settled",
      revenue_classification:
        input.config.commercialEnvironment === "testnet"
          ? "testnet_non_revenue"
          : "commercial_pending_accounting",
      provider_payment_id: input.paymentFingerprint,
      provider_settlement_id: input.settlementTx,
      asset_symbol: "USDC",
      asset_contract: input.config.asset,
      amount_atomic: input.config.amountAtomic,
      amount_decimal: Number(input.config.priceUsdc),
      payer_reference: input.payer,
      recipient_reference: input.config.payTo,
      tx_hash: input.settlementTx,
      settled_at: settledAt,
      reconciliation_status:
        input.config.commercialEnvironment === "testnet" ? "not_applicable" : "pending",
      commercial_revenue: false,
      metadata: {
        request_id: input.requestId,
        rail: "coinbase_cdp_exact",
        bazaar_extension_echoed: input.bazaarExtensionEchoed,
        bazaar_status: input.bazaarStatus,
        bazaar_rejected_reason: input.bazaarRejectedReason,
        execution_authorized: false,
        requires_mainnet_reconciliation_before_revenue_classification:
          input.config.commercialEnvironment === "mainnet",
      },
    });

    await recordCommercialUsageEvent({
      environment: input.config.commercialEnvironment,
      access_surface: "agent_payment",
      payment_event_id: paymentEventId,
      request_id: input.requestId,
      capability: input.capability,
      success: true,
      response_sha256: input.responseSha256,
      execution_authorized: false,
      shareable: false,
      metadata: {
        provider: "coinbase_cdp_x402",
        provider_environment: input.config.environment,
        payment_fingerprint: input.paymentFingerprint,
        settlement_reference_present: Boolean(input.settlementTx),
        reconciliation_status:
          input.config.commercialEnvironment === "testnet" ? "not_applicable" : "pending",
        execution_authorized: false,
      },
    });
  } catch (error) {
    console.error("[coinbase-x402] telemetry persistence failed", error);
  }
}

export function paymentPayloadEchoesBazaar(paymentPayload: Record<string, unknown>) {
  const extensions = paymentPayload.extensions;
  return Boolean(
    extensions &&
      typeof extensions === "object" &&
      !Array.isArray(extensions) &&
      "bazaar" in (extensions as Record<string, unknown>),
  );
}
