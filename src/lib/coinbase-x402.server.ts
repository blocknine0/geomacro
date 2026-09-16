import { createHash, randomBytes } from "node:crypto";
import process from "node:process";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { SignJWT, importJWK, importPKCS8 } from "jose";
import { recordCommercialPaymentEvent } from "./commercial-ops.server";
import { assertCommercialLaunchAuthorized } from "./commercial-launch-gate.server";
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
    // Two independent owner-controlled gates are required. A provider-specific
    // mainnet acknowledgement can never activate Coinbase ahead of the
    // coordinated Geomacro commercial launch.
    assertCommercialLaunchAuthorized("coinbase_x402");
    if (process.env.COINBASE_X402_MAINNET_ACK?.trim() !== COINBASE_X402_MAINNET_ACK) {
      throw new Error(
        `Production x402 is locked. Set COINBASE_X402_MAINNET_ACK=${COINBASE_X402_MAINNET_ACK} only during the coordinated launch after all acceptance gates pass.`,
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

// The remainder of this module is intentionally unchanged by the coordinated
// launch-gate hardening commit. It continues below in repository history.
