import process from "node:process";
import { assertCommercialLaunchAuthorized } from "./commercial-launch-gate.server";
import { commerceFingerprint } from "./agent-commerce-delivery.server";

export const NEVERMINED_API_VERSION = "1.1";
export const NEVERMINED_ENVIRONMENTS = {
  sandbox: {
    api_url: "https://api.sandbox.nevermined.app/",
    network: "eip155:84532",
    commercial_revenue: false,
  },
  live: {
    api_url: "https://api.live.nevermined.app/",
    network: "eip155:8453",
    commercial_revenue: true,
  },
} as const;

export type NeverminedEnvironment = keyof typeof NEVERMINED_ENVIRONMENTS;
export type NeverminedScheme = "nvm:erc4337" | "nvm:card-delegation";
export type NeverminedBillingModel = "credits" | "pay-as-you-go";

export type X402PaymentRequired = {
  x402Version: 2;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: Array<{
    scheme: NeverminedScheme;
    network: string;
    planId: string;
    extra: {
      version: "1";
      httpVerb?: string;
    };
  }>;
  extensions: Record<string, unknown>;
};

export type VerifyPermissionsResult = {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
  network?: string;
  agentRequestId?: string;
  urlMatching?: string;
  agentRequest?: Record<string, unknown>;
};

export type SettlePermissionsResult = {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction?: string;
  network?: string;
  billingModel?: NeverminedBillingModel;
  creditsRedeemed?: string;
  remainingBalance?: string;
  orderTx?: string;
};

export type NeverminedX402Config = {
  environment: NeverminedEnvironment;
  apiUrl: string;
  apiVersion: typeof NEVERMINED_API_VERSION;
  apiKey: string;
  planId: string;
  scheme: NeverminedScheme;
  network: string;
  maxAmount: bigint;
  commercialRevenue: boolean;
};

const PLAN_ID = /^[0-9]{1,96}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,38}$/;
const SAFE_SECRET = /^[^\u0000-\u001F\u007F]{1,4096}$/;
const SAFE_PAYMENT_TOKEN = /^[^\u0000-\u001F\u007F]{1,65536}$/;
const SAFE_AGENT_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const CARD_NETWORKS = new Set(["stripe", "braintree", "visa"]);
const RESPONSE_LIMIT_BYTES = 128 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

function required(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!SAFE_SECRET.test(value)) throw new Error(`${name} is not configured or contains invalid control characters`);
  return value;
}

function configuredCardNetwork() {
  const value = process.env.NEVERMINED_X402_NETWORK?.trim().toLowerCase() || "stripe";
  if (!CARD_NETWORKS.has(value)) {
    throw new Error("NEVERMINED_X402_NETWORK must be stripe, braintree, or visa for nvm:card-delegation");
  }
  return value;
}

function assertApiKeyEnvironment(apiKey: string, environment: NeverminedEnvironment) {
  const separator = apiKey.indexOf(":");
  if (separator <= 0) return;
  const prefix = apiKey.slice(0, separator).toLowerCase();
  if ((prefix === "sandbox" || prefix === "live") && prefix !== environment) {
    throw new Error("NEVERMINED_NVM_API_KEY environment prefix does not match NEVERMINED_X402_ENVIRONMENT");
  }
}

export function neverminedEnvironment(): NeverminedEnvironment | null {
  const value = process.env.NEVERMINED_X402_ENVIRONMENT?.trim().toLowerCase();
  return value === "sandbox" || value === "live" ? value : null;
}

