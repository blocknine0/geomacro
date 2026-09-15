import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  GEOMACRO_A2A_PROTOCOL_VERSION,
  a2aTaskPayloadSchema,
  geomacroA2AManifest,
} from "./a2a-contract";
import { createGeomacroSignedEnvelope } from "./a2a-signing.server";
import { createOutboundA2ATask } from "./a2a-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const remoteManifestSchema = z.object({
  protocol_version: z.literal(GEOMACRO_A2A_PROTOCOL_VERSION),
  agent: z.object({ id: z.string().min(1).max(128) }),
  endpoint: z.string().url().optional(),
  endpoints: z
    .object({
      negotiate: z.string().url().optional(),
      tasks: z.string().url().optional(),
      status: z.string().url().optional(),
      callback: z.string().url().optional(),
    })
    .optional(),
  capabilities: z.array(z.object({ id: z.string() })).min(1),
  payment_modes: z.array(z.string()).default([]),
});

function remoteHostAllowlist() {
  return new Set(
    String(process.env.GEOMACRO_A2A_REMOTE_HOST_ALLOWLIST ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function safeRemoteUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Remote A2A URL must be credential-free HTTPS");
  }
  const allowed = remoteHostAllowlist();
  if (allowed.size === 0 || !allowed.has(url.hostname.toLowerCase())) {
    throw new Error("Remote A2A host is not allowlisted");
  }
  return url;
}

async function fetchJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 1024) };
  }
  return { response, body };
}

export async function discoverRemoteA2A(baseUrl: string) {
  const base = safeRemoteUrl(baseUrl);
  const discovery = new URL("/.well-known/geomacro-a2a.json", base);
  safeRemoteUrl(discovery.toString());
  const { response, body } = await fetchJson(discovery);
  if (!response.ok) throw new Error(`Remote A2A discovery failed with HTTP ${response.status}`);
  return remoteManifestSchema.parse(body);
}

export async function negotiateRemoteA2A(input: {
  baseUrl: string;
  callbackUrl?: string;
  paymentModes?: Array<"commercial_credit" | "x402_testnet">;
}) {
  const manifest = await discoverRemoteA2A(input.baseUrl);
  const endpoint = safeRemoteUrl(manifest.endpoint ?? manifest.endpoints?.negotiate ?? input.baseUrl);
  const envelope = createGeomacroSignedEnvelope({
    desired_capabilities: ["risk_preflight"],
    payment_modes: input.paymentModes ?? ["commercial_credit", "x402_testnet"],
    transports: input.callbackUrl ? ["poll", "callback"] : ["poll"],
    ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
  });
  const { response, body } = await fetchJson(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "negotiate", envelope }),
  });
  if (!response.ok) throw new Error(`Remote A2A negotiation failed with HTTP ${response.status}`);
  return { manifest, response: body };
}

export async function dispatchRemoteA2ATask(input: {
  baseUrl: string;
  externalTaskId?: string;
  paymentMode: "commercial_credit" | "x402_testnet";
  taskInput: unknown;
  callbackUrl?: string;
  authorization?: string;
}) {
  const manifest = await discoverRemoteA2A(input.baseUrl);
  const endpoint = safeRemoteUrl(manifest.endpoint ?? manifest.endpoints?.tasks ?? input.baseUrl);
  const externalTaskId = input.externalTaskId ?? `geomacro-${randomUUID()}`;
  const payload = a2aTaskPayloadSchema.parse({
    external_task_id: externalTaskId,
    capability: "risk_preflight",
    payment_mode: input.paymentMode,
    input: input.taskInput,
    ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
  });
  const localTask = await createOutboundA2ATask({
    remoteAgentId: manifest.agent.id,
    externalTaskId,
    capability: "risk_preflight",
    paymentMode: input.paymentMode,
    requestPayload: payload,
  });
  const envelope = createGeomacroSignedEnvelope(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.authorization) headers.authorization = input.authorization;
  const { response, body } = await fetchJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ operation: "submit_task", envelope }),
  });

  const db = requireRiskSupabase();
  if (response.status === 402) {
    await db.from("a2a_tasks").update({ status: "payment_required" }).eq("id", localTask.id);
    return {
      ok: false as const,
      payment_required: true as const,
      task_id: localTask.id,
      remote_agent_id: manifest.agent.id,
      remote_response: body,
      payment_required_header: response.headers.get("PAYMENT-REQUIRED"),
      note: "Geomacro does not custody wallets or auto-sign outbound x402 payments. A separate authorized payer must satisfy the quote and retry.",
      execution_authorized: false as const,
    };
  }

  if (!response.ok) {
    await db.from("a2a_tasks").update({ status: "failed", error_code: "REMOTE_A2A_FAILED", error_message: `HTTP ${response.status}`, completed_at: new Date().toISOString() }).eq("id", localTask.id);
    throw new Error(`Remote A2A task failed with HTTP ${response.status}`);
  }

  await db.from("a2a_tasks").update({ status: "processing" }).eq("id", localTask.id);
  return {
    ok: true as const,
    task_id: localTask.id,
    remote_agent_id: manifest.agent.id,
    remote_response: body,
    execution_authorized: false as const,
  };
}

export function localGeomacroA2AManifest() {
  return geomacroA2AManifest();
}
