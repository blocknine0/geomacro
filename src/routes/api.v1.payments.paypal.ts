import { createFileRoute } from "@tanstack/react-router";
import { paypalPublicConnectionStatus } from "../lib/paypal-api.server";

const SAFE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

/** Read-only cross-border merchant onboarding status. Never initiates a charge. */
export const Route = createFileRoute("/api/v1/payments/paypal")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: SAFE_HEADERS }),
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        if (url.search || url.hash)
          return Response.json({ ok: false, code: "PAYPAL_DISCOVERY_QUERY_UNSUPPORTED" }, {
            status: 400, headers: SAFE_HEADERS,
          });
        return Response.json(paypalPublicConnectionStatus(), { headers: SAFE_HEADERS });
      },
      POST: async () => Response.json({
        ok: false, chargeable: false, payment_authorized: false,
        code: "PAYPAL_MERCHANT_AND_LEDGER_NOT_LIVE",
      }, { status: 503, headers: SAFE_HEADERS }),
    },
  },
});
