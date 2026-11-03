import { createFileRoute } from "@tanstack/react-router";
import { captureCustomerPayPalOrder } from "../lib/paypal-customer-checkout.server";
const H={ "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Methods":"POST, OPTIONS" } as const;
/** Fail-closed checkout. The shared central emergency boundary executes
 * before this handler; SSR and D1 Worker independently require verified
 * merchant, existing funded-runtime approval and real-money security ACKs.
 */
export const Route=createFileRoute("/api/v1/payments/paypal_/capture-order")({
 server:{handlers:{
  OPTIONS:async()=>new Response(null,{status:204,headers:H}),
  POST:async({request}:{request:Request})=>captureCustomerPayPalOrder(request),
 }},
});
