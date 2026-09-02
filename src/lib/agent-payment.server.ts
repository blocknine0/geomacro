import {
  AGENT_CAPABILITIES,
  AGENT_ERROR_CODES,
  type AgentCapability,
} from "./agent/agent-api-contract";

export type AgentPaymentConfig = {
  enabled: boolean;
  capability: AgentCapability;
  amount: string;
  asset: string;
  network: string;
  rail: string;
  payTo: string;
  facilitatorUrl: string | null;
};

export type PaymentRequirement = {
  capability: AgentCapability;
  amount: string;
  asset: string;
  network: string;
  rail: string;
  payTo: string;
  facilitatorUrl: string | null;
};

export type PaymentSettlement = {
  status: "accepted" | "failed";
  provider: "x402";
  reference: string | null;
  errorCode?: "PAYMENT_INVALID" | "PAYMENT_SETTLEMENT_FAILED";
};

export type X402Adapter = {
  verifyAndSettle: (input: {
    request: Request;
    requirement: PaymentRequirement;
    paymentHeader: string;
  }) => Promise<PaymentSettlement>;
};

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

/** Pricing is entirely server-configured. No price or unsupported rail is hardcoded. */
export function getAgentPaymentConfig(): AgentPaymentConfig {
  const capability = env("AGENT_PAYMENT_CAPABILITY") ?? AGENT_CAPABILITIES.EVENT_INTELLIGENCE;
  const amount = env("AGENT_PAYMENT_AMOUNT");
  const asset = env("AGENT_PAYMENT_ASSET");
  const network = env("AGENT_PAYMENT_NETWORK");
  const rail = env("AGENT_PAYMENT_RAIL");
  const payTo = env("AGENT_PAYMENT_PAY_TO");
  const facilitatorUrl = env("AGENT_X402_FACILITATOR_URL");
  const enabled = env("AGENT_PAYMENT_ENABLED") === "true";

  const railConfigured =
    rail === "goat-flow" || Boolean(facilitatorUrl);

  if (
    capability !== AGENT_CAPABILITIES.EVENT_INTELLIGENCE ||
    !amount ||
    !/^[0-9]+$/.test(amount) ||
    !asset ||
    !network ||
    !rail ||
    !payTo ||
    !railConfigured
  ) {
    return {
      enabled: false,
      capability: AGENT_CAPABILITIES.EVENT_INTELLIGENCE,
      amount: amount ?? "",
      asset: asset ?? "",
      network: network ?? "",
      rail: rail ?? "",
      payTo: payTo ?? "",
      facilitatorUrl,
    };
  }

  return { enabled, capability, amount, asset, network, rail, payTo, facilitatorUrl };
}

export function paymentRequirement(config = getAgentPaymentConfig()): PaymentRequirement | null {
  if (!config.enabled) return null;
  return {
    capability: config.capability,
    amount: config.amount,
    asset: config.asset,
    network: config.network,
    rail: config.rail,
    payTo: config.payTo,
    facilitatorUrl: config.facilitatorUrl,
  };
}

/**
 * Deliberately conservative default: without an official configured verifier,
 * a payment is never accepted. Tests and a future official x402 adapter can be
 * injected here without changing the intelligence service or route contract.
 */
export async function settleAgentPayment(
  request: Request,
  adapter?: X402Adapter,
): Promise<
  | { ok: true; payment: PaymentSettlement; requirement: PaymentRequirement }
  | {
      ok: false;
      code: (typeof AGENT_ERROR_CODES)[
        | "PAYMENT_REQUIRED"
        | "PAYMENT_INVALID"
        | "PAYMENT_SETTLEMENT_FAILED"
        | "PAYMENT_NOT_CONFIGURED"];
      requirement: PaymentRequirement | null;
    }
> {
  const config = getAgentPaymentConfig();
  const requirement = paymentRequirement(config);
  if (!requirement) {
    return { ok: false, code: AGENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED, requirement: null };
  }

  const paymentHeader =
    request.headers.get("PAYMENT-SIGNATURE") ?? request.headers.get("X-PAYMENT");
  if (!paymentHeader) {
    return { ok: false, code: AGENT_ERROR_CODES.PAYMENT_REQUIRED, requirement };
  }
  if (!adapter) {
    return { ok: false, code: AGENT_ERROR_CODES.PAYMENT_NOT_CONFIGURED, requirement };
  }

  const payment = await adapter.verifyAndSettle({ request, requirement, paymentHeader });
  if (payment.status !== "accepted") {
    return {
      ok: false,
      code: payment.errorCode ?? AGENT_ERROR_CODES.PAYMENT_SETTLEMENT_FAILED,
      requirement,
    };
  }
  return { ok: true, payment, requirement };
}
