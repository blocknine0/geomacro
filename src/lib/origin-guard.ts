import { getRequestHeader } from "@tanstack/react-start/server";

const DEFAULT_ALLOWED_ORIGINS = [
  "geomacro.live",
  "www.geomacro.live",
  "geomacrooracle.lovable.app",
  "id-preview--06310982-d80d-4d51-a786-7a015bd39be3.lovable.app",
] as const;

function normalizedRequestHost() {
  const forwarded = getRequestHeader("x-forwarded-host") ?? "";
  const direct = getRequestHeader("host") ?? "";
  return (forwarded || direct)
    .split(",")[0]
    .trim()
    .toLowerCase()
    .split(":")[0];
}

function allowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function parseOriginHost() {
  const raw = getRequestHeader("origin") ?? getRequestHeader("referer") ?? "";
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    throw new Error("Forbidden");
  }
}

function assertOrigin(options: { allowMissingOrigin: boolean }) {
  const originHost = parseOriginHost();
  const requestHost = normalizedRequestHost();

  // TanStack/Lovable can invoke a same-site public server function without
  // forwarding browser Origin/Referer through the internal transport. Public
  // read surfaces are safe to accept that transport shape; sensitive actions
  // continue to require an explicit origin below via assertSameOrigin().
  if (!originHost) {
    if (options.allowMissingOrigin) return;
    throw new Error("Forbidden");
  }

  if (requestHost && originHost === requestHost) return;
  if (originHost === "localhost" || originHost === "127.0.0.1") return;
  if (requestHost === "localhost" || requestHost === "127.0.0.1") return;
  if (allowedOrigins().has(originHost)) return;

  throw new Error("Forbidden");
}

/**
 * Strict same-origin check for sensitive/authenticated or quota-bearing server
 * functions. Missing Origin/Referer remains fail-closed.
 */
export function assertSameOrigin() {
  assertOrigin({ allowMissingOrigin: false });
}

/**
 * Browser-origin protection for public, rate-limited/read-only product
 * surfaces. Cross-origin browser requests are rejected when Origin/Referer is
 * present, while framework-internal same-site calls that omit those headers
 * remain usable in production.
 */
export function assertPublicReadOrigin() {
  assertOrigin({ allowMissingOrigin: true });
}
