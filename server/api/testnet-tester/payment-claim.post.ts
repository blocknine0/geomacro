import { createError, defineEventHandler, setResponseHeaders } from "h3";

import { requireTesterPrincipal } from "../../../src/lib/testnet-tester-http.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  await requireTesterPrincipal(event);
  throw createError({
    statusCode: 410,
    statusMessage: "TESTNET_UPFRONT_ACTIVATION_RETIRED",
    data: {
      payment_model: "pay_per_call",
      upfront_payment_required: false,
      message: "Testnet Developer API access no longer requires an upfront payment. Pay only for each API call after receiving its 402 quote.",
    },
  });
});
