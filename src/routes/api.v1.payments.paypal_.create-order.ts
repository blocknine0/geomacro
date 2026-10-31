import { createFileRoute } from "@tanstack/react-router";
const H = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Methods": "POST, OPTIONS" } as const;

/**
 * Stable dedicated Orders-v2 adapter path, intentionally non-payable until
 * PR #3264's durable ledger, merchant KYC and signed webhook pass acceptance.
 * Never trust caller SKU price, principal, balance or order reference.
 */
export const Route = createFileRoute("/api/v1/payments/paypal_/create-order")({
  server: { handlers: {
    OPTIONS: async () => new Response(null, { status: 204, headers: H }),
    POST: async () => Response.json({
      ok: false, code: "PAYPAL_CHECKOUT_LOCKED",
      payment_authorized: false, order_created: false, credits_funded: 0,
    }, { status: 423, headers: H }),
  }},
});
