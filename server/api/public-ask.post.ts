import { createHash } from "node:crypto";
import {
  defineEventHandler,
  getRequestHeader,
  getRequestHost,
  readBody,
  setResponseHeader,
  setResponseStatus,
} from "h3";

import {
  AskGeomacroRateLimitError,
  executeAskGeomacro,
} from "../../src/lib/ask-geomacro-core.server";

const DEFAULT_ALLOWED_ORIGINS = new Set([
  "geomacro.live",
  "www.geomacro.live",
  "geomacrooracle.lovable.app",
  "id-preview--06310982-d80d-4d51-a786-7a015bd39be3.lovable.app",
]);

function normalizedHost(value: string | undefined | null) {
  return String(value ?? "")
    .split(",", 1)[0]
    .trim()
    .toLowerCase()
    .split(":", 1)[0];
}

function configuredAllowedOrigins() {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => normalizedHost(value))
      .filter(Boolean),
  ]);
}

function assertBrowserOrigin(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]) {
  const rawOrigin =
    getRequestHeader(event, "origin") ??
    getRequestHeader(event, "referer") ??
    "";

  if (!rawOrigin) throw new Error("ASK_ORIGIN_FORBIDDEN");

  let originHost = "";
  try {
    originHost = new URL(rawOrigin).hostname.toLowerCase();
  } catch {
    throw new Error("ASK_ORIGIN_FORBIDDEN");
  }

  const requestHost = normalizedHost(getRequestHost(event));
  if (originHost === requestHost) return;
  if (originHost === "localhost" || originHost === "127.0.0.1") return;
  if (requestHost === "localhost" || requestHost === "127.0.0.1") return;
  if (configuredAllowedOrigins().has(originHost)) return;

  throw new Error("ASK_ORIGIN_FORBIDDEN");
}

function clientKey(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]) {
  const edgeIp = normalizedHost(getRequestHeader(event, "cf-connecting-ip")) || "unknown";
  return createHash("sha256")
    .update("geomacro-public-ask-client-v1\0", "utf8")
    .update(edgeIp, "utf8")
    .digest("hex");
}

function errorPayload(code: string, message: string) {
  return {
    ok: false,
    error: { code, message },
  } as const;
}

/**
 * Browser-facing Ask Geomacro transport.
 *
 * This is deliberately a named public API route instead of a hashed TanStack
 * server-function route. The central middleware can therefore apply the
 * public-read abuse policy without weakening authenticated, quota-bearing or
 * payment server functions, which remain fail-closed.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  setResponseHeader(event, "Content-Type", "application/json; charset=utf-8");
  setResponseHeader(event, "X-Robots-Tag", "noindex, nofollow");

  try {
    assertBrowserOrigin(event);
    const input = await readBody(event);
    const data = await executeAskGeomacro(input, clientKey(event));
    return { ok: true, data } as const;
  } catch (error) {
    if (error instanceof AskGeomacroRateLimitError) {
      setResponseStatus(event, 429);
      setResponseHeader(event, "Retry-After", "60");
      return errorPayload("ASK_RATE_LIMITED", "Too many requests. Please wait a moment.");
    }

    if (error instanceof Error && error.message === "ASK_ORIGIN_FORBIDDEN") {
      setResponseStatus(event, 403);
      return errorPayload("ASK_FORBIDDEN", "Request origin is not allowed.");
    }

    if (error instanceof Error && error.name === "ZodError") {
      setResponseStatus(event, 400);
      return errorPayload("ASK_INVALID_INPUT", "Enter a valid risk question between 4 and 300 characters.");
    }

    console.error(
      "[public-ask] query unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    setResponseStatus(event, 503);
    return errorPayload("ASK_UNAVAILABLE", "Research is temporarily unavailable. Please retry.");
  }
});
