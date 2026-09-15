import {
  defineEventHandler,
  getMethod,
  getQuery,
  getRequestHeader,
  getRequestURL,
  getRouterParam,
  readRawBody,
  setResponseHeaders,
  setResponseStatus,
} from "h3";
import { ZodError } from "zod";

import {
  GEOMACRO_A2A_PROTOCOL_VERSION,
  a2aSendMessageRequestSchema,
  geomacroA2AAgentCard,
} from "../../../src/lib/a2a-contract";
import {
  assertA2AMessageIdempotency,
  loadLatestA2AMessageHistory,
} from "../../../src/lib/a2a-inbound-integrity.server";
import {
  A2AServiceError,
  cancelA2ATask,
  createA2APushConfig,
  deleteA2APushConfig,
  getA2APushConfig,
  getA2ATask,
  listA2APushConfigs,
  listA2ATasks,
  sendA2AMessage,
} from "../../../src/lib/a2a-service.server";
import {
  authenticateCommercialApiRequest,
  CommercialAccessError,
} from "../../../src/lib/commercial-access.server";

const MAX_BODY_BYTES = 32 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function headers(event: any) {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, A2A-Version, X-Geomacro-Api-Key, X-Geomacro-Api-Secret",
    "Access-Control-Expose-Headers": "A2A-Version",
    "Access-Control-Max-Age": "600",
    "A2A-Version": GEOMACRO_A2A_PROTOCOL_VERSION,
    "Cache-Control": "no-store",
    "Content-Type": "application/a2a+json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
}

function problem(event: any, status: number, code: string, detail: string) {
  setResponseStatus(event, status);
  setResponseHeaders(event, { "Content-Type": "application/problem+json; charset=utf-8" });
  return {
    type: `https://geomacro.live/problems/a2a/${code.toLowerCase()}`,
    title: code,
    status,
    detail,
    execution_authorized: false,
  };
}

function requireUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) {
    throw new A2AServiceError(400, "A2A_IDENTIFIER_INVALID", `${label} must be a UUID.`);
  }
  return value;
}

function requireLocalTaskId(value: string | undefined) {
  if (!value) return;
  if (!UUID_RE.test(value)) {
    throw new A2AServiceError(
      400,
      "A2A_LOCAL_TASK_ID_INVALID",
      "A Geomacro task continuation must use the UUID taskId previously returned by Geomacro.",
    );
  }
}

function boundedHistoryLength(raw: unknown, fallback = 20) {
  const parsed = Number(raw ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(50, Math.trunc(parsed)));
}

async function parseJsonBody(event: any) {
  const contentType = String(getRequestHeader(event, "content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json") && !contentType.includes("application/a2a+json")) {
    throw new A2AServiceError(415, "A2A_CONTENT_TYPE_REQUIRED", "Content-Type must be application/a2a+json or application/json.");
  }
  const declared = Number(getRequestHeader(event, "content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new A2AServiceError(413, "A2A_REQUEST_TOO_LARGE", "A2A request body is too large.");
  }
  const raw = (await readRawBody(event)) ?? "";
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new A2AServiceError(413, "A2A_REQUEST_TOO_LARGE", "A2A request body is too large.");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new A2AServiceError(400, "A2A_INVALID_JSON", "A2A request body is not valid JSON.");
  }
}

async function authenticate(event: any) {
  const authRequest = new Request("https://geomacro.local/api/a2a", {
    headers: {
      authorization: getRequestHeader(event, "authorization") ?? "",
      "x-geomacro-api-key": getRequestHeader(event, "x-geomacro-api-key") ?? "",
      "x-geomacro-api-secret": getRequestHeader(event, "x-geomacro-api-secret") ?? "",
    },
  });
  return authenticateCommercialApiRequest(authRequest);
}

function normalizedPath(event: any) {
  const raw = String(getRouterParam(event, "path") ?? "");
  try {
    return decodeURIComponent(raw).replace(/^\/+|\/+$/g, "");
  } catch {
    throw new A2AServiceError(400, "A2A_PATH_INVALID", "A2A path is invalid.");
  }
}

