import {
  defineEventHandler,
  getRequestHeader,
  getRouterParam,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import { GEOMACRO_A2A_PROTOCOL_VERSION } from "../../../../src/lib/a2a-contract";
import { A2AServiceError } from "../../../../src/lib/a2a-service.server";
import { pollTrustedA2ATask } from "../../../../src/lib/a2a-trusted-peer.server";
import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
} from "../../../../src/lib/commercial-access.server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(event: any, status: number, code: string, message: string) {
  setResponseStatus(event, status);
  return {
    ok: false,
    error: { code, message },
    execution_authorized: false,
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
    const localTaskId = String(getRouterParam(event, "taskId") ?? "").trim();
    if (!UUID_RE.test(localTaskId)) {
      throw new A2AServiceError(
        400,
        "A2A_IDENTIFIER_INVALID",
        "local taskId must be a UUID.",
      );
    }

    const authRequest = new Request("https://geomacro.local/api/a2a/outbound/task", {
      headers: {
        authorization: getRequestHeader(event, "authorization") ?? "",
        "x-geomacro-api-key": getRequestHeader(event, "x-geomacro-api-key") ?? "",
        "x-geomacro-api-secret": getRequestHeader(event, "x-geomacro-api-secret") ?? "",
      },
    });
    const principal = await authenticateCommercialApiRequest(authRequest);
    return await pollTrustedA2ATask({ principal, localTaskId });
  } catch (error) {
    if (error instanceof A2AServiceError || error instanceof CommercialAccessError) {
      return fail(event, error.status, error.code, error.message);
    }
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("A2A_URL_")) {
      return fail(event, 400, code, "Trusted A2A peer URL is not permitted by the network-safety policy.");
    }
    console.error("[a2a-outbound-poll] request failed", error);
    return fail(
      event,
      503,
      "A2A_OUTBOUND_UNAVAILABLE",
      "Outbound A2A peer task is temporarily unavailable.",
    );
  }
});
