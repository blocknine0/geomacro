import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { z, ZodError } from "zod";

import { a2aTaskRequestSchema } from "../../../src/lib/a2a-contract";
import { dispatchRemoteA2ATask } from "../../../src/lib/a2a-outbound.server";
import { A2AProtocolError } from "../../../src/lib/a2a-signature.server";
import { requireCommercialOpsToken } from "../../../src/lib/commercial-ops.server";

const requestSchema = z.object({
  base_url: z.string().trim().url(),
  task: a2aTaskRequestSchema,
});

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  });

  try {
    requireCommercialOpsToken(getRequestHeader(event, "x-geomacro-ops-token"));
    const contentType = getRequestHeader(event, "content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new A2AProtocolError(415, "A2A_CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
    }
    const rawBody = (await readRawBody(event)) ?? "";
    if (new TextEncoder().encode(rawBody).byteLength > 32 * 1024) {
      throw new A2AProtocolError(413, "A2A_REQUEST_TOO_LARGE", "Outbound A2A dispatch request is too large.");
    }
    const input = requestSchema.parse(JSON.parse(rawBody));
    const result = await dispatchRemoteA2ATask({
      baseUrl: input.base_url,
      task: input.task,
    });
    if (result.payment_required) {
      setResponseHeaders(event, { "PAYMENT-REQUIRED": result.payment_required });
    }
    setResponseStatus(event, result.status);
    return {
      ok: result.ok,
      remote_origin: result.remote_origin,
      remote_response: result.body,
      payment_required: Boolean(result.payment_required),
      note: result.note,
      execution_authorized: false,
    };
  } catch (error) {
    if (error instanceof Response) {
      setResponseStatus(event, error.status);
      return { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized." }, execution_authorized: false };
    }
    const status = error instanceof A2AProtocolError
      ? error.status
      : error instanceof ZodError || error instanceof SyntaxError
        ? 400
        : 503;
    const code = error instanceof A2AProtocolError
      ? error.code
      : error instanceof ZodError || error instanceof SyntaxError
        ? "A2A_OUTBOUND_REQUEST_INVALID"
        : "A2A_OUTBOUND_UNAVAILABLE";
    const message = error instanceof A2AProtocolError
      ? error.message
      : error instanceof ZodError || error instanceof SyntaxError
        ? "Outbound A2A dispatch fields are invalid."
        : "Outbound A2A dispatch is temporarily unavailable.";
    if (!(error instanceof A2AProtocolError) && !(error instanceof ZodError) && !(error instanceof SyntaxError)) {
      console.error("[a2a-outbound] unexpected failure", error);
    }
    setResponseStatus(event, status);
    return { ok: false, error: { code, message }, execution_authorized: false };
  }
});
