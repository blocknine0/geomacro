import { createHash, randomUUID } from "node:crypto";

import { requireRiskSupabase } from "./risk-supabase.server";
import type { A2AMessage, A2APushConfig, A2ATaskState } from "./a2a-contract";

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function encodePageToken(offset: number) {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodePageToken(value?: string) {
  if (!value) return 0;
  try {
    const parsed = Number(Buffer.from(value, "base64url").toString("utf8"));
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100_000) return 0;
    return parsed;
  } catch {
    return 0;
  }
}

export type A2AStoredTask = {
  id: string;
  principal_id: string;
  context_id: string;
  client_message_id: string;
  state: A2ATaskState;
  request_sha256: string;
  request_payload: Record<string, unknown>;
  task_payload: Record<string, unknown> | null;
  history: A2AMessage[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  canceled_at: string | null;
};

export async function findA2ATaskByMessage(input: { principalId: string; messageId: string }) {
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_tasks")
    .select("*")
    .eq("principal_id", input.principalId)
    .eq("client_message_id", input.messageId)
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data as A2AStoredTask | null) ?? null;
}

export async function createA2ATask(input: {
  principalId: string;
  message: A2AMessage;
  requestPayload: Record<string, unknown>;
}) {
  const db = requireRiskSupabase();
  const existing = await findA2ATaskByMessage({ principalId: input.principalId, messageId: input.message.messageId });
  const requestHash = sha256(input.requestPayload);
  if (existing) {
    if (existing.request_sha256 !== requestHash) throw new Error("A2A_MESSAGE_ID_CONFLICT");
    return { task: existing, replay: true as const };
  }

  const taskId = `a2a_${randomUUID()}`;
  const contextId = input.message.contextId?.trim() || `ctx_${randomUUID()}`;
  const now = new Date().toISOString();
  const row = {
    id: taskId,
    principal_id: input.principalId,
    context_id: contextId,
    client_message_id: input.message.messageId,
    state: "TASK_STATE_SUBMITTED",
    request_sha256: requestHash,
    request_payload: input.requestPayload,
    task_payload: null,
    history: [input.message],
    created_at: now,
    updated_at: now,
  };
  const inserted = await db.from("a2a_tasks").insert(row).select("*").single();
  if (inserted.error) {
    const race = await findA2ATaskByMessage({ principalId: input.principalId, messageId: input.message.messageId });
    if (race?.request_sha256 === requestHash) return { task: race, replay: true as const };
    throw inserted.error;
  }
  await appendA2ATaskEvent({
    taskId,
    principalId: input.principalId,
    eventType: "TASK_CREATED",
    state: "TASK_STATE_SUBMITTED",
    payload: input.requestPayload,
  });
  return { task: inserted.data as A2AStoredTask, replay: false as const };
}

export async function appendA2ATaskEvent(input: {
  taskId: string;
  principalId: string;
  eventType: string;
  state: A2ATaskState;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const db = requireRiskSupabase();
  const result = await db.from("a2a_task_events").insert({
    task_id: input.taskId,
    principal_id: input.principalId,
    event_type: input.eventType,
    state: input.state,
    payload_sha256: input.payload === undefined ? null : sha256(input.payload),
    metadata: input.metadata ?? {},
  });
  if (result.error) throw result.error;
}

export async function transitionA2ATask(input: {
  taskId: string;
  principalId: string;
  state: A2ATaskState;
  taskPayload?: Record<string, unknown> | null;
  appendHistory?: A2AMessage;
  eventType: string;
}) {
  const db = requireRiskSupabase();
  const current = await getA2ATask({ taskId: input.taskId, principalId: input.principalId });
  if (!current) throw new Error("A2A_TASK_NOT_FOUND");
  const history = input.appendHistory ? [...(current.history ?? []), input.appendHistory] : current.history ?? [];
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { state: input.state, updated_at: now, history };
  if (input.taskPayload !== undefined) update.task_payload = input.taskPayload;
  if (["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_REJECTED"].includes(input.state)) {
    update.completed_at = now;
  }
  if (input.state === "TASK_STATE_CANCELED") update.canceled_at = now;

  const result = await db
    .from("a2a_tasks")
    .update(update)
    .eq("id", input.taskId)
    .eq("principal_id", input.principalId)
    .select("*")
    .single();
  if (result.error) throw result.error;
  await appendA2ATaskEvent({
    taskId: input.taskId,
    principalId: input.principalId,
    eventType: input.eventType,
    state: input.state,
    payload: input.taskPayload,
  });
  return result.data as A2AStoredTask;
}

export async function getA2ATask(input: { taskId: string; principalId: string }) {
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_tasks")
    .select("*")
    .eq("id", input.taskId)
    .eq("principal_id", input.principalId)
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data as A2AStoredTask | null) ?? null;
}

