import { createHash } from "node:crypto";
import process from "node:process";
import type { CoinbaseX402Config } from "./coinbase-x402.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const DEFAULT_MAINNET_MAX_PRICE_USDC = "0.02";
const DEFAULT_DAILY_SPEND_USDC = "1.00";
const DEFAULT_DAILY_REQUEST_LIMIT = 50;

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function usdcAtomic(value: string, field: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/.test(normalized)) {
    throw new Error(`${field} must be a non-negative USDC decimal with at most 6 decimals`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}

function dailyRequestLimit() {
  const raw = Number(process.env.COINBASE_X402_AGENT_DAILY_REQUEST_LIMIT ?? DEFAULT_DAILY_REQUEST_LIMIT);
  if (!Number.isInteger(raw) || raw < 1 || raw > 100_000) {
    throw new Error("COINBASE_X402_AGENT_DAILY_REQUEST_LIMIT must be an integer from 1 to 100000");
  }
  return raw;
}

export type CoinbaseX402UsageReservation = {
  enforced: boolean;
  disposition: "RESERVED" | "SPEND_LIMIT" | "REQUEST_LIMIT" | "CONFLICT" | "MANUAL_REVIEW" | "NOT_ENFORCED_TESTNET";
  payer_hash: string | null;
  max_daily_amount_atomic: string | null;
  max_daily_requests: number | null;
};

export async function reserveCoinbaseX402AgentUsage(input: {
  paymentFingerprint: string;
  payer: string | null | undefined;
  config: CoinbaseX402Config;
}): Promise<CoinbaseX402UsageReservation> {
  if (input.config.environment !== "production") {
    return {
      enforced: false,
      disposition: "NOT_ENFORCED_TESTNET",
      payer_hash: null,
      max_daily_amount_atomic: null,
      max_daily_requests: null,
    };
  }

  const payer = String(input.payer ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(payer)) throw new Error("X402_VERIFIED_PAYER_REQUIRED");

  const maxPriceAtomic = usdcAtomic(
    process.env.COINBASE_X402_AGENT_MAX_PRICE_USDC ?? DEFAULT_MAINNET_MAX_PRICE_USDC,
    "COINBASE_X402_AGENT_MAX_PRICE_USDC",
  );
  const priceAtomic = BigInt(input.config.amountAtomic);
  if (priceAtomic > maxPriceAtomic) throw new Error("X402_PER_REQUEST_PRICE_LIMIT_EXCEEDED");

  const maxDailyAtomic = usdcAtomic(
    process.env.COINBASE_X402_AGENT_DAILY_SPEND_LIMIT_USDC ?? DEFAULT_DAILY_SPEND_USDC,
    "COINBASE_X402_AGENT_DAILY_SPEND_LIMIT_USDC",
  );
  if (maxDailyAtomic < priceAtomic) throw new Error("X402_DAILY_SPEND_LIMIT_BELOW_REQUEST_PRICE");

  const payerHash = sha256(payer);
  const requests = dailyRequestLimit();
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("reserve_coinbase_x402_usage", {
    p_payment_fingerprint: input.paymentFingerprint,
    p_payer_hash: payerHash,
    p_environment: input.config.commercialEnvironment,
    p_amount_atomic: input.config.amountAtomic,
    p_max_daily_amount_atomic: maxDailyAtomic.toString(),
    p_max_daily_requests: requests,
  });
  if (error) throw error;
  const disposition = String(data ?? "") as CoinbaseX402UsageReservation["disposition"];
  if (!["RESERVED", "SPEND_LIMIT", "REQUEST_LIMIT", "CONFLICT", "MANUAL_REVIEW"].includes(disposition)) {
    throw new Error("X402_USAGE_GUARD_INVALID_RESPONSE");
  }
  return {
    enforced: true,
    disposition,
    payer_hash: payerHash,
    max_daily_amount_atomic: maxDailyAtomic.toString(),
    max_daily_requests: requests,
  };
}

export async function finalizeCoinbaseX402AgentUsage(paymentFingerprint: string) {
  const db = requireRiskSupabase();
  const { data, error } = await db.rpc("finalize_coinbase_x402_usage", {
    p_payment_fingerprint: paymentFingerprint,
  });
  if (error) throw error;
  if (data !== true) throw new Error("X402_USAGE_RESERVATION_FINALIZE_FAILED");
}

export async function releaseCoinbaseX402AgentUsage(
  paymentFingerprint: string,
  manualReview = false,
) {
  const db = requireRiskSupabase();
  const { error } = await db.rpc("release_coinbase_x402_usage", {
    p_payment_fingerprint: paymentFingerprint,
    p_manual_review: manualReview,
  });
  if (error) console.error("[coinbase-x402] usage reservation release failed", error);
}
