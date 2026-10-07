import { createError, defineEventHandler, getRequestURL, sendRedirect } from "h3";

const RETIRED_PUBLIC_PATHS = new Map<string, string>([
  ["/testnet-access", "/data-api"],
  ["/testnet-console", "/data-api"],
  ["/arena", "/intelligence"],
  ["/bridge", "/data-api"],
  ["/bridge-swap", "/data-api"],
  ["/onchain", "/data-api"],
  ["/portfolio", "/intelligence"],
  ["/pipeline", "/research"],
  ["/demo", "/data-api"],
  ["/tameion", "/data-api"],
]);

const RETIRED_API_PREFIXES = [
  "/api/testnet",
  "/api/testnet-tester",
  "/api/demo",
  "/api/tameion",
  "/api/goat/pilot",
] as const;

const RETIRED_API_PATHS = new Set([
  "/api/agent/risk",
]);

/**
 * Production public traffic is commercial-only.
 *
 * Legacy experimental pages permanently redirect to the nearest commercial
 * surface. Legacy noncommercial APIs return 404 and cannot be used as an
 * alternate customer delivery path.
 */
export default defineEventHandler((event) => {
  const method = String(event.method || "GET").toUpperCase();
  const pathname = getRequestURL(event).pathname;

  const redirectTarget = RETIRED_PUBLIC_PATHS.get(pathname);
  if (redirectTarget && (method === "GET" || method === "HEAD")) {
    return sendRedirect(event, redirectTarget, 308);
  }

  if (
    RETIRED_API_PATHS.has(pathname) ||
    RETIRED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }
});
