const MINIMAL_ENFORCED_CSP = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
].join(", ");

const NOINDEX_FOLLOW_PATHS = new Set([
  "/arena",
  "/bridge-swap",
  "/demo",
  "/onchain",
  "/pipeline",
  "/portfolio",
  "/testnet-access",
]);

function applySearchIndexingHeaders(headers: Headers, requestUrl: string, status: number) {
  const url = new URL(requestUrl);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  // Error responses, machine endpoints and internal/test tooling should never
  // become search results. This header also covers non-HTML responses where a
  // page-level <meta name="robots"> tag cannot exist.
  if (
    status >= 400 ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/internal/") ||
    pathname === "/testnet-console"
  ) {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return;
  }

  // Keep secondary technical-proof and tester surfaces directly accessible,
  // while preventing them from competing with Geomacro's primary risk-
  // intelligence pages in search. `follow` preserves link discovery.
  if (NOINDEX_FOLLOW_PATHS.has(pathname)) {
    headers.set("X-Robots-Tag", "noindex, follow, noarchive");
  }
}

/**
 * Apply low-risk browser security controls without introducing a restrictive
 * source allow-list that could accidentally break wallet, Circle, Arc, RPC or
 * other current external integrations.
 *
 * A stricter source CSP should be introduced only after report-only
 * observation against the real production integration set.
 */
export function applyGlobalSecurityHeaders(
  inputHeaders: Headers,
  requestUrl: string,
): Headers {
  const headers = new Headers(inputHeaders);

  headers.set("Content-Security-Policy", MINIMAL_ENFORCED_CSP);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);

  const url = new URL(requestUrl);
  if (url.protocol === "https:") {
    // Do not add includeSubDomains/preload until every current/future
    // subdomain is explicitly reviewed for HTTPS-only compatibility.
    headers.set("Strict-Transport-Security", "max-age=31536000");
  } else {
    headers.delete("Strict-Transport-Security");
  }

  // Avoid unnecessary application-layer runtime fingerprint leakage. Edge
  // infrastructure may still add provider headers outside application control.
  headers.delete("X-Powered-By");
  headers.delete("Server");

  return headers;
}

export function secureServerResponse(
  response: Response,
  requestUrl: string,
): Response {
  // Protocol-switching responses must remain untouched.
  if (response.status === 101) return response;

  const headers = applyGlobalSecurityHeaders(response.headers, requestUrl);
  applySearchIndexingHeaders(headers, requestUrl, response.status);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const GLOBAL_SECURITY_HEADER_CONTRACT = {
  content_security_policy: MINIMAL_ENFORCED_CSP,
  permissions_policy: PERMISSIONS_POLICY,
  hsts: "max-age=31536000",
} as const;
