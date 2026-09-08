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

export function applyGlobalSecurityHeaders(
  inputHeaders: Headers,
  requestUrl: string,
): Headers {
  const headers =
    new Headers(
      inputHeaders,
    );

  headers.set(
    "Content-Security-Policy",
    MINIMAL_ENFORCED_CSP,
  );

  headers.set(
    "X-Frame-Options",
    "DENY",
  );

  headers.set(
    "X-Content-Type-Options",
    "nosniff",
  );

  headers.set(
    "Referrer-Policy",
    "strict-origin-when-cross-origin",
  );

  headers.set(
    "Permissions-Policy",
    PERMISSIONS_POLICY,
  );

  const url =
    new URL(
      requestUrl,
    );

  if (
    url.protocol ===
    "https:"
  ) {
    // Do not includeSubDomains/preload until every current/future subdomain
    // is explicitly reviewed for HTTPS-only compatibility.
    headers.set(
      "Strict-Transport-Security",
      "max-age=31536000",
    );
  } else {
    headers.delete(
      "Strict-Transport-Security",
    );
  }

  // Avoid unnecessary framework/runtime fingerprint leakage when those
  // headers are supplied by the application layer. Edge providers may still
  // add their own infrastructure headers outside application control.
  headers.delete(
    "X-Powered-By",
  );
  headers.delete(
    "Server",
  );

  return headers;
}

export function secureServerResponse(
  response: Response,
  requestUrl: string,
): Response {
  // Do not wrap protocol-switching responses if the runtime supplies one.
  if (
    response.status === 101
  ) {
    return response;
  }

  return new Response(
    response.body,
    {
      status:
        response.status,
      statusText:
        response.statusText,
      headers:
        applyGlobalSecurityHeaders(
          response.headers,
          requestUrl,
        ),
    },
  );
}

export const GLOBAL_SECURITY_HEADER_CONTRACT = {
  content_security_policy:
    MINIMAL_ENFORCED_CSP,
  permissions_policy:
    PERMISSIONS_POLICY,
  hsts:
    "max-age=31536000",
} as const;
