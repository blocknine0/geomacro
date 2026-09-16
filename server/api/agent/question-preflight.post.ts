import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import { preflightPaidQuestion } from "../../../src/lib/agent-question-preflight.server";

const MAX_BODY_BYTES = 8 * 1024;

function headers(event: Parameters<typeof setResponseHeaders>[0]) {
  setResponseHeaders(event, {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "QUESTION_PREFLIGHT_UNAVAILABLE";
  const known = [
    "QUESTION_SUBJECT_UNRESOLVED",
    "QUESTION_TOPIC_UNRESOLVED",
    "QUESTION_MULTIPLE_SUBJECTS_AMBIGUOUS",
    "QUESTION_HISTORICAL_TIME_REQUIRES_EXPLICIT_STRUCTURED_AS_OF",
    "COUNTRY_REGISTRY_UNAVAILABLE",
    "AMBIGUOUS_QUERY_INTENT",
    "QUERY_INTENT_CONFLICT",
  ];
  return known.includes(error.message) ? error.message : "QUESTION_PREFLIGHT_UNAVAILABLE";
}

export default defineEventHandler(async (event) => {
  headers(event);

  const type = getRequestHeader(event, "content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    setResponseStatus(event, 415);
    return {
      ok: false,
      chargeable: false,
      payment_required_now: false,
      error: { code: "INVALID_CONTENT_TYPE", message: "Content-Type must be application/json." },
      execution_authorized: false,
    };
  }

  const declared = Number(getRequestHeader(event, "content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    setResponseStatus(event, 413);
    return {
      ok: false,
      chargeable: false,
      payment_required_now: false,
      error: { code: "QUESTION_TOO_LARGE", message: "Question request is too large." },
      execution_authorized: false,
    };
  }

  const raw = (await readRawBody(event, "utf8")) ?? "";
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    setResponseStatus(event, 413);
    return {
      ok: false,
      chargeable: false,
      payment_required_now: false,
      error: { code: "QUESTION_TOO_LARGE", message: "Question request is too large." },
      execution_authorized: false,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    setResponseStatus(event, 400);
    return {
      ok: false,
      chargeable: false,
      payment_required_now: false,
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
      execution_authorized: false,
    };
  }

  try {
    const result = await preflightPaidQuestion(parsed);
    setResponseStatus(event, result.ok ? 200 : 422);
    return result;
  } catch (error) {
    if (error instanceof ZodError) {
      setResponseStatus(event, 400);
      return {
        ok: false,
        chargeable: false,
        payment_required_now: false,
        error: {
          code: "INVALID_PAID_QUESTION",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        execution_authorized: false,
      };
    }

    const code = safeErrorCode(error);
    const clientError = code !== "QUESTION_PREFLIGHT_UNAVAILABLE" && code !== "COUNTRY_REGISTRY_UNAVAILABLE";
    setResponseStatus(event, clientError ? 400 : 503);
    return {
      ok: false,
      chargeable: false,
      payment_required_now: false,
      error: {
        code,
        message: clientError
          ? "The question could not be mapped safely to a single governed Geomacro query."
          : "Paid-question preflight is temporarily unavailable. No payment is requested.",
      },
      privacy: {
        external_llm_used: false,
        raw_question_logged: false,
        premium_payload_included: false,
      },
      execution_authorized: false,
    };
  }
});
