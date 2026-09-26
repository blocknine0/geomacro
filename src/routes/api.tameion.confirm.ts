import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import { confirmTameionPayment } from "../lib/tameion-agent-service.server";

const MAX_BODY_BYTES = 12 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function bodyOf(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Response("Content-Type must be application/json", { status: 415 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Response("Request body is not valid JSON", { status: 400 });
  }
}

export const Route = createFileRoute("/api/tameion/confirm")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        if (
          !allowPublicDemoRequest(request, {
            namespace: "tameion-agent-confirm",
            windowMs: 60_000,
            maxPerClient: 40,
            maxGlobal: 400,
          })
        ) {
          return json({ ok: false, error: { code: "TAMEION_RATE_LIMITED", message: "Confirmation request limit exceeded." } }, 429);
        }

        let raw: unknown;
        try {
          raw = await bodyOf(request);
        } catch (error) {
          if (error instanceof Response) {
            return json(
              {
                ok: false,
                error: { code: "TAMEION_INVALID_REQUEST", message: await error.text() },
              },
              error.status,
            );
          }
          throw error;
        }

        try {
          return json(await confirmTameionPayment(raw));
        } catch (error) {
          if (error instanceof ZodError) {
            return json({
              ok: false,
              error: {
                code: "TAMEION_INVALID_REQUEST",
                message: "Payment confirmation fields are invalid.",
                issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
              },
            }, 400);
          }

          const code = error instanceof Error ? error.message : "TAMEION_CONFIRM_FAILED";
          const clientErrors = new Set([
            "TAMEION_DECISION_NOT_FOUND",
            "TAMEION_ALREADY_EXECUTED_WITH_DIFFERENT_TX",
            "TAMEION_HUMAN_APPROVAL_REQUIRED",
            "TAMEION_PAYMENT_CONFIRM_NOT_ALLOWED",
            "TAMEION_DECISION_EXPIRED",
            "TAMEION_ARC_TRANSACTION_PENDING_OR_NOT_FOUND",
            "TAMEION_ARC_TRANSACTION_REVERTED",
            "TAMEION_PAYMENT_RECIPIENT_MISMATCH",
            "TAMEION_PAYMENT_AMOUNT_MISMATCH",
            "TAMEION_RECEIPT_RECIPIENT_MISMATCH",
          ]);
          if (clientErrors.has(code)) {
            const status =
              code === "TAMEION_DECISION_NOT_FOUND"
                ? 404
                : code === "TAMEION_ARC_TRANSACTION_PENDING_OR_NOT_FOUND"
                  ? 202
                  : 409;
            return json({ ok: false, error: { code, message: "Arc Testnet payment has not satisfied the exact stored payment intent." } }, status);
          }

          console.error("[tameion-agent] payment confirmation failed", error);
          return json({ ok: false, error: { code: "TAMEION_CONFIRM_UNAVAILABLE", message: "Arc Testnet confirmation service is temporarily unavailable." } }, 503);
        }
      },
    },
  },
});
