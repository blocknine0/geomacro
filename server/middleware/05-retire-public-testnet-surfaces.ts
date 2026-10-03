import { defineEventHandler, getRequestURL, sendRedirect } from "h3";

const RETIRED_PUBLIC_TESTNET_PATHS = new Set([
  "/testnet-access",
  "/testnet-console",
]);

/**
 * Buyer-facing production traffic must not land on the legacy Testnet tester
 * portals after commercial launch. Keep the underlying route implementations
 * and /api/testnet-* contracts in the repository as technical validation and
 * recovery surfaces, but retire their public deep links before route matching.
 *
 * Exact-path matching is intentional: this middleware must never intercept
 * Testnet APIs, assets, or any unrelated customer-serving route.
 */
export default defineEventHandler((event) => {
  const method = String(event.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return;

  const pathname = getRequestURL(event).pathname;
  if (!RETIRED_PUBLIC_TESTNET_PATHS.has(pathname)) return;

  return sendRedirect(event, "/data-api", 308);
});