export function getNeverminedX402Config(): NeverminedX402Config | null {
  const environment = neverminedEnvironment();
  if (!environment) return null;

  if (environment === "live") {
    assertCommercialLaunchAuthorized("nevermined");
  }

  const apiKey = required("NEVERMINED_NVM_API_KEY");
  assertApiKeyEnvironment(apiKey, environment);

  const planId = required("NEVERMINED_PLAN_ID");
  if (!PLAN_ID.test(planId)) throw new Error("NEVERMINED_PLAN_ID must be a bounded numeric plan identifier");

  const schemeRaw = required("NEVERMINED_X402_SCHEME");
  if (schemeRaw !== "nvm:erc4337" && schemeRaw !== "nvm:card-delegation") {
    throw new Error("NEVERMINED_X402_SCHEME must be nvm:erc4337 or nvm:card-delegation");
  }

  const maxAmountRaw = required("NEVERMINED_X402_MAX_AMOUNT");
  if (!POSITIVE_INTEGER.test(maxAmountRaw)) {
    throw new Error("NEVERMINED_X402_MAX_AMOUNT must be a positive bounded integer");
  }

  const expected = NEVERMINED_ENVIRONMENTS[environment];
  return {
    environment,
    apiUrl: expected.api_url,
    apiVersion: NEVERMINED_API_VERSION,
    apiKey,
    planId,
    scheme: schemeRaw,
    network: schemeRaw === "nvm:erc4337" ? expected.network : configuredCardNetwork(),
    maxAmount: BigInt(maxAmountRaw),
    commercialRevenue: expected.commercial_revenue,
  };
}

export function isNeverminedX402Configured() {
  try {
    return getNeverminedX402Config() !== null;
  } catch {
    return false;
  }
}

export function neverminedPaymentRequired(
  config: NeverminedX402Config,
  endpoint: string,
): X402PaymentRequired {
  return {
    x402Version: 2,
    resource: {
      url: endpoint,
      description: "Geomacro source-governed geopolitical and macro risk intelligence for autonomous agents.",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: config.scheme,
        network: config.network,
        planId: config.planId,
        extra: {
          version: "1",
          httpVerb: "POST",
        },
      },
    ],
    extensions: {},
  };
}

function safePaymentToken(token: string) {
  const normalized = token.trim();
  if (!SAFE_PAYMENT_TOKEN.test(normalized)) {
    throw new Error("Nevermined payment signature contains invalid control characters or exceeds the supported size");
  }
  return normalized;
}

async function boundedJsonObject(response: Response): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > RESPONSE_LIMIT_BYTES) {
    throw new Error("Nevermined response exceeded the maximum supported size");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > RESPONSE_LIMIT_BYTES) {
    throw new Error("Nevermined response exceeded the maximum supported size");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Nevermined returned non-JSON status ${response.status}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Nevermined returned an invalid JSON object");
  }
  return parsed as Record<string, unknown>;
}

function backendError(status: number, body: Record<string, unknown>) {
  const code = typeof body.code === "string" && body.code.length <= 128 ? body.code : `HTTP_${status}`;
  const hint = typeof body.hint === "string" && body.hint.length <= 512 ? `: ${body.hint}` : "";
  return new Error(`NEVERMINED_${code}${hint}`);
}

async function postNevermined(
  config: NeverminedX402Config,
  path: "/api/v1/x402/verify" | "/api/v1/x402/settle",
  body: Record<string, unknown>,
) {
  const base = new URL(config.apiUrl);
  const target = new URL(path, base);
  if (target.origin !== base.origin || target.protocol !== "https:") {
    throw new Error("Nevermined backend origin validation failed");
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "Nevermined-Version": config.apiVersion,
      },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `NEVERMINED_NETWORK_ERROR: ${error instanceof Error ? error.message : "request failed"}`,
    );
  }

  if (response.status >= 300 && response.status < 400) {
    throw new Error("NEVERMINED_REDIRECT_REJECTED");
  }

  const parsed = await boundedJsonObject(response);
  if (!response.ok) throw backendError(response.status, parsed);
  return parsed;
}

function optionalString(value: unknown, field: string, maxLength = 4096) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maxLength || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new Error(`Nevermined response field ${field} is invalid`);
  }
  return value;
}