export default defineEventHandler(async (event) => {
  headers(event);
  const method = getMethod(event).toUpperCase();
  if (method === "OPTIONS") {
    setResponseStatus(event, 204);
    return null;
  }

  try {
    const version = String(getRequestHeader(event, "a2a-version") ?? "").trim();
    if (version && version !== GEOMACRO_A2A_PROTOCOL_VERSION) {
      return problem(
        event,
        400,
        "A2A_VERSION_UNSUPPORTED",
        `Geomacro supports A2A protocol version ${GEOMACRO_A2A_PROTOCOL_VERSION}.`,
      );
    }

    const path = normalizedPath(event);
    if (method === "GET" && path === "extendedAgentCard") {
      await authenticate(event);
      const origin = getRequestURL(event).origin;
      return geomacroA2AAgentCard(origin);
    }

    const principal = await authenticate(event);

    if (method === "POST" && path === "message:send") {
      const request = a2aSendMessageRequestSchema.parse(await parseJsonBody(event));
      requireLocalTaskId(request.message.taskId);
      await assertA2AMessageIdempotency({
        principalId: principal.principal_id,
        message: request.message,
      });
      const task = await sendA2AMessage({ principal, request });
      const historyLength = boundedHistoryLength(request.configuration?.historyLength, 20);
      return {
        task: {
          ...task,
          history: await loadLatestA2AMessageHistory({
            principalId: principal.principal_id,
            taskId: String(task.id),
            limit: historyLength,
          }),
        },
      };
    }

    if (method === "GET" && path === "tasks") {
      const query = getQuery(event);
      const limitRaw = Number(query.pageSize ?? query.limit ?? 20);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
      const state = typeof query.status === "string" ? query.status : null;
      const result = await listA2ATasks({ principal, limit, state });
      return {
        ...result,
        nextPageToken: result.nextPageToken ?? "",
      };
    }

    const cancelMatch = path.match(/^tasks\/([^/]+):cancel$/);
    if (method === "POST" && cancelMatch) {
      return await cancelA2ATask({
        principal,
        taskId: requireUuid(cancelMatch[1], "taskId"),
      });
    }

    const taskMatch = path.match(/^tasks\/([^/]+)$/);
    if (method === "GET" && taskMatch) {
      const query = getQuery(event);
      const historyLength = boundedHistoryLength(query.historyLength, 20);
      const task = await getA2ATask({
        principal,
        taskId: requireUuid(taskMatch[1], "taskId"),
        historyLength: 0,
      });
      return {
        ...task,
        history: await loadLatestA2AMessageHistory({
          principalId: principal.principal_id,
          taskId: String(task.id),
          limit: historyLength,
        }),
      };
    }

    const pushCollectionMatch = path.match(/^tasks\/([^/]+)\/pushNotificationConfigs$/);
    if (pushCollectionMatch) {
      const taskId = requireUuid(pushCollectionMatch[1], "taskId");
      if (method === "POST") {
        return await createA2APushConfig({
          principal,
          taskId,
          config: await parseJsonBody(event),
        });
      }
      if (method === "GET") {
        return {
          configs: await listA2APushConfigs({ principal, taskId }),
          nextPageToken: "",
        };
      }
    }

    const pushItemMatch = path.match(/^tasks\/([^/]+)\/pushNotificationConfigs\/([^/]+)$/);
    if (pushItemMatch) {
      const taskId = requireUuid(pushItemMatch[1], "taskId");
      const configId = requireUuid(pushItemMatch[2], "configId");
      if (method === "GET") {
        return await getA2APushConfig({ principal, taskId, configId });
      }
      if (method === "DELETE") {
        await deleteA2APushConfig({ principal, taskId, configId });
        return {};
      }
    }

    return problem(event, 404, "A2A_METHOD_NOT_FOUND", "A2A method not found.");
  } catch (error) {
    if (error instanceof A2AServiceError || error instanceof CommercialAccessError) {
      return problem(event, error.status, error.code, error.message);
    }
    if (error instanceof ZodError) {
      return problem(
        event,
        400,
        "A2A_REQUEST_INVALID",
        error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 1_500),
      );
    }
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("A2A_URL_")) {
      return problem(event, 400, code, "A2A callback or peer URL is not permitted by the network-safety policy.");
    }
    console.error("[a2a-http] request failed", error);
    return problem(event, 503, "A2A_UNAVAILABLE", "A2A service is temporarily unavailable.");
  }
});
