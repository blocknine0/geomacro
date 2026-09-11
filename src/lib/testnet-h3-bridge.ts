import { mockEvent } from "h3";

/**
 * Minimal compatibility bridge so the existing Nitro/h3 tester handlers under
 * `server/` can also be served through the deployed TanStack route system.
 * Handler behavior, headers, status codes and payloads are passed through
 * unchanged; this only adapts the event/response shape.
 */
type H3Handler = (event: unknown) => unknown | Promise<unknown>;

type H3ErrorLike = {
  statusCode?: number;
  status?: number;
  statusMessage?: string;
  data?: unknown;
  message?: string;
};

function toResponse(event: { res?: { status?: number; headers?: Headers } }, output: unknown) {
  if (output instanceof Response) return output;

  const headers = new Headers(event.res?.headers ?? undefined);
  const status = event.res?.status && event.res.status >= 100 ? event.res.status : 200;

  if (output === null || output === undefined) {
    return new Response(null, { status: status === 200 ? 204 : status, headers });
  }

  if (typeof output === "string") {
    if (!headers.has("content-type")) headers.set("content-type", "text/plain; charset=utf-8");
    return new Response(output, { status, headers });
  }

  if (output instanceof Uint8Array || output instanceof ArrayBuffer) {
    if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
    return new Response(output as BodyInit, { status, headers });
  }

  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(output), { status, headers });
}

function errorResponse(error: unknown) {
  const err = (error ?? {}) as H3ErrorLike;
  const status = Number(err.statusCode ?? err.status ?? 500) || 500;
  const code = String(err.statusMessage ?? err.message ?? "INTERNAL_ERROR").slice(0, 200);
  return Response.json(
    { ok: false, error: code, data: err.data ?? null, execution_authorized: false },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
  );
}

export async function runH3Handler(
  request: Request,
  handler: H3Handler,
  params?: Record<string, string>,
): Promise<Response> {
  const event = mockEvent(request) as unknown as {
    res?: { status?: number; headers?: Headers };
    context: Record<string, unknown>;
  };
  if (params) event.context.params = { ...(event.context.params as object), ...params };

  try {
    const output = await handler(event);
    return toResponse(event, output);
  } catch (error) {
    return errorResponse(error);
  }
}
