import {
  defineEventHandler,
  getRequestHeader,
  getRequestURL,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import {
  a2aJsonRpcError,
  a2aJsonRpcRequestSchema,
} from "../../src/lib/a2a-contract";
import { handleA2AJsonRpc } from "../../src/lib/a2a-server.server";

const MAX_BODY_BYTES = 32 * 1024;

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, A2A-Version, A2A-Extensions, Payment-Signature, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
    "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  });

  const contentType = getRequestHeader(event, "content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    setResponseStatus(event, 415);
    return a2aJsonRpcError(null, -32600, "Content-Type must be application/json");
  }

  const declared = Number(getRequestHeader(event, "content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    setResponseStatus(event, 413);
    return a2aJsonRpcError(null, -32600, "Request body too large");
  }

  const rawBody = (await readRawBody(event)) ?? "";
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    setResponseStatus(event, 413);
    return a2aJsonRpcError(null, -32600, "Request body too large");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody) as unknown;
  } catch {
    setResponseStatus(event, 400);
    return a2aJsonRpcError(null, -32700, "Parse error");
  }

  let rpc;
  try {
    rpc = a2aJsonRpcRequestSchema.parse(raw);
  } catch (error) {
    setResponseStatus(event, 400);
    return a2aJsonRpcError(
      null,
      -32600,
      "Invalid Request",
      error instanceof ZodError
        ? { issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }
        : undefined,
    );
  }

  const headers = new Headers();
  for (const name of [
    "authorization",
    "x-geomacro-api-key",
    "x-geomacro-api-secret",
    "a2a-version",
    "a2a-extensions",
    "payment-signature",
  ]) {
    const value = getRequestHeader(event, name);
    if (value) headers.set(name, value);
  }
  const request = new Request(getRequestURL(event).toString(), {
    method: "POST",
    headers,
  });

  const result = await handleA2AJsonRpc({ request, rpc });
  setResponseStatus(event, result.status);
  if (result.headers) setResponseHeaders(event, result.headers);
  return result.body;
});
