import {
  defineEventHandler,
  getRequestHeader,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import { GEOMACRO_A2A_MAX_BODY_BYTES } from "../../../src/lib/a2a-contract";
import { A2AProtocolError } from "../../../src/lib/a2a-signature.server";
import { registerA2AIdentity } from "../../../src/lib/a2a-service.server";
import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
} from "../../../src/lib/commercial-access.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, corsHeaders);

  try {
    const contentType = getRequestHeader(event, "content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new A2AProtocolError(415, "A2A_CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
    }

    const declared = Number(getRequestHeader(event, "content-length") ?? "0");
    if (Number.isFinite(declared) && declared > GEOMACRO_A2A_MAX_BODY_BYTES) {
      throw new A2AProtocolError(413, "A2A_REQUEST_TOO_LARGE", "A2A identity request is too large.");
    }

    const rawBody = (await readRawBody(event)) ?? "";
    if (new TextEncoder().encode(rawBody).byteLength > GEOMACRO_A2A_MAX_BODY_BYTES) {
      throw new A2AProtocolError(413, "A2A_REQUEST_TOO_LARGE", "A2A identity request is too large.");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawBody) as unknown;
    } catch {
      throw new A2AProtocolError(400, "A2A_INVALID_JSON", "A2A identity body is not valid JSON.");
    }

    const authRequest = new Request("https://geomacro.local/api/a2a/identity", {
      headers: {
        authorization: getRequestHeader(event, "authorization") ?? "",
        "x-geomacro-api-key": getRequestHeader(event, "x-geomacro-api-key") ?? "",
        "x-geomacro-api-secret": getRequestHeader(event, "x-geomacro-api-secret") ?? "",
      },
    });
    const principal = await authenticateCommercialApiRequest(authRequest);
    const identity = await registerA2AIdentity(principal, raw);

    setResponseStatus(event, 201);
    return {
      ok: true,
      data: identity,
      signing: {
        algorithm: "Ed25519",
        required_headers: [
          "x-geomacro-a2a-agent-id",
          "x-geomacro-a2a-timestamp",
          "x-geomacro-a2a-nonce",
          "x-geomacro-a2a-signature",
        ],
      },
      execution_authorized: false,
    };
  } catch (error) {
    const status = error instanceof A2AProtocolError || error instanceof CommercialAccessError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 503;
    const code = error instanceof A2AProtocolError || error instanceof CommercialAccessError
      ? error.code
      : error instanceof ZodError
        ? "A2A_IDENTITY_INVALID"
        : "A2A_IDENTITY_UNAVAILABLE";
    const message = error instanceof A2AProtocolError || error instanceof CommercialAccessError
      ? error.message
      : error instanceof ZodError
        ? "A2A identity fields are invalid."
        : "A2A identity registration is temporarily unavailable.";

    if (!(error instanceof A2AProtocolError) && !(error instanceof CommercialAccessError) && !(error instanceof ZodError)) {
      console.error("[a2a-identity] unexpected failure", error);
    }
    setResponseStatus(event, status);
    return {
      ok: false,
      error: {
        code,
        message,
        ...(error instanceof ZodError
          ? { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }
          : {}),
      },
      execution_authorized: false,
    };
  }
});
