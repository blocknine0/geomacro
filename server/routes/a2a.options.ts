import { defineEventHandler, setResponseHeaders, setResponseStatus } from "h3";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, A2A-Version, A2A-Extensions, Payment-Signature, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
    "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  setResponseStatus(event, 204);
  return null;
});
