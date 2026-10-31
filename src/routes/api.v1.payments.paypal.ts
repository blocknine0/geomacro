import { createFileRoute } from "@tanstack/react-router";
import { paypalPublicConnectionStatus } from "../lib/paypal-api.server";
import { authenticateCommercialApiRequest } from "../lib/commercial-access.server";
import { livePayPalSettlementConfigured, createPayPalCheckout,
  captureApprovedPayPalOrder } from "../lib/paypal-verified-funding.server";

const SAFE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
} as const;

/** PayPal is separately configured cross-border FIAT checkout, NOT card-to-USDC.
 * No buyer can initiate a charge before the founder explicitly approves LIVE
 * settlement after provider KYC and sets all server-side credentials. */
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
        return Response.json({
          ...paypalPublicConnectionStatus(),
          active_checkout_enabled: livePayPalSettlementConfigured(),
          credit_funding_enabled: livePayPalSettlementConfigured(),
        }, { headers: SAFE_HEADERS });
      },
      POST: async ({ request }: { request: Request }) => {
        if (!livePayPalSettlementConfigured()) return Response.json({
          ok: false, chargeable: false, payment_authorized: false,
          code: "PAYPAL_MERCHANT_AND_LEDGER_NOT_LIVE",
        }, { status: 503, headers: SAFE_HEADERS });
        if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
          return Response.json({ ok: false, code: "PAYPAL_JSON_REQUIRED" },
            { status: 415, headers: SAFE_HEADERS });
        try {
          const raw=await request.text();
          if(new TextEncoder().encode(raw).byteLength>4096)
            return Response.json({ok:false,code:"PAYPAL_REQUEST_TOO_LARGE"},
              {status:413,headers:SAFE_HEADERS});
          const body:unknown=JSON.parse(raw);
          if(!body||Array.isArray(body)||typeof body!=="object")
            return Response.json({ok:false,code:"PAYPAL_REQUEST_INVALID"},
              {status:400,headers:SAFE_HEADERS});
          const input=body as Record<string,unknown>;
          const principal=await authenticateCommercialApiRequest(request);
          if(input.action==="create" && typeof input.sku==="string" &&
             Object.keys(input).every(k=>["action","sku"].includes(k))) {
            const order=await createPayPalCheckout({
              principalId:principal.principal_id,sku:input.sku,
            });
            return Response.json(order,{headers:SAFE_HEADERS});
          }
          if(input.action==="capture" && typeof input.order_id==="string" &&
             Object.keys(input).every(k=>["action","order_id"].includes(k))) {
            const result=await captureApprovedPayPalOrder({
              principalId:principal.principal_id,orderId:input.order_id,
            });
            return Response.json(result,{headers:SAFE_HEADERS});
          }
          return Response.json({ok:false,code:"PAYPAL_ACTION_INVALID"},
            {status:400,headers:SAFE_HEADERS});
        } catch (error) {
          const status=error && typeof error==="object" && "status" in error
            && typeof error.status==="number" ? error.status : 503;
          return Response.json({ok:false,
            code:status===401?"COMMERCIAL_API_KEY_REQUIRED":"PAYPAL_CHECKOUT_UNAVAILABLE"},
            {status,headers:SAFE_HEADERS});
        }
      },
    },
  },
});
