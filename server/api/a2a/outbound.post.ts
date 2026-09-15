import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import { GEOMACRO_A2A_PROTOCOL_VERSION } from "../../../src/lib/a2a-contract";
import { sendTrustedA2AMessage } from "../../../src/lib/a2a-client.server";
import { A2AServiceError } from "../../../src/lib/a2a-service.server";
import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
} from "../../../src/lib/commercial-access.server";

const MAX_BODY_BYTES = 32 * 1024;

function fail(event: any, status: number, code: string, message: string) {
  setResponseStatus(event, status);
  return {
    ok: false,
    error: { code, message },
    boundaries: {
      arbitrary_target_urls_allowed: false,
      trusted_peer_configuration_required: true,
      execution_authorized: false,
    },
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "A2A-Version": GEOMACRO_A2A_PROTOCOL_VERSION,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });

  try {
    const contentType = String(getRequestHeader(event, "content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json") && !contentType.includes("application/a2a+json")) {
      throw new A2AServiceError(415, "A2A_CONTENT_TYPE_REQUIRED", "Content-Type must be application/json or application/a2a+json.");
    }
    const declared = Number(getRequestHeader(event, "content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new A2AServiceError(413, "A2A_REQUEST_TOO_LARGE", "A2A outbound request is too large.");
    }
    const raw = (await readRawBody(event)) ?? "";
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      throw new A2AServiceError(413, "A2A_REQUEST_TOO_LARGE", "A2A outbound request is too large.");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      throw new A2AServiceError(400, "A2A_INVALID_JSON", "A2A outbound request body is not valid JSON.");
    }

    const authRequest = new Request("https://geomacro.local/api/a2a/outbound", {
      headers: {
        authorization: getRequestHeader(event, "authorization") ?? "",
        "x-geomacro-api-key": getRequestHeader(event, "x-geomacro-api-key") ?? "",
        "x-geomacro-api-secret": getRequestHeader(event, "x-geomacro-api-secret") ?? "",
      },
    });
    const principal = await authenticateCommercialApiRequest(authRequest);
    return await sendTrustedA2AMessage({ principal, raw: body });
  } catch (error) {
    if (error instanceof A2AServiceError || error instanceof CommercialAccessError) {
      return fail(event, error.status, error.code, error.message);
    }
    if (error instanceof ZodError) {
      return fail(event, 400, "A2A_REQUEST_INVALID", "Outbound A2A request fields are invalid.");
    }
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("A2A_URL_")) {
      return fail(event, 400, code, "Trusted A2A peer URL is not permitted by the network-safety policy.");
    }
    console.error("[a2a-outbound] request failed", error);
    return fail(event, 503, "A2A_OUTBOUND_UNAVAILABLE", "Outbound A2A peer service is temporarily unavailable.");
  }
});
