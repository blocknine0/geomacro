import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import { createTameionDecision } from "../lib/tameion-agent-service.server";
import {
  TAMEION_ACTION_TYPES,
  TAMEION_AGENT_VERSION,
  TAMEION_BUSINESS_POLICIES,
  TAMEION_POLICY_PRESETS,
} from "../lib/tameion-agent-contract";

const MAX_BODY_BYTES = 12 * 1024;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

export const Route = createFileRoute("/api/tameion/decision")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async () =>
        json({
          ok: true,
          service: "Geomacro Tameion Autonomous Business Operator",
          version: TAMEION_AGENT_VERSION,
          network: "Arc Testnet",
          chain_id: 5042002,
          policy_presets: TAMEION_POLICY_PRESETS,
          action_types: TAMEION_ACTION_TYPES,
          business_policies: TAMEION_BUSINESS_POLICIES,
          risk_gate_execution_authorized: false,
          note: "Testnet-only hackathon workflow. Geomacro supplies risk context; the bounded business policy controls the wallet action.",
        }),
      POST: async ({ request }) => {
        if (
          !allowPublicDemoRequest(request, {
            namespace: "tameion-agent-decision",
            windowMs: 60_000,
            maxPerClient: 20,
            maxGlobal: 200,
          })
        ) {
          return json(
            {
              ok: false,
              error: { code: "TAMEION_RATE_LIMITED", message: "Decision request limit exceeded. Try again shortly." },
              risk_gate_execution_authorized: false,
            },
            429,
          );
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
                risk_gate_execution_authorized: false,
              },
              error.status,
            );
          }
          throw error;
        }

        try {
          return json(await createTameionDecision(raw));
        } catch (error) {
          if (error instanceof ZodError) {
            return json(
              {
                ok: false,
                error: {
                  code: "TAMEION_INVALID_REQUEST",
                  message: "Tameion decision fields are invalid.",
                  issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                  })),
                },
                risk_gate_execution_authorized: false,
              },
              400,
            );
          }
          console.error("[tameion-agent] decision failed", error);
          return json(
            {
              ok: false,
              error: {
                code: "TAMEION_DECISION_UNAVAILABLE",
                message: "Verified risk context or the private audit ledger is temporarily unavailable. No payment was authorized.",
              },
              risk_gate_execution_authorized: false,
            },
            503,
          );
        }
      },
    },
  },
});
