import process from "node:process";
import {
  Payments,
  buildPaymentRequired,
  type SettlePermissionsResult,
  type VerifyPermissionsResult,
  type X402PaymentRequired,
} from "@nevermined-io/payments";
import { assertCommercialLaunchAuthorized } from "./commercial-launch-gate.server";
import { commerceFingerprint } from "./agent-commerce-delivery.server";

export const NEVERMINED_ENVIRONMENTS = {
  sandbox: {
    facilitator_url: "https://facilitator.sandbox.nevermined.app",
    commercial_revenue: false,
  },
  live: {
    facilitator_url: "https://facilitator.live.nevermined.app",
    commercial_revenue: true,
  },
} as const;

export type NeverminedEnvironment = keyof typeof NEVERMINED_ENVIRONMENTS;
export type NeverminedScheme = "nvm:erc4337" | "nvm:card-delegation";

export type NeverminedX402Config = {
  environment: NeverminedEnvironment;
  facilitatorUrl: string;
  apiKey: string;
  planId: string;
  scheme: NeverminedScheme;
  maxAmount: bigint;
  commercialRevenue: boolean;
};

const PLAN_ID = /^[0-9]{1,96}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,38}$/;
const SAFE_SECRET = /^[^\u0000-\u001F\u007F]{1,4096}$/;

function required(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!SAFE_SECRET.test(value)) throw new Error(`${name} is not configured or contains invalid control characters`);
  return value;
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
    facilitatorUrl: expected.facilitator_url,
    apiKey,
    planId,
    scheme: schemeRaw,
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
  return buildPaymentRequired(config.planId, {
    endpoint,
    httpVerb: "POST",
    scheme: config.scheme,
    environment: config.environment,
    description:
      "Geomacro source-governed geopolitical and macro risk intelligence for autonomous agents.",
    mimeType: "application/json",
  });
}

function neverminedPayments(config: NeverminedX402Config) {
  return Payments.getInstance({
    nvmApiKey: config.apiKey,
    environment: config.environment,
  });
}

export async function verifyNeverminedPermissions(input: {
  config: NeverminedX402Config;
  paymentRequired: X402PaymentRequired;
  token: string;
}): Promise<VerifyPermissionsResult> {
  return neverminedPayments(input.config).facilitator.verifyPermissions({
    paymentRequired: input.paymentRequired,
    x402AccessToken: input.token,
    maxAmount: input.config.maxAmount,
  });
}

export async function settleNeverminedPermissions(input: {
  config: NeverminedX402Config;
  paymentRequired: X402PaymentRequired;
  token: string;
  agentRequestId?: string;
}): Promise<SettlePermissionsResult> {
  return neverminedPayments(input.config).facilitator.settlePermissions({
    paymentRequired: input.paymentRequired,
    x402AccessToken: input.token,
    maxAmount: input.config.maxAmount,
    ...(input.agentRequestId ? { agentRequestId: input.agentRequestId } : {}),
  });
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
  // matching the SDK contract. A successful credit redemption still needs
  // positive redeemed credits before Geomacro releases the paid response.
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
