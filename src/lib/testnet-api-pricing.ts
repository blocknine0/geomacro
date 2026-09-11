export const TESTNET_API_CREDIT_PRICE_USDC = 0.5 as const;
export const TESTNET_API_FIXED_CREDITS = 500 as const;
export const TESTNET_API_FIXED_QUOTA_USDC = 250 as const;
export const TESTNET_API_FIXED_QUOTA_ATOMIC = 250_000_000n;
export const TESTNET_API_PRICING_VERSION = "testnet-api-pricing-v1.0.0" as const;

export const TESTNET_API_PRICING_BOUNDARY = {
  environment: "testnet",
  asset: "USDC",
  credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
  fixed_credits: TESTNET_API_FIXED_CREDITS,
  fixed_quota_usdc: TESTNET_API_FIXED_QUOTA_USDC,
  payment_is_real_revenue: false,
  applies_to_mainnet: false,
} as const;
