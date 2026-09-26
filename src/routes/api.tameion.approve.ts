import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import { approveTameionDecision } from "../lib/tameion-agent-service.server";

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

export const Route = createFileRoute("/api/tameion/approve")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        if (
          !allowPublicDemoRequest(request, {
            namespace: "tameion-agent-approval",
            windowMs: 60_000,
            maxPerClient: 30,
            maxGlobal: 300,
          })
        ) {
          return json({ ok: false, error: { code: "TAMEION_RATE_LIMITED", message: "Approval request limit exceeded." } }, 429);
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
          return json(await approveTameionDecision(raw));
        } catch (error) {
          if (error instanceof ZodError) {
            return json({
              ok: false,
              error: {
                code: "TAMEION_INVALID_REQUEST",
                message: "Approval fields are invalid.",
                issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
              },
            }, 400);
          }

          const code = error instanceof Error ? error.message : "TAMEION_APPROVAL_FAILED";
          if ([
            "TAMEION_DECISION_NOT_FOUND",
            "TAMEION_APPROVAL_NOT_ALLOWED",
            "TAMEION_DECISION_EXPIRED",
            "TAMEION_APPROVAL_SIGNATURE_INVALID",
            "TAMEION_APPROVAL_SIGNER_MISMATCH",
          ].includes(code)) {
            return json({ ok: false, error: { code, message: "Human approval could not be accepted for this payment intent." } }, code === "TAMEION_DECISION_NOT_FOUND" ? 404 : 409);
          }

          console.error("[tameion-agent] approval failed", error);
          return json({ ok: false, error: { code: "TAMEION_APPROVAL_UNAVAILABLE", message: "Human approval service is temporarily unavailable." } }, 503);
        }
      },
    },
  },
});