export async function verifyNeverminedPermissions(input: {
  config: NeverminedX402Config;
  paymentRequired: X402PaymentRequired;
  token: string;
}): Promise<VerifyPermissionsResult> {
  const raw = await postNevermined(input.config, "/api/v1/x402/verify", {
    paymentRequired: input.paymentRequired,
    x402AccessToken: safePaymentToken(input.token),
    maxAmount: input.config.maxAmount.toString(),
  });

  if (typeof raw.isValid !== "boolean") {
    throw new Error("Nevermined verify response is missing isValid");
  }

  const agentRequestId = optionalString(raw.agentRequestId, "agentRequestId", 256);
  if (agentRequestId && !SAFE_AGENT_REQUEST_ID.test(agentRequestId)) {
    throw new Error("Nevermined verify response agentRequestId is invalid");
  }

  return {
    isValid: raw.isValid,
    invalidReason: optionalString(raw.invalidReason, "invalidReason", 512),
    payer: optionalString(raw.payer, "payer", 512),
    network: optionalString(raw.network, "network", 128),
    agentRequestId,
    urlMatching: optionalString(raw.urlMatching, "urlMatching", 2048),
    agentRequest:
      raw.agentRequest && typeof raw.agentRequest === "object" && !Array.isArray(raw.agentRequest)
        ? (raw.agentRequest as Record<string, unknown>)
        : undefined,
  };
}

export async function settleNeverminedPermissions(input: {
  config: NeverminedX402Config;
  paymentRequired: X402PaymentRequired;
  token: string;
  agentRequestId?: string;
}): Promise<SettlePermissionsResult> {
  if (input.agentRequestId && !SAFE_AGENT_REQUEST_ID.test(input.agentRequestId)) {
    throw new Error("Nevermined agentRequestId is invalid");
  }

  const raw = await postNevermined(input.config, "/api/v1/x402/settle", {
    paymentRequired: input.paymentRequired,
    x402AccessToken: safePaymentToken(input.token),
    maxAmount: input.config.maxAmount.toString(),
    ...(input.agentRequestId ? { agentRequestId: input.agentRequestId } : {}),
  });

  if (typeof raw.success !== "boolean") {
    throw new Error("Nevermined settle response is missing success");
  }
  if (
    raw.billingModel !== undefined &&
    raw.billingModel !== "credits" &&
    raw.billingModel !== "pay-as-you-go"
  ) {
    throw new Error("Nevermined settle response billingModel is invalid");
  }

  return {
    success: raw.success,
    errorReason: optionalString(raw.errorReason, "errorReason", 1024),
    payer: optionalString(raw.payer, "payer", 512),
    transaction: optionalString(raw.transaction, "transaction", 512),
    network: optionalString(raw.network, "network", 128),
    billingModel: raw.billingModel as NeverminedBillingModel | undefined,
    creditsRedeemed: optionalString(raw.creditsRedeemed, "creditsRedeemed", 128),
    remainingBalance: optionalString(raw.remainingBalance, "remainingBalance", 128),
    orderTx: optionalString(raw.orderTx, "orderTx", 512),
  };
}

/**
 * Never infer a successful charge from `success` alone. Nevermined supports
 * both balance-backed credits and pay-as-you-go rails with different evidence.
 */
export function assessNeverminedSettlement(settlement: SettlePermissionsResult) {
  const transaction = String(settlement.transaction ?? "").trim();
  const orderTx = String(settlement.orderTx ?? "").trim();
  const creditsRedeemed = Number(settlement.creditsRedeemed ?? "0");

  if (!settlement.success) {
    return {
      settled: false,
      reference: null as string | null,
      reason: settlement.errorReason ?? "NEVERMINED_SETTLEMENT_FAILED",
    };
  }

  if (settlement.billingModel === "pay-as-you-go") {
    const reference = orderTx || transaction;
    return reference
      ? { settled: true, reference, reason: null as string | null }
      : { settled: false, reference: null, reason: "NEVERMINED_PAYG_REFERENCE_MISSING" };
  }

  // Missing billingModel is intentionally treated as legacy credits semantics,
  // matching the Nevermined 1.13.0 contract. Positive redeemed credits are
  // required before Geomacro releases the paid response.
  if (Number.isFinite(creditsRedeemed) && creditsRedeemed > 0) {
    const reference = orderTx || transaction || `nvm-credits:${commerceFingerprint(settlement)}`;
    return { settled: true, reference, reason: null as string | null };
  }

  return {
    settled: false,
    reference: null as string | null,
    reason: "NEVERMINED_CREDIT_REDEMPTION_NOT_PROVEN",
  };
}
