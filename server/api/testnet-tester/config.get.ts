import { createError, defineEventHandler, setResponseHeaders } from "h3";

import {
  requireTestnetUsdcReceiver,
  TESTNET_USDC_ACCESS_CHAINS,
  TESTNET_USDC_ACCESS_DURATION_DAYS,
} from "../../../src/lib/testnet-usdc-access-contract";
import {
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_FIXED_CREDITS,
  TESTNET_API_PRICING_VERSION,
} from "../../../src/lib/testnet-api-pricing";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  await requireTesterPrincipal(event);
  try {
    return {
      ok: true,
      data: {
        receiver_address: requireTestnetUsdcReceiver(),
        credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
        max_credits_per_30_days: TESTNET_API_FIXED_CREDITS,
        duration_days: TESTNET_USDC_ACCESS_DURATION_DAYS,
        pricing_version: TESTNET_API_PRICING_VERSION,
        payment_model: "pay_per_call",
        upfront_payment_required: false,
        chains: Object.values(TESTNET_USDC_ACCESS_CHAINS),
        payment_environment: "testnet",
        commercial_revenue: false,
      },
      execution_authorized: false,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "TESTNET_PAYMENT_CONFIG_UNAVAILABLE";
    throw createError({ statusCode: 503, statusMessage: code.slice(0, 120) });
  }
});
