import {
  createFileRoute,
} from "@tanstack/react-router";
import {
  ZodError,
} from "zod";

import {
  goatPilotStatusSchema,
} from "../lib/goat-pilot-contract";
import {
  requireGoatPilotAccess,
} from "../lib/goat-pilot-auth.server";
import {
  GoatPilotError,
  reconcileGoatPilotOrder,
} from "../lib/goat-pilot-service.server";
import {
  allowPublicDemoRequest,
} from "../lib/public-demo-rate-limit.server";

const MAX_BODY_BYTES = 4 * 1024;

function response(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...headers,
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
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

function authFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "GOAT_PILOT_ACCESS_NOT_CONFIGURED") {
    return response(
      {
        ok: false,
        error: {
          code: "GOAT_PILOT_ACCESS_NOT_CONFIGURED",
          message: "GOAT partner-pilot access is not active in this runtime.",
        },
        execution_authorized: false,
      },
      503,
    );
  }

  return response(
    {
      ok: false,
      error: {
        code: "GOAT_PILOT_ACCESS_DENIED",
        message: "Valid partner-pilot bearer access is required.",
      },
      execution_authorized: false,
    },
    401,
    { "WWW-Authenticate": "Bearer" },
  );
}

export const Route = createFileRoute("/api/goat/pilot/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          requireGoatPilotAccess(request);
        } catch (error) {
          return authFailure(error);
        }

        if (
          !allowPublicDemoRequest(request, {
            namespace: "goat-partner-pilot-status",
            windowMs: 60_000,
            maxPerClient: 60,
            maxGlobal: 360,
          })
        ) {
          return response(
            {
              ok: false,
              error: {
                code: "GOAT_PILOT_RATE_LIMITED",
                message: "GOAT partner-pilot status limit exceeded. Retry shortly.",
              },
              execution_authorized: false,
            },
            429,
            { "Retry-After": "5" },
          );
        }

        let raw: unknown;
        try {
          raw = await readJson(request);
        } catch (error) {
          if (error instanceof Response) {
            return response(
              {
                ok: false,
                error: {
                  code: "INVALID_GOAT_PILOT_STATUS_REQUEST",
                  message: await error.text(),
                },
                execution_authorized: false,
              },
              error.status,
            );
          }
          throw error;
        }

        let input;
        try {
          input = goatPilotStatusSchema.parse(raw);
        } catch (error) {
          if (error instanceof ZodError) {
            return response(
              {
                ok: false,
                error: {
                  code: "INVALID_GOAT_PILOT_STATUS_REQUEST",
                  message: "GOAT partner-pilot status fields are invalid.",
                  issues: error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message,
                  })),
                },
                execution_authorized: false,
              },
              400,
            );
          }
          throw error;
        }

        try {
          const result = await reconcileGoatPilotOrder(input);
          return response(result.body, result.http_status);
        } catch (error) {
          if (error instanceof GoatPilotError) {
            return response(
              {
                ok: false,
                error: {
                  code: error.code,
                  message: error.message,
                  retryable: error.retryable,
                },
                execution_authorized: false,
              },
              error.httpStatus,
              error.retryable ? { "Retry-After": "3" } : {},
            );
          }

          console.error("[goat-pilot] status endpoint failed closed", error);
          return response(
            {
              ok: false,
              error: {
                code: "GOAT_PILOT_INTERNAL_ERROR",
                message: "GOAT partner-pilot payment status could not be reconciled.",
              },
              execution_authorized: false,
            },
            503,
          );
        }
      },
    },
  },
});
