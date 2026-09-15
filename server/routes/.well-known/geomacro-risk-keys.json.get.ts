import { defineEventHandler, getRequestURL, setResponseHeaders } from "h3";

import {
  publicRiskObjectTrustDiscovery,
} from "../../../src/lib/risk-object-trust-discovery.server";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300, must-revalidate",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });

  const requestUrl = getRequestURL(event);
  return publicRiskObjectTrustDiscovery(requestUrl.origin);
});
