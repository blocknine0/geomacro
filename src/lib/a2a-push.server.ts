import { createHash } from "node:crypto";

import type { A2APushConfig } from "./a2a-contract";
import {
  a2aPushAllowedOrigins,
  a2aPushBearerForOrigin,
  secureA2AFetch,
  validateA2AEndpointUrl,
} from "./a2a-security.server";
import { recordA2APushDelivery } from "./a2a-store.server";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateA2APushConfig(config: A2APushConfig) {
  if (config.authentication?.credentials) {
    throw new Error("A2A_PUSH_INLINE_CREDENTIALS_FORBIDDEN");
  }
  const url = validateA2AEndpointUrl(config.url, a2aPushAllowedOrigins());
  const schemes = config.authentication?.schemes ?? [];
  for (const scheme of schemes) {
    if (scheme.toLowerCase() !== "bearer") throw new Error("A2A_PUSH_AUTH_SCHEME_UNSUPPORTED");
  }
  if (schemes.length && !a2aPushBearerForOrigin(url.origin)) {
    throw new Error("A2A_PUSH_BEARER_NOT_CONFIGURED");
  }
  return url;
}

export function publicA2APushConfig(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    url: String(row.callback_url),
    authentication:
      Array.isArray(row.auth_schemes) && row.auth_schemes.length
        ? { schemes: row.auth_schemes.map(String) }
        : undefined,
    token: row.token_hash ? "***" : undefined,
  };
}

export async function deliverA2ATaskPush(input: {
  principalId: string;
  taskId: string;
  configId: string;
  config: A2APushConfig;
  streamResponse: Record<string, unknown>;
}) {
  const url = validateA2APushConfig(input.config);
  const bearer = a2aPushBearerForOrigin(url.origin);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "x-geomacro-a2a-delivery": "task-update",
    "x-geomacro-a2a-body-sha256": createHash("sha256")
      .update(JSON.stringify(input.streamResponse))
      .digest("hex"),
  };
  if (input.config.token) headers["x-a2a-notification-token"] = input.config.token;
  if (bearer) headers.authorization = `Bearer ${bearer}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const started = performance.now();
    try {
      const response = await secureA2AFetch(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify(input.streamResponse),
        },
        { timeoutMs: 2_500, expectedOrigin: url.origin },
      );
      const latency = Math.round(performance.now() - started);
      if (response.ok) {
        await recordA2APushDelivery({
          principalId: input.principalId,
          taskId: input.taskId,
          configId: input.configId,
          attempt,
          status: "delivered",
          httpStatus: response.status,
          latencyMs: latency,
        });
        return { delivered: true as const, http_status: response.status, attempts: attempt };
      }
      lastError = new Error(`A2A_PUSH_HTTP_${response.status}`);
      await recordA2APushDelivery({
        principalId: input.principalId,
        taskId: input.taskId,
        configId: input.configId,
        attempt,
        status: "failed",
        httpStatus: response.status,
        latencyMs: latency,
        errorClass: "HTTP_ERROR",
      });
    } catch (error) {
      lastError = error;
      await recordA2APushDelivery({
        principalId: input.principalId,
        taskId: input.taskId,
        configId: input.configId,
        attempt,
        status: "failed",
        latencyMs: Math.round(performance.now() - started),
        errorClass: error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN_ERROR",
      }).catch(() => undefined);
    }
    if (attempt < 3) await sleep(150 * 2 ** (attempt - 1));
  }
  console.warn("[a2a-push] delivery failed", lastError instanceof Error ? lastError.message : lastError);
  return { delivered: false as const, attempts: 3 };
}
