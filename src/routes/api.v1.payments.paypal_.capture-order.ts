import { createFileRoute } from "@tanstack/react-router";
const H = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Methods": "POST, OPTIONS" } as const;

/** No PayPal network capture, ledger write or credit grant without acceptance. */
export const Route = createFileRoute("/api/v1/payments/paypal_/capture-order")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers: H }),
    POST: async () => Response.json({
      ok: false, code: "PAYPAL_CHECKOUT_LOCKED",
      captured: false, credits_funded: 0, payment_authorized: false,
    }, { status: 423, headers: H }),
  }},
});