export async function listA2ATasks(input: {
  principalId: string;
  pageSize: number;
  pageToken?: string;
  contextId?: string;
  state?: A2ATaskState;
}) {
  const db = requireRiskSupabase();
  const offset = decodePageToken(input.pageToken);
  let query = db
    .from("a2a_tasks")
    .select("*")
    .eq("principal_id", input.principalId)
    .order("created_at", { ascending: false });
  if (input.contextId) query = query.eq("context_id", input.contextId);
  if (input.state) query = query.eq("state", input.state);
  const result = await query.range(offset, offset + input.pageSize);
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as A2AStoredTask[];
  const hasMore = rows.length > input.pageSize;
  return {
    tasks: rows.slice(0, input.pageSize),
    nextPageToken: hasMore ? encodePageToken(offset + input.pageSize) : null,
  };
}

export async function cancelA2ATask(input: { taskId: string; principalId: string }) {
  const current = await getA2ATask(input);
  if (!current) return { code: "NOT_FOUND" as const, task: null };
  if (["TASK_STATE_COMPLETED", "TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED"].includes(current.state)) {
    return { code: "NOT_CANCELABLE" as const, task: current };
  }
  const task = await transitionA2ATask({
    ...input,
    state: "TASK_STATE_CANCELED",
    eventType: "TASK_CANCELED",
  });
  return { code: "CANCELED" as const, task };
}

export async function createA2APushConfig(input: {
  principalId: string;
  taskId: string;
  config: A2APushConfig;
  callbackOrigin: string;
}) {
  const db = requireRiskSupabase();
  // IDs are always server-generated. A client-provided id must never be able to
  // select or overwrite another principal's callback row under service-role DB access.
  const id = `a2apush_${randomUUID()}`;
  const tokenHash = input.config.token
    ? createHash("sha256").update(input.config.token).digest("hex")
    : null;
  const authSchemes = input.config.authentication?.schemes ?? [];
  const result = await db
    .from("a2a_push_notification_configs")
    .insert({
      id,
      task_id: input.taskId,
      principal_id: input.principalId,
      callback_url: input.config.url,
      callback_origin: input.callbackOrigin,
      token_hash: tokenHash,
      auth_schemes: authSchemes,
    })
    .select("*")
    .single();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown>;
}

export async function listA2APushConfigs(input: { principalId: string; taskId: string }) {
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_push_notification_configs")
    .select("*")
    .eq("principal_id", input.principalId)
    .eq("task_id", input.taskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  return (result.data ?? []) as Array<Record<string, unknown>>;
}

export async function getA2APushConfig(input: { principalId: string; taskId: string; id?: string }) {
  const configs = await listA2APushConfigs(input);
  if (input.id) return configs.find((row) => String(row.id) === input.id) ?? null;
  return configs[0] ?? null;
}

export async function deleteA2APushConfig(input: { principalId: string; taskId: string; id: string }) {
  const db = requireRiskSupabase();
  const result = await db
    .from("a2a_push_notification_configs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("task_id", input.taskId)
    .eq("principal_id", input.principalId)
    .is("deleted_at", null);
  if (result.error) throw result.error;
}

export async function recordA2APushDelivery(input: {
  principalId: string;
  taskId: string;
  configId: string;
  attempt: number;
  status: "delivered" | "failed";
  httpStatus?: number | null;
  latencyMs?: number | null;
  errorClass?: string | null;
}) {
  const db = requireRiskSupabase();
  const result = await db.from("a2a_push_delivery_events").insert({
    principal_id: input.principalId,
    task_id: input.taskId,
    config_id: input.configId,
    attempt: input.attempt,
    status: input.status,
    http_status: input.httpStatus ?? null,
    latency_ms: input.latencyMs ?? null,
    error_class: input.errorClass ?? null,
  });
  if (result.error) throw result.error;
}

export async function recordA2AOutboundInteraction(input: {
  remoteOrigin: string;
  remoteAgentName?: string | null;
  remoteCardSha256: string;
  localMessageId: string;
  remoteTaskId?: string | null;
  status: string;
  responseSha256?: string | null;
}) {
  const db = requireRiskSupabase();
  const result = await db.from("a2a_outbound_interactions").insert({
    remote_origin: input.remoteOrigin,
    remote_agent_name: input.remoteAgentName ?? null,
    remote_card_sha256: input.remoteCardSha256,
    local_message_id: input.localMessageId,
    remote_task_id: input.remoteTaskId ?? null,
    status: input.status,
    response_sha256: input.responseSha256 ?? null,
  });
  if (result.error) throw result.error;
}
