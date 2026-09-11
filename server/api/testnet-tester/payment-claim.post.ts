import { createError, defineEventHandler, readBody, setResponseHeaders } from "h3";

import {
  TESTNET_API_CREDIT_PRICE_USDC,
  TESTNET_API_FIXED_CREDITS,
  TESTNET_API_FIXED_QUOTA_USDC,
  TESTNET_API_PRICING_VERSION,
} from "../../../src/lib/testnet-api-pricing";
import { activateTestnetTesterPayment } from "../../../src/lib/testnet-tester-payment.server";
import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const session = await requireTesterPrincipal(event);
  const body = await readBody<Record<string, unknown>>(event);

  const result = await activateTestnetTesterPayment({
    principal_id: session.principalId,
    chain_key: String(body?.chain_key ?? ""),
    tx_hash: String(body?.tx_hash ?? ""),
    payer_address: String(body?.payer_address ?? ""),
  });

  if (!result.ok) {
    throw createError({ statusCode: 400, statusMessage: result.code.slice(0, 120) });
  }

  return {
    ok: true,
    data: {
      ...result,
      credits_granted: result.idempotent_replay ? 0 : TESTNET_API_FIXED_CREDITS,
      quota_credits: TESTNET_API_FIXED_CREDITS,
      credit_price_usdc: TESTNET_API_CREDIT_PRICE_USDC,
      quota_price_usdc: TESTNET_API_FIXED_QUOTA_USDC,
      pricing_version: TESTNET_API_PRICING_VERSION,
      fixed_quota: true,
      payment_environment: "testnet",
      commercial_revenue: false,
    },
    execution_authorized: false,
  };
});
