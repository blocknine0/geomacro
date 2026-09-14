import {
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
  type H3Event,
} from "h3";
import { ZodError } from "zod";

import {
  GEOMACRO_A2A_MAX_BODY_BYTES,
  GEOMACRO_A2A_PROTOCOL_VERSION,
  sha256A2A,
} from "../../../src/lib/a2a-contract";
import { executeRetryableA2ATask } from "../../../src/lib/a2a-execution.server";
import { A2AProtocolError, verifyA2ASignedRequest } from "../../../src/lib/a2a-signature.server";
import {
  getOrCreateA2ATask,
  markA2ATaskPaymentRequired,
} from "../../../src/lib/a2a-service.server";
import {
  persistedA2AX402Settlement,
  persistA2AX402Settlement,
} from "../../../src/lib/a2a-x402.server";
import {
  circleX402PaymentRequiredResponse,
  circleX402PaymentResponseHeader,
  isCircleX402Configured,
  settleCircleX402,
  type CircleX402Settlement,
} from "../../../src/lib/circle-x402.server";
import { CommercialAccessError } from "../../../src/lib/commercial-access.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Payment-Signature",
    "X-Geomacro-A2A-Agent-Id",
    "X-Geomacro-A2A-Timestamp",
    "X-Geomacro-A2A-Nonce",
    "X-Geomacro-A2A-Signature",
  ].join(", "),
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function requestHeaders(event: H3Event) {
  return new Headers({
    "content-type": getRequestHeader(event, "content-type") ?? "",
    "payment-signature": getRequestHeader(event, "payment-signature") ?? "",
    "x-geomacro-a2a-agent-id": getRequestHeader(event, "x-geomacro-a2a-agent-id") ?? "",
    "x-geomacro-a2a-timestamp": getRequestHeader(event, "x-geomacro-a2a-timestamp") ?? "",
    "x-geomacro-a2a-nonce": getRequestHeader(event, "x-geomacro-a2a-nonce") ?? "",
    "x-geomacro-a2a-signature": getRequestHeader(event, "x-geomacro-a2a-signature") ?? "",
  });
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, corsHeaders);

  try {
    const contentType = getRequestHeader(event, "content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new A2AProtocolError(415, "A2A_CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
    }

    const declared = Number(getRequestHeader(event, "content-length") ?? "0");
    if (Number.isFinite(declared) && declared > GEOMACRO_A2A_MAX_BODY_BYTES) {
      throw new A2AProtocolError(413, "A2A_REQUEST_TOO_LARGE", "A2A task request is too large.");
    }

    const rawBody = (await readRawBody(event)) ?? "";
    if (new TextEncoder().encode(rawBody).byteLength > GEOMACRO_A2A_MAX_BODY_BYTES) {
      throw new A2AProtocolError(413, "A2A_REQUEST_TOO_LARGE", "A2A task request is too large.");
    }

    let rawTask: unknown;
    try {
      rawTask = JSON.parse(rawBody) as unknown;
    } catch {
      throw new A2AProtocolError(400, "A2A_INVALID_JSON", "A2A task body is not valid JSON.");
    }

    const url = getRequestURL(event);
    const headers = requestHeaders(event);
    const identity = await verifyA2ASignedRequest({
      method: "POST",
      pathname: url.pathname,
      rawBody,
      headers,
    });
    const requestHash = sha256A2A(rawBody);
    const taskState = await getOrCreateA2ATask({
      identity,
      rawTask,
      requestHash,
    });
    const taskId = String(taskState.row.id);

    if (taskState.row.status === "completed" && taskState.row.result_json) {
      return taskState.row.result_json;
    }
    if (taskState.row.status === "failed") {
      const retryable = Boolean((taskState.row.error_json as Record<string, unknown> | null)?.retryable);
      if (!retryable) {
        setResponseStatus(event, 409);
        return {
          ok: false,
          protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
          task_id: taskId,
          client_task_id: taskState.task.client_task_id,
          status: "failed",
          error: taskState.row.error_json ?? {
            code: "A2A_TASK_ALREADY_FAILED",
            message: "This idempotent A2A task is already failed.",
          },
          execution_authorized: false,
        };
      }
    }

    let settlement: CircleX402Settlement | null = null;
    if (taskState.task.payment_mode === "x402_testnet") {
      if (!isCircleX402Configured()) {
        throw new A2AProtocolError(503, "A2A_X402_NOT_CONFIGURED", "Circle x402 technical-proof settlement is not configured in this runtime.");
      }

      settlement = persistedA2AX402Settlement(taskState.row.payment_json);
      if (!settlement) {
        const paymentSignature = headers.get("payment-signature")?.trim() ?? "";
        const circleRequest = new Request(url.toString(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(paymentSignature ? { "payment-signature": paymentSignature } : {}),
          },
          body: rawBody,
        });

        if (!paymentSignature) {
          if (taskState.row.status !== "payment_required") {
            await markA2ATaskPaymentRequired({ taskId, identity });
          }
          const quote = circleX402PaymentRequiredResponse(circleRequest);
          const paymentRequired = quote.headers.get("PAYMENT-REQUIRED");
          if (paymentRequired) {
            setResponseHeaders(event, { "PAYMENT-REQUIRED": paymentRequired });
          }
          setResponseStatus(event, 402);
          const body = await quote.json() as Record<string, unknown>;
          return {
            ...body,
            protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
            task_id: taskId,
            client_task_id: taskState.task.client_task_id,
            status: "payment_required",
          };
        }

        try {
          settlement = await settleCircleX402(circleRequest);
          await persistA2AX402Settlement({ taskId, identity, settlement });
        } catch (error) {
          const message = error instanceof Error ? error.message : "X402_PAYMENT_FAILED";
          throw new A2AProtocolError(
            402,
            "A2A_X402_PAYMENT_FAILED",
            message.startsWith("PAYMENT_")
              ? "x402 payment signature could not be verified or settled."
              : "x402 payment settlement failed closed.",
          );
        }
      }
    }

    const result = await executeRetryableA2ATask({
      identity,
      task: taskState.task,
      taskId,
      x402Settlement: settlement,
    });

    if (settlement) {
      setResponseHeaders(event, {
        "PAYMENT-RESPONSE": circleX402PaymentResponseHeader(settlement),
      });
    }
    setResponseStatus(event, 200);
    return result;
  } catch (error) {
    const status = error instanceof A2AProtocolError || error instanceof CommercialAccessError
      ? error.status
      : error instanceof ZodError
        ? 400
        : 503;
    const code = error instanceof A2AProtocolError || error instanceof CommercialAccessError
      ? error.code
      : error instanceof ZodError
        ? "A2A_TASK_INVALID"
        : "A2A_TASK_UNAVAILABLE";
    const message = error instanceof A2AProtocolError || error instanceof CommercialAccessError
      ? error.message
      : error instanceof ZodError
        ? "A2A task fields are invalid."
        : "A2A task processing is temporarily unavailable.";

    if (!(error instanceof A2AProtocolError) && !(error instanceof CommercialAccessError) && !(error instanceof ZodError)) {
      console.error("[a2a-task] unexpected failure", error);
    }

    setResponseStatus(event, status);
    return {
      ok: false,
      protocol_version: GEOMACRO_A2A_PROTOCOL_VERSION,
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
