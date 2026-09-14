import {
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  getRouterParam,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import { GEOMACRO_A2A_PROTOCOL_VERSION } from "../../../../src/lib/a2a-contract";
import { A2AProtocolError, verifyA2ASignedRequest } from "../../../../src/lib/a2a-signature.server";
import { getA2ATaskForIdentity } from "../../../../src/lib/a2a-service.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": [
    "X-Geomacro-A2A-Agent-Id",
    "X-Geomacro-A2A-Timestamp",
    "X-Geomacro-A2A-Nonce",
    "X-Geomacro-A2A-Signature",
  ].join(", "),
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, corsHeaders);

  try {
    const taskId = String(getRouterParam(event, "taskId") ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taskId)) {
      throw new A2AProtocolError(404, "A2A_TASK_NOT_FOUND", "A2A task was not found.");
    }

    const url = getRequestURL(event);
    const headers = new Headers({
      "x-geomacro-a2a-agent-id": getRequestHeader(event, "x-geomacro-a2a-agent-id") ?? "",
      "x-geomacro-a2a-timestamp": getRequestHeader(event, "x-geomacro-a2a-timestamp") ?? "",
      "x-geomacro-a2a-nonce": getRequestHeader(event, "x-geomacro-a2a-nonce") ?? "",
      "x-geomacro-a2a-signature": getRequestHeader(event, "x-geomacro-a2a-signature") ?? "",
    });
    const identity = await verifyA2ASignedRequest({
      method: "GET",
      pathname: url.pathname,
      rawBody: "",
      headers,
    });
    const data = await getA2ATaskForIdentity({ identity, taskId });
    return { ok: true, ...data };
  } catch (error) {
    const status = error instanceof A2AProtocolError ? error.status : 503;
    const code = error instanceof A2AProtocolError ? error.code : "A2A_TASK_LOOKUP_UNAVAILABLE";
    const message = error instanceof A2AProtocolError
      ? error.message
      : "A2A task status is temporarily unavailable.";
    if (!(error instanceof A2AProtocolError)) {
      console.error("[a2a-task-status] unexpected failure", error);
    }
    setResponseStatus(event, status);
    return {
      ok: false,
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
      error: { code, message },
      execution_authorized: false,
    };
  }
});
