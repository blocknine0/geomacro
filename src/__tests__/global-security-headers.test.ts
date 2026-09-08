import { describe, expect, it } from "vitest";

import {
  applyGlobalSecurityHeaders,
  GLOBAL_SECURITY_HEADER_CONTRACT,
  secureServerResponse,
} from "../lib/security-headers";

describe("global server security headers", () => {
  it("applies low-risk browser security controls without a restrictive source CSP", () => {
    const headers = applyGlobalSecurityHeaders(
      new Headers(),
      "https://geomacro.live/intelligence",
    );

    expect(headers.get("content-security-policy")).toBe(
      GLOBAL_SECURITY_HEADER_CONTRACT.content_security_policy,
    );
    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(headers.get("content-security-policy")).not.toContain("script-src");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("adds HSTS only for HTTPS requests", () => {
    const https = applyGlobalSecurityHeaders(
      new Headers(),
      "https://geomacro.live/",
    );
    expect(https.get("strict-transport-security")).toBe("max-age=31536000");

    const http = applyGlobalSecurityHeaders(
      new Headers({ "strict-transport-security": "unsafe-existing-value" }),
      "http://localhost:3000/",
    );
    expect(http.has("strict-transport-security")).toBe(false);
  });

  it("preserves route-specific cache and content headers", async () => {
    const original = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-powered-by": "example-framework",
        server: "example-server",
      },
    });

    const secured = secureServerResponse(
      original,
      "https://geomacro.live/api/risk-gate",
    );

    expect(secured.status).toBe(200);
    expect(secured.headers.get("cache-control")).toBe("no-store");
    expect(secured.headers.get("content-type")).toContain("application/json");
    expect(secured.headers.has("x-powered-by")).toBe(false);
    expect(secured.headers.has("server")).toBe(false);
    await expect(secured.json()).resolves.toEqual({ ok: true });
  });

  it("applies the same boundary to error responses", () => {
    const response = secureServerResponse(
      new Response("error", { status: 500 }),
      "https://geomacro.live/",
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("does not wrap protocol switching responses", () => {
    const switching = new Response(null, { status: 101 });
    expect(secureServerResponse(switching, "https://geomacro.live/")).toBe(switching);
  });
});
