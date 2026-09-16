import { defineEventHandler, getRequestURL, setResponseHeaders } from "h3";

import { buildX402DiscoveryDocument } from "../../../src/lib/x402-discovery.server";

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=120, must-revalidate",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });

  return await buildX402DiscoveryDocument(getRequestURL(event).origin);
});
