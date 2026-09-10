import { createError, defineEventHandler, setResponseHeaders } from "h3";

import {
  requireTestnetUsdcReceiver,
  TESTNET_USDC_ACCESS_CHAINS,
  TESTNET_USDC_ACCESS_CREDITS,
  TESTNET_USDC_ACCESS_DURATION_DAYS,
  TESTNET_USDC_ACCESS_PRICE_USDC,
} from "../../../src/lib/testnet-usdc-access-contract";
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
        price_usdc: TESTNET_USDC_ACCESS_PRICE_USDC,
        credits: TESTNET_USDC_ACCESS_CREDITS,
        duration_days: TESTNET_USDC_ACCESS_DURATION_DAYS,
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
