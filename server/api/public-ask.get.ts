import { createHash } from "node:crypto";
import {
  defineEventHandler,
  getRequestHeader,
  getRequestHost,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from "h3";

import {
  AskGeomacroRateLimitError,
  executeAskGeomacro,
} from "../../src/lib/ask-geomacro-core.server";
import { executeHybridChatTurn } from "../../src/lib/hybrid-agent-chat.server";

const QUESTION_HEADER = "x-geomacro-question";
const PREVIOUS_QUESTION_HEADER = "x-geomacro-previous-question";
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

function assertBrowserOrigin(event: H3Event) {
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

function clientKey(event: H3Event) {
  const edgeIp = String(getRequestHeader(event, "cf-connecting-ip") ?? "")
    .trim()
    .slice(0, 128) || "unknown";
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
 * Browser-facing Ask Geomacro read transport.
 *
 * The question travels in a same-origin request header rather than a URL query
 * so normal access logs do not copy the user's research text into the request
 * path. Because this is a GET public API route, central security applies the
 * bounded public-read policy and can safely fall back to local burst control
 * when the standby Supabase abuse ledger is unavailable. Sensitive server
 * functions, writes and payment routes remain fail-closed.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "Cache-Control", "no-store");
  setResponseHeader(event, "Content-Type", "application/json; charset=utf-8");
  setResponseHeader(event, "X-Robots-Tag", "noindex, nofollow");

  try {
    assertBrowserOrigin(event);
    const question = getRequestHeader(event, QUESTION_HEADER) ?? "";
    const previousQuestion = getRequestHeader(event, PREVIOUS_QUESTION_HEADER);
    // Existing one-turn requests remain byte-for-byte on their proven path.
    if (!previousQuestion) {
      const data = await executeAskGeomacro({ question }, clientKey(event));
      return { ok: true, data } as const;
    }
    // The optional context is untrusted and bounded before use by the adapter.
    const result = await executeHybridChatTurn(
      { question, history: [{ role: "user", content: previousQuestion }] },
      clientKey(event),
    );
    return {
      ok: true,
      data: result.answer,
      context: {
        mode: result.mode,
        resolved_question: result.resolved_question,
      },
    } as const;
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

    if (error instanceof Error && error.message === "AMBIGUOUS_FOLLOW_UP") {
      setResponseStatus(event, 422);
      return errorPayload("ASK_CLARIFY_FOLLOW_UP", "Please ask a complete risk question or specify one risk topic and location.");
    }

    if (error instanceof Error && ["INVALID_HISTORY", "INVALID_QUESTION", "QUESTION_TOO_LONG"].includes(error.message)) {
      setResponseStatus(event, 400);
      return errorPayload("ASK_INVALID_CONTEXT", "Invalid or oversized conversation context.");
    }

    if (error instanceof Error && error.name === "ZodError") {
      setResponseStatus(event, 400);
      return errorPayload("ASK_INVALID_INPUT", "Enter a valid risk question between 2 and 300 characters.");
    }

    console.error(
      "[public-ask] query unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    setResponseStatus(event, 503);
    return errorPayload("ASK_UNAVAILABLE", "Research is temporarily unavailable. Please retry.");
  }
});
