import { createFileRoute } from "@tanstack/react-router";
import { handlePayPalPaidWebhook,livePayPalSettlementConfigured } from
  "../lib/paypal-verified-funding.server";

const SAFE_HEADERS={
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
} as const;

/** Canonical server-only PayPal signed webhook. PayPal is never allowed to
 * submit a balance or an arbitrary principal id. Credits are derived from the
 * immutable bound checkout intent and separately fetched LIVE capture. */
export const Route=createFileRoute("/api/v1/payments/webhook")({
  server:{handlers:{
    POST:async({request}:{request:Request})=>{
      if(!livePayPalSettlementConfigured())return Response.json({
        ok:false,code:"PAYPAL_LIVE_SETTLEMENT_NOT_APPROVED",
      },{status:503,headers:SAFE_HEADERS});
      if(Number(request.headers.get("content-length")??0)>64_000)
        return Response.json({ok:false,code:"PAYPAL_WEBHOOK_TOO_LARGE"},
          {status:413,headers:SAFE_HEADERS});
      try{
        const body=await request.text();
        const result=await handlePayPalPaidWebhook(body,request.headers);
        return Response.json(result,{status:200,headers:SAFE_HEADERS});
      }catch{
        // Rejected/temporarily unavailable verification never funds credits.
        // Returning 503 permits PayPal to retry transient provider failures.
        return Response.json({ok:false,code:"PAYPAL_VERIFICATION_OR_SETTLEMENT_UNAVAILABLE"},
          {status:503,headers:SAFE_HEADERS});
      }
    },
  }},
});
