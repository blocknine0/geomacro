export const TESTNET_API_CREDIT_PRICE_USDC = 0.5 as const;
export const TESTNET_API_CREDIT_PRICE_ATOMIC = 500_000n;
export const TESTNET_API_FIXED_CREDITS = 500 as const;
export const TESTNET_API_PRICING_VERSION = "testnet-api-pricing-v1.1.0" as const;

export function testnetApiCallPriceUsdc(creditCost: number) {
  if (!Number.isInteger(creditCost) || creditCost < 1) {
    throw new Error("TESTNET_API_CREDIT_COST_INVALID");
  }
  return creditCost * TESTNET_API_CREDIT_PRICE_USDC;
}

export function testnetApiCallPriceAtomic(creditCost: number) {
  if (!Number.isInteger(creditCost) || creditCost < 1) {
    throw new Error("TESTNET_API_CREDIT_COST_INVALID");
  }
  return BigInt(creditCost) * TESTNET_API_CREDIT_PRICE_ATOMIC;
}

export const TESTNET_API_PRICING_BOUNDARY = {
  environment: "testnet",
  asset: "USDC",
  payment_model: "pay_per_call",
  upfront_payment_required: false,
  credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
  max_credits_per_30_days: TESTNET_API_FIXED_CREDITS,
  payment_is_real_revenue: false,
  applies_to_mainnet: false,
} as const;
