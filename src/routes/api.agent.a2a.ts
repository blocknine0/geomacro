import { createFileRoute } from "@tanstack/react-router";
import { ZodError, z } from "zod";
import {
  a2aCallbackEnvelopeSchema,
  a2aNegotiationEnvelopeSchema,
  a2aStatusEnvelopeSchema,
  a2aTaskEnvelopeSchema,
  geomacroA2AManifest,
} from "../lib/a2a-contract";
import {
  A2AError,
  getA2ATaskStatus,
  negotiateA2A,
  receiveA2ACallback,
  submitA2ATask,
} from "../lib/a2a-service.server";
import { circleX402PaymentRequiredResponse } from "../lib/circle-x402.server";

const MAX_BODY_BYTES = 32 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, payment-signature, x-geomacro-api-key, x-geomacro-api-secret",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Geomacro-A2A-Task-Id",
  "Access-Control-Max-Age": "600",
};

const operationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("negotiate"), envelope: a2aNegotiationEnvelopeSchema }),
  z.object({ operation: z.literal("submit_task"), envelope: a2aTaskEnvelopeSchema }),
  z.object({ operation: z.literal("task_status"), envelope: a2aStatusEnvelopeSchema }),
  z.object({ operation: z.literal("callback"), envelope: a2aCallbackEnvelopeSchema }),
]);

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function parseBody(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new A2AError(415, "A2A_CONTENT_TYPE_REQUIRED", "Content-Type must be application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new A2AError(413, "A2A_BODY_TOO_LARGE", "A2A request body is too large.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new A2AError(413, "A2A_BODY_TOO_LARGE", "A2A request body is too large.");
  }
  try {
    return operationSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof ZodError) {
      throw new A2AError(400, "A2A_REQUEST_INVALID", "A2A request fields are invalid.");
    }
    if (error instanceof SyntaxError) {
      throw new A2AError(400, "A2A_JSON_INVALID", "A2A request body is not valid JSON.");
    }
    throw error;
  }
}

function errorResponse(error: unknown) {
  const typed = error as { status?: number; code?: string; message?: string };
  const status = Number.isInteger(typed?.status) ? Number(typed.status) : 503;
  const code = typeof typed?.code === "string" ? typed.code : "A2A_FAILED_CLOSED";
  const message = error instanceof A2AError
    ? error.message
    : status < 500 && typeof typed?.message === "string"
      ? typed.message
      : "A2A request failed closed.";
  if (status >= 500) console.error("[a2a] request failed", error);
  return json({ ok: false, error: { code, message }, execution_authorized: false }, status);
}

export const Route = createFileRoute("/api/agent/a2a")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return json({ ok: true, data: geomacroA2AManifest(origin) }, 200, { "Cache-Control": "public, max-age=60" });
      },
      POST: async ({ request }) => {
        try {
          const body = await parseBody(request);
          if (body.operation === "negotiate") return json(await negotiateA2A(body.envelope));
          if (body.operation === "task_status") return json(await getA2ATaskStatus(body.envelope));
          if (body.operation === "callback") return json(await receiveA2ACallback(body.envelope), 202);

          const outcome = await submitA2ATask(request, body.envelope);
          if (outcome.kind === "payment_required") {
            const response = circleX402PaymentRequiredResponse(request);
            response.headers.set("X-Geomacro-A2A-Task-Id", outcome.task.id);
            for (const [key, value] of Object.entries(corsHeaders)) response.headers.set(key, value);
            return response;
          }
          if (outcome.kind === "processing") {
            return json({
              ok: true,
              task_id: outcome.task.id,
              status: "processing",
              idempotent_replay: outcome.idempotent_replay ?? false,
              execution_authorized: false,
            }, 202);
          }
          if (outcome.kind === "terminal") {
            return json({
              ok: false,
              task_id: outcome.task.id,
              status: outcome.task.status,
              error: { code: outcome.task.error_code ?? "A2A_TASK_TERMINAL", message: outcome.task.error_message ?? "A2A task is terminal." },
              execution_authorized: false,
            }, 409);
          }

          if (outcome.response) return json({ ok: true, ...outcome.response, idempotent_replay: false });
          return json({
            ok: true,
            ...(outcome.task.result_payload as Record<string, unknown>),
            integrity: outcome.task.result_signature,
            idempotent_replay: true,
            execution_authorized: false,
          });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
