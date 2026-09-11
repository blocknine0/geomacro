import { defineEventHandler, setResponseHeaders, setResponseStatus } from "h3";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  setResponseStatus(event, 204);
  return null;
});
