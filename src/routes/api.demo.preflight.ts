import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { runAgenticPreflightDemo } from "../lib/agentic-demo-service.server";

const MAX_BODY_BYTES = 8 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const buckets = new Map<string, { startedAt: number; count: number }>();

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function allowRequest(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }

  current.count += 1;
  return current.count <= MAX_REQUESTS_PER_WINDOW;
}

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

export const Route = createFileRoute("/api/demo/preflight")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        if (!allowRequest(request)) {
          return json(
            {
              ok: false,
              error: {
                code: "DEMO_RATE_LIMITED",
                message: "Public demo request limit exceeded. Try again in a minute.",
              },
              execution_authorized: false,
            },
            429,
          );
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          return json(
            {
              ok: false,
              error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json." },
              execution_authorized: false,
            },
            415,
          );
        }

        const declared = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
          return json(
            {
              ok: false,
              error: { code: "REQUEST_TOO_LARGE", message: "Demo request body is too large." },
              execution_authorized: false,
            },
            413,
          );
        }

        const raw = await request.text();
        if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
          return json(
            {
              ok: false,
              error: { code: "REQUEST_TOO_LARGE", message: "Demo request body is too large." },
              execution_authorized: false,
            },
            413,
          );
        }

        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          return json(
            {
              ok: false,
              error: { code: "INVALID_JSON", message: "Request body is not valid JSON." },
              execution_authorized: false,
            },
            400,
          );
        }

        try {
          return json(await runAgenticPreflightDemo(body));
        } catch (error) {
          if (error instanceof ZodError) {
            return json(
              {
                ok: false,
                error: {
                  code: "INVALID_DEMO_REQUEST",
                  message: "Demo request fields are invalid.",
                  issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
                },
                execution_authorized: false,
              },
              400,
            );
          }

          const message = error instanceof Error ? error.message : "Pre-flight demo failed.";
          const unsupported = message.startsWith("Public demo currently supports");

          return json(
            {
              ok: false,
              error: {
                code: unsupported ? "DEMO_SUBJECT_NOT_ENABLED" : "DEMO_FAILED_CLOSED",
                message,
              },
              execution_authorized: false,
            },
            unsupported ? 400 : 503,
          );
        }
      },
    },
  },
});
