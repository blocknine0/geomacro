import process from "node:process";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";

import { assertCommercialLaunchAuthorized } from "./commercial-launch-gate.server";
import { assertProviderRealFundsSecurityReady } from "./provider-real-funds-security.server";

export const CIRCLE_X402_PRODUCTION_ACK = "I_ACCEPT_REAL_USDC" as const;
export const CIRCLE_X402_BASE_MAINNET_NETWORK = "eip155:8453" as const;
export const CIRCLE_X402_BASE_MAINNET_USDC =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const CIRCLE_X402_MAX_TIMEOUT_SECONDS = 604900 as const;

export type CircleGatewayProductionConfig = {
  environment: "production";
  sellerAddress: `0x${string}`;
  priceUsdc: string;
  amountAtomic: string;
  networks: readonly [typeof CIRCLE_X402_BASE_MAINNET_NETWORK];
};

export type CircleGatewayPaymentRequirement = {
  scheme: "exact";
  network: typeof CIRCLE_X402_BASE_MAINNET_NETWORK;
  asset: typeof CIRCLE_X402_BASE_MAINNET_USDC;
  amount: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: typeof CIRCLE_X402_MAX_TIMEOUT_SECONDS;
  extra: Record<string, unknown>;
};

function parsePositiveUsdcAtomic(value: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(normalized)) {
    throw new Error("CIRCLE_X402_PRODUCTION_PRICE_INVALID");
  }

  const [whole, fraction = ""] = normalized.split(".");
  const atomic = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (atomic <= 0n) throw new Error("CIRCLE_X402_PRODUCTION_PRICE_MUST_BE_POSITIVE");
  return atomic.toString();
}

function requireSellerAddress() {
  const value = process.env.CIRCLE_X402_SELLER_ADDRESS?.trim();
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error("CIRCLE_X402_SELLER_ADDRESS_INVALID");
  }
  return value as `0x${string}`;
}

function facilitator() {
  return new BatchFacilitatorClient();
}

export function getCircleGatewayProductionConfig(): CircleGatewayProductionConfig | null {
  const environment = process.env.CIRCLE_X402_ENVIRONMENT?.trim().toLowerCase() ?? "";
  if (!environment) return null;
  if (environment !== "production") {
    throw new Error("CIRCLE_X402_ENVIRONMENT_MUST_BE_PRODUCTION_OR_BLANK");
  }

  assertProviderRealFundsSecurityReady();
  assertCommercialLaunchAuthorized("circle_gateway_x402");

  if (process.env.CIRCLE_X402_MAINNET_ACK?.trim() !== CIRCLE_X402_PRODUCTION_ACK) {
    throw new Error("CIRCLE_X402_MAINNET_ACK_REQUIRED");
  }

  const requestedNetworks =
    process.env.CIRCLE_X402_PRODUCTION_NETWORKS?.trim() ||
    CIRCLE_X402_BASE_MAINNET_NETWORK;
  const networks = requestedNetworks
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    networks.length !== 1 ||
    networks[0] !== CIRCLE_X402_BASE_MAINNET_NETWORK
  ) {
    throw new Error(
      "CIRCLE_X402_PRODUCTION_NETWORK_NOT_APPROVED:only_public_Base_mainnet_is_preapproved",
    );
  }

  const priceUsdc = process.env.CIRCLE_X402_PRICE_USDC?.trim() ?? "";
  const amountAtomic = parsePositiveUsdcAtomic(priceUsdc);

  return {
    environment: "production",
    sellerAddress: requireSellerAddress(),
    priceUsdc,
    amountAtomic,
    networks: [CIRCLE_X402_BASE_MAINNET_NETWORK],
  };
}

export async function getCircleGatewayProductionRequirement(
  config: CircleGatewayProductionConfig,
): Promise<CircleGatewayPaymentRequirement> {
  const supported = await facilitator().getSupported();
  const kind = supported.kinds.find(
    (candidate) =>
      candidate.x402Version === 2 &&
      candidate.scheme === "exact" &&
      candidate.network === CIRCLE_X402_BASE_MAINNET_NETWORK &&
      candidate.extra?.name === "GatewayWalletBatched",
  );

  if (!kind?.extra?.verifyingContract) {
    throw new Error("CIRCLE_GATEWAY_BASE_MAINNET_NOT_CURRENTLY_SUPPORTED");
  }

  return {
    scheme: "exact",
    network: CIRCLE_X402_BASE_MAINNET_NETWORK,
    asset: CIRCLE_X402_BASE_MAINNET_USDC,
    amount: config.amountAtomic,
    payTo: config.sellerAddress,
    maxTimeoutSeconds: CIRCLE_X402_MAX_TIMEOUT_SECONDS,
    extra: { ...kind.extra },
  };
}

export async function verifyCircleGatewayProduction(
  paymentPayload: unknown,
  requirement: CircleGatewayPaymentRequirement,
) {
  assertProviderRealFundsSecurityReady();
  assertCommercialLaunchAuthorized("circle_gateway_x402");

  const verified = await facilitator().verify(
    paymentPayload as Parameters<BatchFacilitatorClient["verify"]>[0],
    requirement as Parameters<BatchFacilitatorClient["verify"]>[1],
  );

  return {
    valid: verified.isValid === true,
    invalid_reason: verified.invalidReason ?? null,
    payer: verified.payer ?? null,
  };
}

export async function settleCircleGatewayProduction(
  paymentPayload: unknown,
  requirement: CircleGatewayPaymentRequirement,
) {
  assertProviderRealFundsSecurityReady();
  assertCommercialLaunchAuthorized("circle_gateway_x402");

  const client = facilitator();
  const settled = await client.settle(
    paymentPayload as Parameters<typeof client.settle>[0],
    requirement as Parameters<typeof client.settle>[1],
  );

  if (!settled.success) {
    throw new Error(
      `CIRCLE_GATEWAY_PRODUCTION_SETTLEMENT_FAILED:${settled.errorReason ?? "unknown"}`,
    );
  }

  return {
    payer: settled.payer ?? null,
    settlement_reference: settled.transaction ?? null,
    network: settled.network || requirement.network,
    amount_atomic: requirement.amount,
    amount_usdc: (Number(requirement.amount) / 1_000_000)
      .toFixed(6)
      .replace(/0+$/, "")
      .replace(/\.$/, ""),
    accounting_state: "commercial_pending_accounting" as const,
    reconciliation_required: true as const,
    execution_authorized: false as const,
  };
}
