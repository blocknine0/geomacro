import {
  createError,
  defineEventHandler,
  getRequestHost,
  getRequestHeaders,
  getRequestURL,
  setResponseHeader,
  setResponseHeaders,
} from "h3";

import {
  CENTRAL_SECURITY_VERSION,
  enforceCentralRequestSecurity,
} from "../../src/lib/central-security.server";
import {
  providerRealFundsSecurityState,
} from "../../src/lib/provider-real-funds-security.server";
import {
  assertRealFundsDatabaseSecurityReady,
} from "../../src/lib/real-funds-security-readiness.server";


/**
 * Geomacro-wide HTTP security boundary.
 *
 * Nitro loads server/middleware before route matching, so this applies to the
 * TanStack renderer, src/routes API handlers, server/api handlers and server
 * functions through one shared enforcement point. Route-specific validation,
 * authentication and idempotency remain defense-in-depth layers behind it.
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Permitted-Cross-Domain-Policies": "none",
    "X-Geomacro-Security-Version": CENTRAL_SECURITY_VERSION,
  });

  const host = getRequestHost(event).toLowerCase();
  if (host === "geomacro.live" || host === "www.geomacro.live") {
    setResponseHeader(
      event,
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  const pathname = getRequestURL(event).pathname;
  const method = event.method || "GET";
  const headers = new Headers(getRequestHeaders(event));

  const decision = await enforceCentralRequestSecurity({
    pathname,
    method,
    headers,
  });

  event.context.geomacroCentralSecurity = {
    version: CENTRAL_SECURITY_VERSION,
    route_class: decision.routeClass,
    code: decision.code,
  };

  if (!decision.allowed) {
    setResponseHeader(event, "Cache-Control", "no-store");
    if (decision.retryAfterSeconds) {
      setResponseHeader(
        event,
        "Retry-After",
        String(decision.retryAfterSeconds),
      );
    }

    throw createError({
      statusCode: decision.status,
      statusMessage: "Request blocked by Geomacro central security policy",
      data: {
        ok: false,
        error: {
          code: decision.code,
          message:
            decision.status === 429
              ? "Request rate exceeded. Retry after the indicated delay."
              : "This request cannot be processed safely at this time.",
        },
        execution_authorized: false,
      },
    });
  }

  if (decision.routeClass === "payment") {
    const realFunds = providerRealFundsSecurityState();

    if (realFunds.required && !realFunds.ready) {
      setResponseHeader(event, "Cache-Control", "no-store");
      throw createError({
        statusCode: 503,
        statusMessage: "Real-funds security gate is locked",
        data: {
          ok: false,
          error: {
            code: "PROVIDER_REAL_FUNDS_SECURITY_GATE_LOCKED",
            message:
              "Production payment rails remain disabled until central security, owner acknowledgement, coordinated launch acknowledgement and dedicated server-side peppers are all configured.",
          },
          execution_authorized: false,
        },
      });
    }

    if (realFunds.required) {
      try {
        await assertRealFundsDatabaseSecurityReady();
      } catch {
        setResponseHeader(event, "Cache-Control", "no-store");
        throw createError({
          statusCode: 503,
          statusMessage: "Real-funds security gate is locked",
          data: {
            ok: false,
            error: {
              code: "REAL_FUNDS_DATABASE_SECURITY_NOT_READY",
              message:
                "Real-funds settlement remains disabled until the central database security posture is verified.",
            },
            execution_authorized: false,
          },
        });
      }
    }
  }
});
