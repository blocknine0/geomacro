import { randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

const MAX_BODY_BYTES = 32 * 1024;
const SUPPORTED_A2A_VERSION = "1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, A2A-Version, A2A-Extensions",
  "Access-Control-Max-Age": "600",
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

function taskNotFound(id: unknown, taskId: string | null) {
  return rpcError(id, -32001, "Task not found", [
    {
      "@type": "type.googleapis.com/google.rpc.ErrorInfo",
      reason: "TASK_NOT_FOUND",
      domain: "a2a-protocol.org",
      metadata: {
        taskId: taskId ?? "unknown",
        timestamp: new Date().toISOString(),
      },
    },
  ]);
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("CONTENT_TYPE");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error("BODY_TOO_LARGE");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Error("BODY_TOO_LARGE");
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function firstTextPart(message: Record<string, unknown>) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  for (const part of parts) {
    if (part && typeof part === "object" && !Array.isArray(part)) {
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }
  return null;
}

function routingPayload(request: Request, prompt: string | null) {
  const origin = new URL(request.url).origin;
  return {
    service: "GeoMacro Global Risk Intelligence Agent",
    mode: "A2A coordination + x402 paid delivery",
    prompt_received: prompt,
    categories: ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"],
    geographic_scope: "global; availability is data-driven and fail-closed",
    endpoints: {
      agent_card: `${origin}/.well-known/agent-card.json`,
      a2a: `${origin}/api/a2a`,
      no_charge_availability: `${origin}/api/x402/risk/availability`,
      paid_intelligence: `${origin}/api/x402/intelligence`,
    },
    delivery_contract: {
      payment_protocol: "x402-v2",
      payment_after_deliverability_only: true,
      stale_or_incomplete_is_not_payable: true,
      replay_protection: true,
      execution_authorized: false,
    },
    query_guidance: {
      body: {
        question: prompt ?? "Assess the requested geopolitical, macro/FX or critical-mineral risk.",
        subjects: [{ type: "country", country_iso3: "USA" }],
        topics: ["conflict_geopolitics"],
        max_age_seconds: 86400,
        detail: "standard",
      },
      note: "Replace the example subject/topics with the actual request. Check no-charge availability first; use the paid endpoint only when chargeable.",
    },
    execution_authorized: false,
  };
}

function sendMessage(id: unknown, params: unknown, request: Request) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return rpcError(id, -32602, "Invalid parameters");
  }
  const message = (params as Record<string, unknown>).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(id, -32602, "Invalid parameters", [
      {
        "@type": "type.googleapis.com/google.rpc.BadRequest",
        fieldViolations: [{ field: "message", description: "message is required" }],
      },
    ]);
  }
  const prompt = firstTextPart(message as Record<string, unknown>);
  const clientContext = (message as Record<string, unknown>).contextId;
  const contextId = typeof clientContext === "string" && clientContext.trim()
    ? clientContext
    : randomUUID();

  return json({
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      message: {
        messageId: randomUUID(),
        contextId,
        role: "ROLE_AGENT",
        parts: [
          {
            text: "GeoMacro is available as a global three-category risk-intelligence service. Use the no-charge availability endpoint first, then the x402 paid endpoint only when the requested bundle is currently deliverable.",
          },
          {
            data: routingPayload(request, prompt),
          },
        ],
        metadata: {
          geomacro: {
            protocol: "a2a-1.0",
            payment_protocol: "x402-v2",
            execution_authorized: false,
          },
        },
      },
    },
  });
}

export const Route = createFileRoute("/api/a2a")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return json({
          ok: true,
          service: "GeoMacro A2A",
          protocol: "A2A",
          protocol_version: SUPPORTED_A2A_VERSION,
          binding: "JSONRPC",
          agent_card: `${origin}/.well-known/agent-card.json`,
          categories: ["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"],
          paid_endpoint: `${origin}/api/x402/intelligence`,
          availability_endpoint: `${origin}/api/x402/risk/availability`,
          execution_authorized: false,
        });
      },
      POST: async ({ request }) => {
        const requestedVersion = (request.headers.get("a2a-version") ?? "").trim();
        let body: Record<string, unknown>;
        try {
          body = await parseBody(request);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "INVALID_JSON";
          if (reason === "CONTENT_TYPE") return rpcError(null, -32600, "Request payload validation error");
          if (reason === "BODY_TOO_LARGE") return rpcError(null, -32600, "Request payload validation error");
          return rpcError(null, -32700, "Invalid JSON payload");
        }

        const id = body.id ?? null;
        if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
          return rpcError(id, -32600, "Request payload validation error");
        }
        if (requestedVersion && requestedVersion !== SUPPORTED_A2A_VERSION) {
          return rpcError(id, -32009, "Protocol version not supported", [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "VERSION_NOT_SUPPORTED",
              domain: "a2a-protocol.org",
              metadata: {
                requestedVersion,
                supportedVersion: SUPPORTED_A2A_VERSION,
              },
            },
          ]);
        }

        if (body.method === "SendMessage") {
          return sendMessage(id, body.params, request);
        }
        if (body.method === "GetTask" || body.method === "CancelTask") {
          const params = body.params && typeof body.params === "object" && !Array.isArray(body.params)
            ? body.params as Record<string, unknown>
            : {};
          const taskId = typeof params.id === "string"
            ? params.id
            : typeof params.taskId === "string"
              ? params.taskId
              : null;
          return taskNotFound(id, taskId);
        }

        return rpcError(id, -32601, "Method not found");
      },
    },
  },
});
