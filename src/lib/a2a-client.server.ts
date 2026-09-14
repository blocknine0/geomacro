import { createHash, randomUUID } from "node:crypto";

import { A2A_PROTOCOL_VERSION } from "./a2a-contract";
import {
  a2aRemoteAllowedOrigins,
  a2aRemoteBearerForOrigin,
  secureA2AFetch,
  validateA2AEndpointUrl,
} from "./a2a-security.server";
import { recordA2AOutboundInteraction } from "./a2a-store.server";

const TERMINAL = new Set([
  "TASK_STATE_COMPLETED",
  "TASK_STATE_FAILED",
  "TASK_STATE_CANCELED",
  "TASK_STATE_REJECTED",
]);

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function asObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A2A_REMOTE_INVALID_RESPONSE");
  }
  return value as Record<string, any>;
}

export async function discoverA2AAgent(remoteOrigin: string) {
  const originUrl = validateA2AEndpointUrl(remoteOrigin, a2aRemoteAllowedOrigins());
  const cardUrl = new URL("/.well-known/agent-card.json", originUrl.origin);
  const response = await secureA2AFetch(
    cardUrl,
    { headers: { accept: "application/json" } },
    { timeoutMs: 4_000, expectedOrigin: originUrl.origin },
  );
  if (!response.ok) throw new Error(`A2A_REMOTE_CARD_HTTP_${response.status}`);
  const card = asObject(await response.json());
  const interfaces = Array.isArray(card.supportedInterfaces) ? card.supportedInterfaces : [];
  const selected = interfaces.find((item) => {
    const row = asObject(item);
    return row.protocolBinding === "JSONRPC" && row.protocolVersion === A2A_PROTOCOL_VERSION;
  });
  if (!selected) throw new Error("A2A_REMOTE_JSONRPC_V1_NOT_SUPPORTED");
  const interfaceUrl = validateA2AEndpointUrl(String(asObject(selected).url ?? ""), a2aRemoteAllowedOrigins());
  if (interfaceUrl.origin !== originUrl.origin) throw new Error("A2A_REMOTE_CARD_CROSS_ORIGIN_INTERFACE_FORBIDDEN");
  return {
    card,
    cardSha256: sha256(card),
    origin: originUrl.origin,
    interfaceUrl,
  };
}

async function callRemote(input: {
  url: URL;
  origin: string;
  method: string;
  params?: unknown;
  requestId: string;
}) {
  const bearer = a2aRemoteBearerForOrigin(input.origin);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "a2a-version": A2A_PROTOCOL_VERSION,
  };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const response = await secureA2AFetch(
    input.url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: input.requestId,
        method: input.method,
        ...(input.params === undefined ? {} : { params: input.params }),
      }),
    },
    { timeoutMs: 8_000, expectedOrigin: input.origin },
  );
  const paymentRequired = response.headers.get("PAYMENT-REQUIRED");
  if (response.status === 402) {
    throw new Error(`A2A_REMOTE_PAYMENT_REQUIRED:${paymentRequired ?? "missing-payment-requirement"}`);
  }
  const body = asObject(await response.json().catch(() => null));
  if (!response.ok || body.error) {
    throw new Error(`A2A_REMOTE_ERROR:${JSON.stringify(body.error ?? { status: response.status }).slice(0, 800)}`);
  }
  return asObject(body.result);
}

export async function sendA2ARiskPreflight(input: {
  remoteOrigin: string;
  riskPreflight: {
    subject:
      | { type: "country"; country_iso3: string }
      | { type: "corridor"; origin_country_iso3: string; destination_country_iso3: string };
    policy_preset?: "balanced" | "cautious" | "strict";
    action_type?: "treasury_payment" | "vendor_payment" | "agent_payment" | "exposure_review";
    amount_usdc?: number;
    client_request_id?: string;
  };
  contextId?: string;
  timeoutMs?: number;
}) {
  const discovered = await discoverA2AAgent(input.remoteOrigin);
  const messageId = `msg_${randomUUID()}`;
  let remoteTaskId: string | null = null;
  try {
    const result = await callRemote({
      url: discovered.interfaceUrl,
      origin: discovered.origin,
      method: "SendMessage",
      requestId: `rpc_${randomUUID()}`,
      params: {
        message: {
          role: "ROLE_USER",
          messageId,
          ...(input.contextId ? { contextId: input.contextId } : {}),
          parts: [
            {
              mediaType: "application/json",
              data: {
                skill: "risk_preflight",
                policy_preset: "balanced",
                action_type: "agent_payment",
                ...input.riskPreflight,
              },
            },
          ],
        },
        configuration: {
          acceptedOutputModes: ["application/json"],
          historyLength: 2,
        },
      },
    });

    if (result.message) {
      await recordA2AOutboundInteraction({
        remoteOrigin: discovered.origin,
        remoteAgentName: String(discovered.card.name ?? "") || null,
        remoteCardSha256: discovered.cardSha256,
        localMessageId: messageId,
        status: "message_completed",
        responseSha256: sha256(result.message),
      });
      return result;
    }

    let task = asObject(result.task);
    remoteTaskId = String(task.id ?? "") || null;
    if (!remoteTaskId) throw new Error("A2A_REMOTE_TASK_ID_MISSING");

    const deadline = Date.now() + Math.min(Math.max(input.timeoutMs ?? 12_000, 1_000), 60_000);
    while (!TERMINAL.has(String(asObject(task.status).state ?? ""))) {
      if (Date.now() >= deadline) throw new Error("A2A_REMOTE_TASK_TIMEOUT");
      await new Promise((resolve) => setTimeout(resolve, 400));
      task = asObject(
        await callRemote({
          url: discovered.interfaceUrl,
          origin: discovered.origin,
          method: "GetTask",
          requestId: `rpc_${randomUUID()}`,
          params: { id: remoteTaskId, historyLength: 2 },
        }),
      );
    }

    const state = String(asObject(task.status).state ?? "");
    await recordA2AOutboundInteraction({
      remoteOrigin: discovered.origin,
      remoteAgentName: String(discovered.card.name ?? "") || null,
      remoteCardSha256: discovered.cardSha256,
      localMessageId: messageId,
      remoteTaskId,
      status: state,
      responseSha256: sha256(task),
    });
    if (state !== "TASK_STATE_COMPLETED") throw new Error(`A2A_REMOTE_TASK_${state}`);
    return { task };
  } catch (error) {
    await recordA2AOutboundInteraction({
      remoteOrigin: discovered.origin,
      remoteAgentName: String(discovered.card.name ?? "") || null,
      remoteCardSha256: discovered.cardSha256,
      localMessageId: messageId,
      remoteTaskId,
      status: "failed",
      responseSha256: null,
    }).catch(() => undefined);
    throw error;
  }
}
