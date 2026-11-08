import { createFileRoute } from "@tanstack/react-router";
import { paypalVerifiedStoreReadiness } from "../lib/paypal-api.server";
import { handleVerifiedPayPalCommercialWebhook } from "../lib/paypal-completed-webhook.server";

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
        return Response.json(await paypalVerifiedStoreReadiness(request), { headers: SAFE_HEADERS });
      },
      // Capture.completed is verified and reconciled against the original D1
      // order/merchant before funding; refunds stay active under freeze.
      // Neither type of webhook initiates a provider capture.
      POST: async ({request}:{request:Request})=>
        handleVerifiedPayPalCommercialWebhook(request),
    },
  },
});
