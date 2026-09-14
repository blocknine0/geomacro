import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import {
  a2aNegotiationRequestSchema,
  GEOMACRO_A2A_CALLBACK_MODES,
  GEOMACRO_A2A_CAPABILITIES,
  GEOMACRO_A2A_MAX_BODY_BYTES,
  GEOMACRO_A2A_PAYMENT_MODES,
  GEOMACRO_A2A_PROTOCOL_VERSION,
} from "../../../src/lib/a2a-contract";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, headers);

  try {
    const contentType = getRequestHeader(event, "content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      setResponseStatus(event, 415);
      return {
        ok: false,
        error: { code: "A2A_CONTENT_TYPE_REQUIRED", message: "Content-Type must be application/json." },
        execution_authorized: false,
      };
    }

    const declared = Number(getRequestHeader(event, "content-length") ?? "0");
    if (Number.isFinite(declared) && declared > GEOMACRO_A2A_MAX_BODY_BYTES) {
      setResponseStatus(event, 413);
      return {
        ok: false,
        error: { code: "A2A_REQUEST_TOO_LARGE", message: "A2A negotiation request is too large." },
        execution_authorized: false,
      };
    }

    const rawBody = (await readRawBody(event)) ?? "";
    if (new TextEncoder().encode(rawBody).byteLength > GEOMACRO_A2A_MAX_BODY_BYTES) {
      setResponseStatus(event, 413);
      return {
        ok: false,
        error: { code: "A2A_REQUEST_TOO_LARGE", message: "A2A negotiation request is too large." },
        execution_authorized: false,
      };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawBody) as unknown;
    } catch {
      setResponseStatus(event, 400);
      return {
        ok: false,
        error: { code: "A2A_INVALID_JSON", message: "A2A negotiation body is not valid JSON." },
        execution_authorized: false,
      };
    }

    const input = a2aNegotiationRequestSchema.parse(raw);
    const protocol = input.protocol_versions.includes(GEOMACRO_A2A_PROTOCOL_VERSION)
      ? GEOMACRO_A2A_PROTOCOL_VERSION
      : null;
    const capability = GEOMACRO_A2A_CAPABILITIES.find((value) => input.capabilities.includes(value)) ?? null;
    const paymentMode = GEOMACRO_A2A_PAYMENT_MODES.find((value) => input.payment_modes.includes(value)) ?? null;
    const callbackMode = GEOMACRO_A2A_CALLBACK_MODES.find((value) => input.callback_modes.includes(value)) ?? null;

    if (!protocol || !capability || !paymentMode || !callbackMode) {
      setResponseStatus(event, 406);
      return {
        ok: false,
        error: {
          code: "A2A_NEGOTIATION_NO_MATCH",
          message: "No mutually supported A2A protocol/capability/payment/callback combination is available.",
        },
        supported: {
          protocol_versions: [GEOMACRO_A2A_PROTOCOL_VERSION],
          capabilities: GEOMACRO_A2A_CAPABILITIES,
          payment_modes: GEOMACRO_A2A_PAYMENT_MODES,
          callback_modes: GEOMACRO_A2A_CALLBACK_MODES,
        },
        execution_authorized: false,
      };
    }

    return {
      ok: true,
      negotiation: {
        protocol_version: protocol,
        capability,
        payment_mode: paymentMode,
        callback_mode: callbackMode,
        request_signing: "ed25519_detached",
        replay_protection: "timestamp_plus_one_time_nonce",
      },
      execution_authorized: false,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      setResponseStatus(event, 400);
      return {
        ok: false,
        error: {
          code: "A2A_NEGOTIATION_INVALID",
          message: "A2A negotiation fields are invalid.",
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        execution_authorized: false,
      };
    }
    console.error("[a2a-negotiate] unexpected failure", error);
    setResponseStatus(event, 503);
    return {
      ok: false,
      error: { code: "A2A_NEGOTIATION_UNAVAILABLE", message: "A2A negotiation is temporarily unavailable." },
      execution_authorized: false,
    };
  }
});
